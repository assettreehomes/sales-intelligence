# TicketIntel — Kotlin Mobile API Guide (Employee Flow)

> **Base URL (Production):** `https://sales-intelligence-123251903795.asia-south1.run.app`  
> **Base URL (Local):** `http://10.0.2.2:3001` *(Android emulator → localhost)*  
> All endpoints require `Authorization: Bearer <access_token>` unless stated otherwise.

---

## What's New (This Update)

The following were added/changed specifically for the employee mobile flow:

| # | What | Endpoint | Note |
|---|------|----------|------|
| 1 | **Employee Login** | `POST /auth/login` | No TOTP for employees — gets session directly after CAPTCHA |
| 2 | **Online Heartbeat** | `POST /employee/heartbeat` | Must call every 30 s while app is in foreground |
| 3 | **List Assigned Drafts** | `GET /drafts` | Employee only sees their own drafts |
| 4 | **Start Recording on Draft** | `POST /drafts/:id/start` | Marks draft as `pending` |
| 5 | **Upload Recording** | `POST /tickets/upload` | Multipart audio — can attach to draft OR create new ticket |
| 6 | **Submit Excuse** | `POST /excuses` | Employee submits delay reason for a draft |
| 7 | **View Own Excuses** | `GET /excuses` | Employee sees only their own excuse history |

---

## Employee App Flow

```
Login
  └─► GET /drafts          ← list assigned drafts on home screen
        ├─► POST /drafts/:id/start    ← tap "Start Recording"
        │     └─► POST /tickets/upload   ← submit audio file for the draft
        ├─► POST /excuses             ← can't record now? submit excuse
        └─► POST /tickets/upload      ← (no draft_id) record new ticket directly

Background (while app is alive):
  └─► POST /employee/heartbeat  every 30s
```

---

## 1. Login

> **Employee/Intern login does NOT require 2FA (TOTP).** After passing hCaptcha + password, the session is returned immediately.

---

### Backend API Contract

```
POST /auth/login
Content-Type: application/json
```

**Request body** (all fields required):
```json
{
  "email": "employee@example.com",
  "password": "yourpassword",
  "captchaToken": "P1_eyJ..."  ← token from hCaptcha SDK
}
```

**What the backend does with these fields:**
1. Checks `email` + `password` against Supabase Auth
2. Takes `captchaToken` and POSTs it to `https://api.hcaptcha.com/siteverify` with the server-side secret key — the app never calls this URL directly
3. If captcha is invalid → `400 { "error": "CAPTCHA verification failed. Please try again." }`
4. If password is wrong → `401 { "error": "Invalid email or password" }`
5. If user is not `active` → `403 { "error": "Account is not active. Please contact your administrator." }`
6. If all OK and role is `employee`/`intern` → session returned directly (no 2FA step)

**Success response for employee:**
```json
{
  "success": true,
  "user": {
    "id": "79cb57a4-cf58-4fbc-b78c-17443101cdef",
    "email": "employee@example.com",
    "fullname": "John Doe",
    "role": "employee"
  },
  "session": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "v1.xxxx",
    "expires_at": 1740000000
  }
}
```

> `expires_at` is a **Unix timestamp in seconds**. The access token typically lives for **1 hour**. Use the refresh token to get a new one before it expires.

**All error responses:**

| HTTP | `error` field | Cause |
|------|---------------|-------|
| `400` | `Email and password are required` | Missing fields |
| `400` | `CAPTCHA verification failed. Please try again.` | Bad/expired captcha token |
| `401` | `Invalid email or password` | Wrong credentials |
| `403` | `Account is not active. Please contact your administrator.` | Account disabled by admin |
| `404` | `User not found. Please contact your administrator.` | Email not in system |
| `500` | `Login failed` | Server error |

---

### 1a. hCaptcha Setup

#### Keys

| Key | Value |
|-----|-------|
| **Site Key** (safe to embed in app) | `8076292c-b3b4-41a6-b07a-581aaa322f2e` |
| **Secret Key** | Server-only — stored in Cloud Run as `HCAPTCHA_SECRET_KEY`, never in the app |

The app only ever uses the **Site Key**. The backend uses the Secret Key invisibly to verify the token you send it.

#### Step 1: Add Gradle dependency

```kotlin
// build.gradle.kts (app level)
dependencies {
    implementation("com.hcaptcha:sdk:1.+")
}
```

```groovy
// build.gradle (Groovy DSL)
dependencies {
    implementation 'com.hcaptcha:sdk:1.+'
}
```

Sync Gradle after adding.

#### Step 2: Add internet permission in `AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

#### Step 3: Full Login ViewModel

```kotlin
import com.hcaptcha.sdk.HCaptcha
import com.hcaptcha.sdk.HCaptchaConfig
import com.hcaptcha.sdk.HCaptchaTokenResponse
import com.hcaptcha.sdk.HCaptchaException

const val HCAPTCHA_SITE_KEY = "8076292c-b3b4-41a6-b07a-581aaa322f2e"

class LoginViewModel(
    private val api: ApiService,
    private val prefs: SecurePrefs
) : ViewModel() {

    val loginState = MutableStateFlow<LoginState>(LoginState.Idle)

    /**
     * Entry point — called when user taps "Login".
     * Never call the login API directly; always go through hCaptcha first.
     */
    fun startLogin(activity: FragmentActivity, email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            loginState.value = LoginState.Error("Email and password are required")
            return
        }
        loginState.value = LoginState.LoadingCaptcha

        HCaptcha
            .getClient(activity)
            .setup(HCaptchaConfig.builder().siteKey(HCAPTCHA_SITE_KEY).build())
            .addOnSuccessListener { response: HCaptchaTokenResponse ->
                // response.tokenResult is the "P1_eyJ..." token — send it to backend
                viewModelScope.launch { doLogin(email, password, response.tokenResult) }
            }
            .addOnFailureListener { e: HCaptchaException ->
                loginState.value = LoginState.Error(
                    when (e.statusCode) {
                        29 -> "Challenge expired. Please try again."  // TOKEN_TIMEOUT
                        30 -> "Challenge dismissed. Please try again." // CHALLENGE_CLOSED
                        else -> "CAPTCHA error (${e.statusCode}): ${e.message}"
                    }
                )
            }
            .verifyWithHCaptcha()
    }

    private suspend fun doLogin(email: String, password: String, captchaToken: String) {
        loginState.value = LoginState.LoggingIn
        try {
            // POST /auth/login — captchaToken is verified server-side by the backend,
            // the app never calls hcaptcha.com directly
            val res = api.login(LoginRequest(email.trim().lowercase(), password, captchaToken))
            if (res.success && res.session != null && res.user != null) {
                prefs.saveAccessToken(res.session.access_token)
                prefs.saveRefreshToken(res.session.refresh_token)
                prefs.saveExpiresAt(res.session.expires_at)
                prefs.saveUserId(res.user.id)
                prefs.saveUserRole(res.user.role)
                loginState.value = LoginState.Success(res.user)
            } else {
                loginState.value = LoginState.Error("Login failed — unexpected response")
            }
        } catch (e: retrofit2.HttpException) {
            // Parse the backend's { "error": "..." } JSON body
            val msg = runCatching {
                JSONObject(e.response()?.errorBody()?.string() ?: "{}").getString("error")
            }.getOrDefault("Login failed (${e.code()})")
            loginState.value = LoginState.Error(msg)
        } catch (e: Exception) {
            loginState.value = LoginState.Error("Network error. Check your connection.")
        }
    }
}

sealed class LoginState {
    object Idle : LoginState()
    object LoadingCaptcha : LoginState()
    object LoggingIn : LoginState()
    data class Success(val user: UserInfo) : LoginState()
    data class Error(val message: String) : LoginState()
}
```

#### Step 4: Fragment wiring

```kotlin
// LoginFragment.kt
binding.btnLogin.setOnClickListener {
    viewModel.startLogin(
        activity = requireActivity() as FragmentActivity,
        email    = binding.etEmail.text.toString(),
        password = binding.etPassword.text.toString()
    )
}

viewLifecycleOwner.lifecycleScope.launch {
    viewModel.loginState.collect { state ->
        when (state) {
            LoginState.Idle            -> { binding.btnLogin.isEnabled = true; binding.progressBar.isVisible = false }
            LoginState.LoadingCaptcha  -> { binding.btnLogin.isEnabled = false; binding.tvStatus.text = "Verifying..." }
            LoginState.LoggingIn       -> { binding.tvStatus.text = "Signing in..." }
            is LoginState.Success      -> findNavController().navigate(R.id.action_login_to_drafts)
            is LoginState.Error        -> {
                binding.btnLogin.isEnabled = true
                binding.progressBar.isVisible = false
                binding.tvStatus.text = ""
                Snackbar.make(binding.root, state.message, Snackbar.LENGTH_LONG).show()
            }
        }
    }
}
```

#### Step 5: Retrofit models + interface

```kotlin
data class LoginRequest(
    val email: String,
    val password: String,
    val captchaToken: String   // "P1_eyJ..." string from HCaptchaTokenResponse.tokenResult
)

data class LoginResponse(
    val success: Boolean,
    val user: UserInfo?,
    val session: SessionInfo?,
    val requiresTOTP: Boolean = false  // always false for employee/intern
)

data class UserInfo(
    val id: String,
    val email: String,
    val fullname: String,
    val role: String           // "employee" | "intern"
)

data class SessionInfo(
    val access_token: String,
    val refresh_token: String,
    val expires_at: Long       // Unix seconds — token valid for ~1 hour
)

interface ApiService {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse
}
```

#### Full data flow

```
User fills email + password → taps Login
  │
  ▼
hCaptcha SDK (site key: 8076292c-...)        ← runs entirely on device/hcaptcha.com
  shows checkbox / image puzzle
  │  success
  ▼
HCaptchaTokenResponse.tokenResult = "P1_eyJ..."  ← short-lived one-time token
  │
  ▼
POST /auth/login  { email, password, captchaToken }   ← your backend (Cloud Run)
  │
  ├─► backend calls https://api.hcaptcha.com/siteverify
  │       with { secret: HCAPTCHA_SECRET_KEY, response: captchaToken }
  │       → { success: true }  ✓
  │
  ├─► Supabase signInWithPassword(email, password)
  │       → access_token + refresh_token
  │
  └─► 200 { success, user, session }   ← store tokens, navigate to Drafts
```

> **Invisible mode** (no checkbox unless suspicious):
> ```kotlin
> HCaptchaConfig.builder()
>     .siteKey(HCAPTCHA_SITE_KEY)
>     .size(HCaptchaSize.INVISIBLE)
>     .build()
> ```

---

## 2. Online Heartbeat

Call this every **30 seconds** while the app is in the foreground. The backend upserts a row in the `employee_status` table — admins see this in real-time on the Live Status page. If no heartbeat arrives for **2 minutes**, the backend marks the employee offline automatically.

### Backend API Contract

```
POST /employee/heartbeat
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request body:**
```json
{
  "is_online": true,
  "is_recording": true,
  "current_client_id": "CLIENT001",
  "current_ticket_id": "uuid-of-draft-or-ticket",
  "battery_level": 72
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `is_online` | boolean | No (defaults `true`) | Always send `true` while app is alive |
| `is_recording` | boolean | No (defaults `false`) | `true` while `MediaRecorder` is active |
| `current_client_id` | string\|null | No | Client ID string currently being recorded for |
| `current_ticket_id` | UUID string\|null | **Recommended** | UUID of the draft/ticket being recorded — enables admin to see client name, visit type, and whether it's a draft |
| `battery_level` | int 0–100\|null | **Recommended** | Current device battery % — shown on admin Live Status page |

**Success response:**
```json
{ "success": true }
```

**Error responses:**

| HTTP | Meaning |
|------|---------|
| `401` | Token expired — refresh and retry |
| `500` | DB write failed — retry next interval |

### Kotlin Implementation

```kotlin
data class HeartbeatRequest(
    val is_online: Boolean = true,
    val is_recording: Boolean = false,
    val current_client_id: String? = null,
    val current_ticket_id: String? = null,  // UUID of draft/ticket being recorded — enables admin to see assigned client
    val battery_level: Int? = null           // 0–100; shown on admin Live Status card
)

interface ApiService {
    @POST("employee/heartbeat")
    suspend fun sendHeartbeat(
        @Header("Authorization") token: String,
        @Body body: HeartbeatRequest
    ): HeartbeatResponse
}

data class HeartbeatResponse(val success: Boolean)

/** Read battery % using BatteryManager (no permission required). */
fun getBatteryLevel(context: Context): Int? {
    val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
    val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    return if (level in 0..100) level else null
}

/**
 * Start in MainActivity.onResume() / stop in onPause().
 * Pass lambdas so they always read the current live values.
 */
class HeartbeatManager(
    private val context: Context,
    private val api: ApiService,
    private val getToken: suspend () -> String?,
    private val isRecording: () -> Boolean = { false },
    private val getCurrentClientId: () -> String? = { null },
    private val getCurrentTicketId: () -> String? = { null }  // e.g. { recordingViewModel.currentDraftId.value }
) {
    private var job: Job? = null

    fun start(scope: CoroutineScope) {
        job?.cancel()
        job = scope.launch {
            while (isActive) {
                beat()
                delay(30_000L)
            }
        }
    }

    /** Call immediately when recording starts/stops — don't wait for the next 30s tick. */
    fun nudge(scope: CoroutineScope) {
        scope.launch { beat() }
    }

    fun stop() { job?.cancel() }

    private suspend fun beat() {
        val token = getToken() ?: return
        runCatching {
            api.sendHeartbeat(
                token = "Bearer $token",
                body  = HeartbeatRequest(
                    is_online         = true,
                    is_recording      = isRecording(),
                    current_client_id = getCurrentClientId(),
                    current_ticket_id = getCurrentTicketId(),
                    battery_level     = getBatteryLevel(context)
                )
            )
        }
        // Silent fail — heartbeat error must never crash the app
    }
}
```

### Wiring in MainActivity

```kotlin
class MainActivity : AppCompatActivity() {
    private val heartbeatManager by lazy {
        HeartbeatManager(
            api              = retrofitApi,
            getToken         = { TokenManager.getValidToken(prefs, retrofitApi) },
            isRecording      = { recordingViewModel.isRecording.value },
            getCurrentClientId = { recordingViewModel.currentClientId.value }
        )
    }

    override fun onResume() {
        super.onResume()
        heartbeatManager.start(lifecycleScope)
    }

    override fun onPause() {
        super.onPause()
        heartbeatManager.stop()
        // Optionally send a final is_online=false heartbeat here
    }
}
```

### How it affects the admin Live Status page

```
App running  →  POST /employee/heartbeat every 30s
                  └─► backend upserts employee_status { is_online: true, last_heartbeat: now }

Admin opens Live Status page
  └─► GET /employee/status
        └─► for each employee:
              if last_heartbeat > 2 minutes ago → shown as OFFLINE
              else                              → shown as ONLINE ✓

App backgrounded / killed  →  no more heartbeats
  └─► after 2 minutes: admin sees employee go OFFLINE automatically
```

> **Update `is_recording` immediately**: When `MediaRecorder` starts/stops, call `heartbeatManager.nudge(lifecycleScope)` so the admin sees the recording status update right away without waiting 30 seconds.

---

## 3. List Assigned Drafts

Shows the employee's own pending draft tickets (assigned by admin, not yet recorded).

**Request**
```
GET /drafts
Authorization: Bearer <access_token>
```

**Response**
```json
{
  "drafts": [
    {
      "id": "uuid",
      "client_id": "CLIENT001",
      "client_name": "Sunrise Heights",
      "visit_type": "site_visit",
      "visit_number": 3,
      "notes": "Follow-up on pricing",
      "created_at": "2026-02-19T08:00:00Z",
      "scheduled_time": "2026-02-20T10:00:00Z",
      "expected_recording_time": "2026-02-20T10:00:00Z"
    }
  ]
}
```

**Kotlin**
```kotlin
interface ApiService {
    @GET("drafts")
    suspend fun getDrafts(@Header("Authorization") token: String): DraftsResponse
}

data class DraftsResponse(val drafts: List<Draft>)
data class Draft(
    val id: String,
    val client_id: String?,
    val client_name: String,
    val visit_type: String,
    val visit_number: Int,
    val notes: String?,
    val created_at: String?,
    val scheduled_time: String?,
    val expected_recording_time: String?
)
```

**Visit type labels** (display-friendly):
```kotlin
fun formatVisitType(raw: String) = raw.replace('_', ' ').split(' ')
    .joinToString(" ") { it.replaceFirstChar(Char::uppercase) }
// "site_visit" → "Site Visit"
```

---

## 4. Start Recording on a Draft

Call this when the employee taps "Start Recording" on a draft. Sets status to `pending`.

**Request**
```
POST /drafts/:id/start
Authorization: Bearer <access_token>
```

**Response**
```json
{ "success": true, "message": "Recording started", "ticket_id": "uuid" }
```

---

## 5. Upload Audio Recording

Uploads the recorded audio file. Works in two modes:

| Mode | How | When to use |
|------|-----|-------------|
| **Draft upload** | Include `ticket_id` field | Employee finishes a draft recording |
| **Direct upload** | Include `client_id` + `client_name` fields | Employee records a new ticket from scratch |

**Request**
```
POST /tickets/upload
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

**Form fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `audio` | ✅ | Audio binary (wav/mp3/m4a/ogg/flac/webm/aac) |
| `ticket_id` | For draft | UUID of the existing draft ticket |
| `client_id` | For direct | Client identifier string |
| `client_name` | For direct | Human-readable client name |
| `visit_type` | No | `site_visit`, `follow_up`, etc. Default: `site_visit` |

**Response**
```json
{
  "success": true,
  "ticket_id": "uuid",
  "visit_number": 4,
  "message": "Draft upload complete, analysis started"
}
```

**Kotlin Implementation (OkHttp Multipart)**

```kotlin
suspend fun uploadRecording(
    accessToken: String,
    audioFile: File,
    draftTicketId: String? = null,
    clientId: String? = null,
    clientName: String? = null
): UploadResponse {
    val mimeType = when (audioFile.extension.lowercase()) {
        "mp3" -> "audio/mpeg"
        "m4a" -> "audio/mp4"
        "wav" -> "audio/wav"
        "ogg" -> "audio/ogg"
        "aac" -> "audio/aac"
        "flac" -> "audio/flac"
        else -> "audio/mpeg"
    }

    val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
        .addFormDataPart("audio", audioFile.name, audioFile.asRequestBody(mimeType.toMediaType()))

    if (draftTicketId != null) {
        builder.addFormDataPart("ticket_id", draftTicketId)
    } else {
        builder.addFormDataPart("client_id", clientId!!)
        builder.addFormDataPart("client_name", clientName!!)
    }

    val request = Request.Builder()
        .url("$BASE_URL/tickets/upload")
        .addHeader("Authorization", "Bearer $accessToken")
        .post(builder.build())
        .build()

    val response = okHttpClient.newCall(request).execute()
    return gson.fromJson(response.body?.string(), UploadResponse::class.java)
}
```

> **Recording format**: Record as **M4A (AAC)** for best compression + quality on Android. Use `MediaRecorder` with `OutputFormat.MPEG_4` and `AudioEncoder.AAC`.

---

## 6. Submit an Excuse

When an employee can't complete a recording, they submit an excuse for admin review.

**Request**
```
POST /excuses
Authorization: Bearer <access_token>
Content-Type: application/json
```
```json
{
  "ticket_id": "uuid-of-draft",
  "reason": "client_unavailable",
  "reason_details": "Client called to postpone",
  "estimated_time_minutes": 60,
  "estimated_start_time": "2026-02-20T14:00:00Z"
}
```

**Valid `reason` values:**
```
client_unavailable | technical_issues | travel_delay | meeting_rescheduled | emergency | other
```

**Response**
```json
{
  "success": true,
  "excuse_id": "uuid",
  "message": "Excuse submitted. Awaiting admin review."
}
```

**Kotlin**
```kotlin
data class ExcuseRequest(
    val ticket_id: String,
    val reason: String,
    val reason_details: String? = null,
    val estimated_time_minutes: Int? = null,
    val estimated_start_time: String? = null
)

enum class ExcuseReason(val value: String, val label: String) {
    CLIENT_UNAVAILABLE("client_unavailable", "Client Unavailable"),
    TECHNICAL_ISSUES("technical_issues", "Technical Issues"),
    TRAVEL_DELAY("travel_delay", "Travel Delay"),
    MEETING_RESCHEDULED("meeting_rescheduled", "Meeting Rescheduled"),
    EMERGENCY("emergency", "Emergency"),
    OTHER("other", "Other")
}
```

---

## 7. View Own Excuses

**Request**
```
GET /excuses?status=all
Authorization: Bearer <access_token>
```

Query params:
- `status`: `all` | `pending` | `resolved` | `unresolved`

**Response**
```json
{
  "excuses": [
    {
      "id": "uuid",
      "ticket_id": "uuid",
      "reason": "client_unavailable",
      "reason_details": "Client called to postpone",
      "estimated_time_minutes": 60,
      "status": "pending",
      "submitted_at": "2026-02-19T10:00:00Z",
      "reviewed_at": null,
      "admin_notes": null,
      "ticket": {
        "client_name": "Sunrise Heights",
        "visit_type": "site_visit",
        "visit_number": 3
      }
    }
  ],
  "total": 1
}
```

**Excuse status meanings:**

| Status | Meaning |
|--------|---------|
| `pending` | Waiting for admin review |
| `accepted` | Admin approved delay |
| `rejected` | Admin rejected — ticket flagged |

---

## 8. Training Library (High-Rated Calls)

Employees can browse 4+ star calls to learn from top performers.

### List
```
GET /training/high-rated?page=1&limit=20&search=sunrise
Authorization: Bearer <access_token>
```

**Response**
```json
{
  "tickets": [
    {
      "id": "uuid",
      "client_name": "Sunrise Heights",
      "visit_type": "site_visit",
      "visit_number": 2,
      "rating_10": 9.5,
      "rating_5": 4.75,
      "created_at": "2026-02-10T09:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "total_pages": 3
}
```

### Detail (with audio + AI analysis)
```
GET /training/high-rated/:id
Authorization: Bearer <access_token>
```

**Response**
```json
{
  "ticket": { ... },
  "audio_url": "https://storage.googleapis.com/...",
  "analysis": {
    "summary": "Agent demonstrated excellent rapport...",
    "keymoments": [
      { "time": "02:15", "label": "Objection Handled", "description": "..." }
    ],
    "improvementsuggestions": ["Consider asking more open-ended questions"]
  }
}
```

**Play audio in Kotlin:**
```kotlin
val mediaPlayer = MediaPlayer().apply {
    setDataSource(audioUrl)
    setAudioAttributes(
        AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .build()
    )
    prepareAsync()
    setOnPreparedListener { start() }
}
```

---

## Token Management

```kotlin
object TokenManager {
    // Refresh when access_token is within 5 minutes of expiry
    suspend fun getValidToken(prefs: SecurePrefs, api: ApiService): String? {
        val expiresAt = prefs.getExpiresAt()
        val now = System.currentTimeMillis() / 1000

        if (expiresAt - now < 300) { // < 5 min remaining
            val refreshToken = prefs.getRefreshToken() ?: return null
            return try {
                val res = api.refreshToken(RefreshRequest(refresh_token = refreshToken))
                prefs.saveAccessToken(res.access_token)
                prefs.saveRefreshToken(res.refresh_token)
                res.access_token
            } catch (e: Exception) {
                null // force re-login
            }
        }
        return prefs.getAccessToken()
    }
}
```

**Refresh endpoint:**
```
POST /auth/refresh
Content-Type: application/json
{ "refresh_token": "xxx" }
```

---

## Error Handling

All errors follow this shape:
```json
{ "error": "Human-readable message" }
```

| HTTP | Meaning | Action |
|------|---------|--------|
| `400` | Bad request / validation | Show error to user |
| `401` | Expired/invalid token | Refresh token or re-login |
| `403` | Forbidden (wrong role) | Show "Not authorized" |
| `404` | Not found | Show empty/not found state |
| `429` | Rate limited | Wait and retry |
| `500` | Server error | Show retry option |
