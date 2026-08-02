# Mobile App FCM Integration Guide

## Current Mobile App Understanding

### App Overview
- **Package**: `com.ath.intelligence`
- **Type**: Native Kotlin Android app
- **Architecture**: Jetpack Compose + Retrofit + WorkManager + Room
- **Base URL**: `https://sales-intelligence-123251903795.asia-south1.run.app/`

### What Already Exists
| Feature | Status | Location |
|---------|--------|----------|
| POST_NOTIFICATIONS permission | ✅ In AndroidManifest.xml | `AndroidManifest.xml:7` |
| Local notification UI | ✅ NotificationHelper.kt | `utils/NotificationHelper.kt` |
| draft_id intent handling | ✅ MainActivity handles `draft_id` + `action` extras | `MainActivity.kt:159-175` |
| Draft navigation (notification tap → app) | ✅ Navigates to recording screen with draftId | `MainActivity.kt:392` |
| DraftAssignmentWorker (polling every 15 min) | ✅ Background worker checks for new drafts | `workers/DraftAssignmentWorker.kt` |
| Notification channels (`draft_reminders`) | ✅ Already created | `NotificationHelper.kt:15` |
| google-services.json | ✅ Already in `mobile app/` directory | `mobile app/google-services.json` |

### What Is Missing
| Feature | Status | Needed |
|---------|--------|--------|
| Firebase Messaging dependency | ❌ Not in build.gradle | ✅ Add |
| Google Services Gradle plugin | ❌ Not in build.gradle | ✅ Add |
| FirebaseMessagingService subclass | ❌ Not present | ✅ Add |
| FCM token retrieval & registration | ❌ Not present | ✅ Add |
| FCM token unregistration on logout | ❌ Not present | ✅ Add |
| FCM message handling (data payload) | ❌ Not present | ✅ Add |
| Separate notification channel for FCM assignments | ❌ `draft_reminders` is for alarms (silent) | ✅ Create `assignment_push` channel |

### Critical Design Decision: Data-Only FCM Payloads

The backend must send assignment FCM messages as **data-only** (no `notification` key). This is required because:

1. **`draft_reminders` channel is silent** — it was designed for scheduled recording alarms with sound/vibration deliberately disabled. Using it for new assignments means the push arrives silently.
2. **Android handles notification messages itself in background** — when the app is backgrounded, the system displays the notification directly. The app's `FcmMessagingService.onMessageReceived()` is NOT called. The app cannot record that the notification was shown.
3. **Duplicate prevention** — because the app cannot know a notification was displayed in background, the 15-minute `DraftAssignmentWorker` will later think it is a new draft and show a duplicate alert.

The fix separates the two concerns:
- `draft_reminders` channel: unchanged, for scheduled recording alarms only (silent).
- `assignment_push` channel: new, with normal sound/vibration, for FCM assignment notifications.
- Backend sends data-only payloads for assignments. The app's `FcmMessagingService` displays the notification on `assignment_push` and marks the draft as known, preventing the polling worker from showing a duplicate.

---

## Required Mobile App Changes

### 1. Add Firebase Messaging Dependency and Google Services Plugin

**File**: `android/app/build.gradle.kts`

Add to the `dependencies` block:

```kotlin
// Firebase Cloud Messaging
implementation("com.google.firebase:firebase-messaging:23.4.0")
```

Add the Google Services plugin to the `plugins` block:

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
    id("com.google.gms.google-services")  // <-- ADD THIS
}
```

**File**: `android/build.gradle.kts`

Add the Google Services Gradle plugin:

```kotlin
plugins {
    id("com.android.application") version "8.2.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.0" apply false
    id("com.google.devtools.ksp") version "1.9.0-1.0.13" apply false
    id("com.google.gms.google-services") version "4.4.0" apply false  // <-- ADD THIS
}
```

The `google-services.json` is already present in `mobile app/google-services.json` with the correct package name `com.ath.intelligence` and project `mystical-melody-486113-p0`. It must be placed at `android/app/google-services.json` during the Android build.

---

### 2. Create FCM Token Registration Service

**New file**: `android/app/src/main/java/com/ath/intelligence/services/FcmTokenService.kt`

This service:
- Retrieves the FCM registration token from Firebase
- Sends it to the backend via `PUT /devices/fcm-token`
- Handles token refresh (Firebase rotates tokens)
- Sends the token on app startup and after login

```kotlin
package com.ath.intelligence.services

import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object FcmTokenService {
    private const val TAG = "FcmTokenService"
    private const val PREFS_NAME = "fcm_prefs"
    private const val KEY_INSTALLATION_ID = "installation_id"

    /**
     * Retrieve the FCM token and register it with the backend.
     * Call this after the user is logged in and authenticated.
     */
    suspend fun registerTokenWithBackend(context: Context) {
        withContext(Dispatchers.IO) {
            try {
                val token = FirebaseMessaging.getInstance().token.await()
                if (token == null) {
                    Log.e(TAG, "FCM token is null")
                    return@withContext
                }
                Log.d(TAG, "FCM token retrieved")
                sendTokenToBackend(context, token)
            } catch (e: Exception) {
                Log.e(TAG, "Error getting FCM token", e)
            }
        }
    }

    private suspend fun sendTokenToBackend(context: Context, token: String) {
        withContext(Dispatchers.IO) {
            try {
                val installationId = getInstallationId(context)
                val appVersion = com.ath.intelligence.BuildConfig.VERSION_NAME

                val request = FcmTokenRequest(
                    installationId = installationId,
                    token = token,
                    appVersion = appVersion
                )

                val response = RetrofitClient.apiService.registerFcmToken(request)
                if (response.isSuccessful) {
                    Log.d(TAG, "FCM token registered with backend")
                } else {
                    Log.w(TAG, "Failed to register FCM token: ${response.code()}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error sending FCM token to backend", e)
                // Non-fatal: token registration failure should not block the app
            }
        }
    }

    /**
     * Get or generate a unique installation ID for this Android installation.
     * Persists across app restarts but changes on reinstall.
     */
    fun getInstallationId(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_INSTALLATION_ID, null) ?: run {
            val newId = java.util.UUID.randomUUID().toString()
            prefs.edit().putString(KEY_INSTALLATION_ID, newId).apply()
            newId
        }
    }
}
```

---

### 3. Create FCM Message Handler Service

**New file**: `android/app/src/main/java/com/ath/intelligence/services/FcmMessagingService.kt`

This service handles incoming FCM messages and shows notifications or navigates to drafts.

```kotlin
package com.ath.intelligence.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.ath.intelligence.MainActivity
import com.ath.intelligence.R

class FcmMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "FcmMessagingService"
        private const val CHANNEL_ID = "assignment_push"
        private const val NOTIFICATION_ID = 200000
    }

    /**
     * Called when the FCM registration token is refreshed.
     * Re-register the new token with the backend.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM token refreshed")
        // The app should call FcmTokenService.registerTokenWithBackend()
        // after the user is logged in. onNewToken is called at any time,
        // so the app should re-register if authenticated.
    }

    /**
     * Called when a data message is received.
     * Data-only messages always come through here, even when the app is in foreground.
     * When the app is in background, Android displays the notification automatically
     * only if a `notification` key is present. Since we send data-only,
     * this method is always called and the app controls the notification display.
     */
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Log.d(TAG, "FCM message received")

        val data = message.data
        if (data.isEmpty()) return

        val draftId = data["draft_id"]
        val action = data["action"]

        if (draftId != null && action == "view_new_assignment") {
            // Mark this draft as known so DraftAssignmentWorker skips it
            markDraftAsKnown(draftId)
            // Show the assignment notification
            showAssignmentNotification(
                title = data["title"] ?: "New task assigned",
                body = data["body"] ?: "A new lead has been assigned to you",
                draftId = draftId
            )
        }
    }

    private fun markDraftAsKnown(draftId: String) {
        val prefs = getSharedPreferences("draft_assignment_prefs", Context.MODE_PRIVATE)
        val knownIds = prefs.getStringSet("known_draft_ids", mutableSetOf())?.toMutableSet()
            ?: mutableSetOf()
        knownIds.add(draftId)
        prefs.edit().putStringSet("known_draft_ids", knownIds).apply()
        Log.d(TAG, "Marked draft $draftId as known to prevent duplicate polling alert")
    }

    private fun showAssignmentNotification(title: String, body: String, draftId: String) {
        createNotificationChannel()

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("draft_id", draftId)
            putExtra("action", "view_new_assignment")
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            draftId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Draft Assignments",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Push notifications for new draft assignments"
                enableVibration(true)
                enableLights(true)
                setBypassDnd(true)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }
}
```

---

### 4. Add API Endpoints for FCM Token Registration

**File**: `android/app/src/main/java/com/ath/intelligence/network/ApiService.kt`

Add the following endpoints:

```kotlin
// FCM Token Registration
@POST("devices/fcm-token")
suspend fun registerFcmToken(
    @Body request: FcmTokenRequest
): Response<FcmTokenResponse>

@POST("devices/fcm-token/unregister")
suspend fun unregisterFcmToken(
    @Body request: FcmTokenUnregisterRequest
): Response<FcmTokenResponse>
```

---

### 5. Add Request/Response Models

**File**: `android/app/src/main/java/com/ath/intelligence/network/ApiModels.kt`

Add the following data classes:

```kotlin
// ============ FCM Token Models ============

data class FcmTokenRequest(
    @SerializedName("installation_id")
    val installationId: String,
    @SerializedName("token")
    val token: String,
    @SerializedName("app_version")
    val appVersion: String? = null
)

data class FcmTokenUnregisterRequest(
    @SerializedName("installation_id")
    val installationId: String
)

data class FcmTokenResponse(
    val success: Boolean,
    val device: FcmDevice? = null,
    val error: String? = null
)

data class FcmDevice(
    val id: String,
    val installation_id: String,
    val platform: String,
    val is_active: Boolean,
    val last_seen_at: String
)
```

---

### 6. Register Token on Login and App Startup

**File**: `android/app/src/main/java/com/ath/intelligence/auth/AuthManager.kt`

In the `login()` method, after successful login and token save, add:

```kotlin
// After saving auth data and setting RetrofitClient.authToken
// Register FCM token with backend
FcmTokenService.registerTokenWithBackend(context)
```

In `ATHApplication.onCreate()`, after session restoration is confirmed, add:

```kotlin
// Register FCM token if user is already logged in
if (sessionRestored) {
    FcmTokenService.registerTokenWithBackend(this)
}
```

---

### 7. Unregister Token on Logout

**File**: `android/app/src/main/java/com/ath/intelligence/auth/AuthManager.kt`

In the `logout()` method, add:

```kotlin
suspend fun logout() {
    try {
        // Unregister FCM token from backend (best-effort, non-blocking)
        FcmTokenService.unregisterTokenFromBackend()
        clearAuthToken()
        RetrofitClient.authToken = null
        Log.d(TAG, "Logout successful")
    } catch (e: Exception) {
        Log.e(TAG, "Logout error", e)
    }
}
```

Add to `FcmTokenService.kt`:

```kotlin
suspend fun unregisterTokenFromBackend() {
    withContext(Dispatchers.IO) {
        try {
            // Need a context reference — use the application context
            val context = com.ath.intelligence.ATHApplication.instance
            val installationId = getInstallationId(context)
            RetrofitClient.apiService.unregisterFcmToken(
                FcmTokenUnregisterRequest(installationId = installationId)
            )
            Log.d(TAG, "FCM token unregistered from backend")
        } catch (e: Exception) {
            Log.e(TAG, "Error unregistering FCM token", e)
            // Non-fatal: backend unregister failure should not block logout
        }
    }
}
```

---

### 8. Handle FCM Data Payload in Notification Tap

**File**: `android/app/src/main/java/com/ath/intelligence/MainActivity.kt`

The `handleIntent()` method already handles `draft_id` and `action` extras. The FCM integration will automatically work because:

- When the user taps an FCM notification, the intent carries `draft_id` and `action` extras
- `MainActivity.handleIntent()` reads these extras and updates `notificationDraftId` / `notificationAction`
- The `DashboardScreen` reads these values and navigates to the recording screen

No changes needed to `MainActivity.kt` for basic FCM navigation. The existing `draft_id` + `action` intent handling already supports the FCM payload format.

---

### 9. Add FCM Service to AndroidManifest.xml

**File**: `android/app/src/main/AndroidManifest.xml`

Add inside the `<application>` tag:

```xml
<!-- Firebase Messaging Service -->
<service
    android:name=".services.FcmMessagingService"
    android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

---

### 10. Create Dedicated Notification Channel for FCM Assignments

The existing `draft_reminders` channel is used for local alarm-based notifications and is intentionally silent. A separate channel is needed for FCM push assignment notifications with normal sound/vibration.

In `NotificationHelper.kt`, add:

```kotlin
private const val FCM_CHANNEL_ID = "assignment_push"
private const val FCM_CHANNEL_NAME = "Draft Assignments"
private const val FCM_CHANNEL_DESCRIPTION = "Push notifications for new draft assignments"

fun createFcmNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(
            FCM_CHANNEL_ID,
            FCM_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = FCM_CHANNEL_DESCRIPTION
            enableVibration(true)
            enableLights(true)
            setBypassDnd(true)
        }
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }
}
```

Call `createFcmNotificationChannel()` in `ATHApplication.onCreate()` alongside the existing `createNotificationChannel()` call.

---

## Integration Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        MOBILE APP                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. App starts → ATHApplication.onCreate()                     │
│     └─→ FcmTokenService.registerTokenWithBackend()             │
│         └─→ FirebaseMessaging.getInstance().getToken()         │
│             └─→ PUT /devices/fcm-token                        │
│                                                                 │
│  2. User logs in → AuthManager.login()                         │
│     └─→ FcmTokenService.registerTokenWithBackend()             │
│                                                                 │
│  3. FCM token refreshes → FcmMessagingService.onNewToken()    │
│     └─→ PUT /devices/fcm-token (upsert)                       │
│                                                                 │
│  4. User logs out → AuthManager.logout()                       │
│     └─→ POST /devices/fcm-token/unregister                    │
│                                                                 │
│  5. FCM data message arrives → FcmMessagingService.onMessageReceived│
│     ├─ App in foreground: show notification on assignment_push │
│     │   channel, mark draft as known                          │
│     └─ App in background: system displays notification         │
│         → tap opens MainActivity with draft_id + action       │
│         → existing draft_id intent handling navigates to draft│
│                                                                 │
│  6. DraftAssignmentWorker runs (every 15 min)                  │
│     └─ Checks known_draft_ids in SharedPreferences             │
│     └─ Skips drafts already shown via FCM                     │
│     └─ No duplicate notification                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Backend API Contract (No Changes Needed)

The mobile app must call these existing backend endpoints:

| Method | Endpoint | Auth | Body | Purpose |
|--------|----------|------|------|---------|
| `PUT` | `/devices/fcm-token` | Employee JWT | `{installation_id, token, app_version}` | Register/refresh FCM token |
| `POST` | `/devices/fcm-token/unregister` | Employee JWT | `{installation_id}` | Deactivate device on logout |

The backend sends FCM messages with this data-only payload for assignments:

```json
{
  "data": {
    "draft_id": "<ticket-id>",
    "action": "view_new_assignment",
    "event_type": "selldo_draft_assignment",
    "assignment_source": "selldo"
  },
  "android": {
    "priority": "high"
  }
}
```

The mobile app does not need to change when the backend adjusts the payload format.

## Testing Checklist

- [ ] App builds successfully with Firebase Messaging dependency and Google Services plugin
- [ ] `google-services.json` is placed at `android/app/google-services.json` during build
- [ ] FCM token is retrieved on app startup after login
- [ ] Token is sent to `PUT /devices/fcm-token` and stored in Supabase `push_devices`
- [ ] Incoming FCM data message shows a notification with sound on `assignment_push` channel
- [ ] Tapping FCM notification opens the app and navigates to the assigned draft
- [ ] FCM token refresh triggers re-registration with backend
- [ ] Logout unregisters the token from backend
- [ ] Existing polling-based DraftAssignmentWorker still works as fallback
- [ ] No duplicate notifications (FCM + polling) for the same assignment
- [ ] `draft_reminders` channel remains unchanged for scheduled recording alarms
