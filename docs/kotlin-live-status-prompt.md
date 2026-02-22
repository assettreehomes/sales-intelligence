# Prompt for Kotlin Implementation: Live Status Enhancements

**Context for the LLM / Developer:**
We have recently updated the backend API for the `sales-intelligence` dashboard to support a "Live Status" feature for admins. The admin dashboard now shows whether an employee is actively recording a ticket, what ticket they are working on, and their device's battery level. 

Your objective is to update the Kotlin Android app to send this telemetry data to the backend via the existing `POST /employee/heartbeat` endpoint.

Below are the exact requirements and code snippets to implement.

---

## 1. Update the API Contract

The `POST /employee/heartbeat` endpoint has been expanded. It previously only took an `is_online` boolean (or empty body). It now accepts several new fields.

**Update the `HeartbeatRequest` data class in Kotlin to match this JSON structure:**
```json
{
  "is_online": true,
  "is_recording": true,
  "current_client_id": "CLIENT_ID_STRING",
  "current_ticket_id": "UUID_STRING",
  "battery_level": 85
}
```

**Kotlin Code:**
```kotlin
data class HeartbeatRequest(
    val is_online: Boolean = true,
    val is_recording: Boolean = false,
    val current_client_id: String? = null,
    val current_ticket_id: String? = null,
    val battery_level: Int? = null           // 0–100 %
)
```

---

## 2. Implement Battery Level Retrieval

The admin dashboard needs to display the employee's current battery level. Use Android's `BatteryManager` to read the battery capacity. **No special permissions are required for this.**

**Add this utility function:**
```kotlin
import android.content.Context
import android.os.BatteryManager

/** Read device battery % (0-100). Returns null if unavailable. */
fun getBatteryLevel(context: Context): Int? {
    return try {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        if (level in 0..100) level else null
    } catch (e: Exception) {
        null
    }
}
```

---

## 3. Update the `HeartbeatManager`

The `HeartbeatManager` is responsible for sending the background heartbeat every 30 seconds. It needs to be updated to capture the dynamic state (recording status, active ticket, battery) at the exact moment the heartbeat is sent.

**Requirements for `HeartbeatManager`:**
1. It must accept lambdas/providers for the dynamic values (`isRecording`, `getCurrentClientId`, `getCurrentTicketId`) so it always reads the *current* state.
2. It needs a `Context` to read the battery level.
3. **CRITICAL:** It must expose a `nudge()` method to send an *immediate* heartbeat, bypassing the 30-second delay.

**Example Implementation:**
```kotlin
class HeartbeatManager(
    private val context: Context,
    private val api: ApiService,
    private val getToken: suspend () -> String?,
    private val isRecording: () -> Boolean = { false },
    private val getCurrentClientId: () -> String? = { null },
    private val getCurrentTicketId: () -> String? = { null }
) {
    private var job: Job? = null

    // Call from MainActivity.onResume()
    fun start(scope: CoroutineScope) {
        job?.cancel()
        job = scope.launch {
            while (isActive) {
                beat()
                delay(30_000L) // Normal 30s interval
            }
        }
    }

    // Call from MainActivity.onPause()
    fun stop() { job?.cancel() }

    /** 
     * Call immediately when recording starts/stops — don't wait for the next 30s tick.
     * This pushes the UI state change instantly to the admin dashboard.
     */
    fun nudge(scope: CoroutineScope) {
        scope.launch { beat() }
    }

    private suspend fun beat() {
        val token = getToken() ?: return
        runCatching {
            api.sendHeartbeat(
                token = "Bearer $token",
                body = HeartbeatRequest(
                    is_online = true,
                    is_recording = isRecording(),
                    current_client_id = getCurrentClientId(),
                    current_ticket_id = getCurrentTicketId(),
                    battery_level = getBatteryLevel(context)
                )
            )
        }
        // Silent fail — a heartbeat failure must never crash the app
    }
}
```

---

## 4. Integrate State Changes (The Recording Flow)

This is the most critical operational change. 
When an employee taps **"Start Recording"** on a draft ticket or a new ticket, the admin dashboard must immediately show them as "Recording" (flashing red indicator) and denote *which* ticket they are working on.

When you instantiate the `HeartbeatManager` (e.g., in `MainActivity`), wire it up to your `RecordingViewModel` or global state.

```kotlin
// In MainActivity or App-level scope:
val heartbeatManager = HeartbeatManager(
    context = applicationContext,
    api = retrofitApi,
    getToken = { prefs.getAccessToken() },
    isRecording = { recordingViewModel.isRecording.value },
    getCurrentTicketId = { recordingViewModel.currentTicketId.value },
    getCurrentClientId = { recordingViewModel.currentClientId.value }
)
```

### The "Nudge" Workflow
When the user clicks the record button and `MediaRecorder.start()` is successfully called, you must immediately update your state and explicitly trigger a heartbeat nudge.

**Example inside `RecordingViewModel` or Fragment:**
```kotlin
fun startRecording(ticketId: String, clientId: String) {
    // 1. Setup MediaRecorder
    mediaRecorder.start()
    
    // 2. Update local state
    _isRecording.value = true
    _currentTicketId.value = ticketId
    _currentClientId.value = clientId
    
    // 3. Immediately send heartbeat to backend to turn the admin indicator Red
    heartbeatManager.nudge(viewModelScope)
}

fun stopRecording() {
    // 1. Stop MediaRecorder
    mediaRecorder.stop()
    
    // 2. Update local state
    _isRecording.value = false
    _currentTicketId.value = null
    _currentClientId.value = null
    
    // 3. Immediately send heartbeat to return admin indicator to "Idle"
    heartbeatManager.nudge(viewModelScope)
}
```

### Verification
If implemented correctly:
1. Every 30 seconds, the battery level on the admin page will refresh.
2. The split-second an employee starts an audio recording, the admin page card will drop the "Idle" tag, say "Recording", flash a red dot, and attach the exact Draft Ticket name to the row. When stopped, it returns to Idle.
