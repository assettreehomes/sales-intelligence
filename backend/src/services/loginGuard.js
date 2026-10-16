/**
 * Login protection helpers.
 *
 * 1. Failed-attempt limiter (in memory; the backend runs as one Cloud Run
 *    instance). Counts failures only, so a busy office logging in at shift
 *    start is never blocked, while password guessing against one account is.
 *
 * 2. Server-side TOTP for superadmins. The password step creates a normal
 *    Supabase session, and anyone with the password could create the same
 *    session by calling Supabase directly, skipping the authenticator code.
 *    So the backend records which Supabase session ids passed TOTP (in the
 *    user's app_metadata, which only the service key can write) and the auth
 *    middleware refuses a superadmin token whose session is not on that list
 *    or passed TOTP more than 24 hours ago (the superadmin session limit).
 *    SUPERADMIN_SERVER_TOTP=off switches the check off in an emergency.
 */

const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_EMAIL = 10;
export const MAX_FAILURES_PER_IP = 50;
export const TOTP_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TOTP_SESSIONS = 10;

export function createFailureLimiter({ windowMs = WINDOW_MS, now = () => Date.now() } = {}) {
    const failures = new Map(); // key -> [timestamps]

    function recent(key) {
        const cutoff = now() - windowMs;
        const list = (failures.get(key) || []).filter(t => t > cutoff);
        if (list.length) failures.set(key, list); else failures.delete(key);
        return list;
    }

    return {
        isBlocked(key, max) {
            return recent(key).length >= max;
        },
        recordFailure(key) {
            const list = recent(key);
            list.push(now());
            failures.set(key, list);
        },
        reset(key) {
            failures.delete(key);
        },
        prune() {
            for (const key of [...failures.keys()]) recent(key);
        },
        size() {
            return failures.size;
        }
    };
}

export const loginFailures = createFailureLimiter();
setInterval(() => loginFailures.prune(), WINDOW_MS).unref();

/** Reads the session_id claim from a Supabase access token (no verification; call after getUser). */
export function sessionIdFromJwt(token) {
    try {
        const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
        return typeof payload.session_id === 'string' ? payload.session_id : null;
    } catch {
        return null;
    }
}

export function serverTotpEnabled() {
    return String(process.env.SUPERADMIN_SERVER_TOTP || '').toLowerCase() !== 'off';
}

/** True when this session id passed TOTP within the TTL, according to app_metadata. */
export function isTotpSessionValid(appMetadata, sessionId, nowMs = Date.now()) {
    if (!sessionId) return false;
    const sessions = Array.isArray(appMetadata?.totp_sessions) ? appMetadata.totp_sessions : [];
    return sessions.some(s => s && s.sid === sessionId && Number.isFinite(s.at) && nowMs - s.at < TOTP_SESSION_TTL_MS);
}

/** Returns the app_metadata.totp_sessions list with this session added and stale ones dropped. */
export function addTotpSession(appMetadata, sessionId, nowMs = Date.now()) {
    const sessions = Array.isArray(appMetadata?.totp_sessions) ? appMetadata.totp_sessions : [];
    const kept = sessions.filter(s => s && s.sid !== sessionId && Number.isFinite(s.at) && nowMs - s.at < TOTP_SESSION_TTL_MS);
    kept.push({ sid: sessionId, at: nowMs });
    return kept.slice(-MAX_TOTP_SESSIONS);
}

/** Records that the session behind accessToken passed TOTP. Throws on failure. */
export async function markSessionTotpVerified(supabaseAdmin, userId, accessToken) {
    const sessionId = sessionIdFromJwt(accessToken);
    if (!sessionId) throw new Error('Access token has no session id');
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) throw new Error(`Could not load user: ${error?.message || 'not found'}`);
    const appMetadata = data.user.app_metadata || {};
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: { ...appMetadata, totp_sessions: addTotpSession(appMetadata, sessionId) }
    });
    if (updateError) throw new Error(`Could not record TOTP session: ${updateError.message}`);
}
