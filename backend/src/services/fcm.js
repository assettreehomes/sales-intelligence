import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { supabaseAdmin } from '../config/supabase.js';

const MAX_MULTICAST_TOKENS = 500;
const DEFAULT_TIMEOUT_MS = 5000;
const INVALID_TOKEN_CODES = new Set([
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered'
]);

export function isFcmEnabled() {
    return process.env.FCM_ENABLED === 'true';
}

export function isInvalidFcmTokenError(error) {
    return INVALID_TOKEN_CODES.has(error?.code);
}

export function buildDraftAssignmentMessage({ draftId, clientId, clientName, visitNumber, source, eventType }) {
    return {
        // Data-only message - ensures onMessageReceived is ALWAYS called (foreground AND background)
        data: {
            draft_id: String(draftId),
            client_id: clientId || clientName || 'Unknown',
            client_name: clientName || 'A client',
            visit_number: String(visitNumber || 1),
            action: 'view_new_assignment',
            event_type: eventType,
            assignment_source: source
        },
        android: {
            priority: 'high',
            notification: {
                channelId: 'draft_reminders'
            }
        }
    };
}

function getFcmTimeoutMs() {
    const configured = Number(process.env.FCM_SEND_TIMEOUT_MS);
    if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_TIMEOUT_MS;
    return Math.min(configured, 15000);
}

function getFirebaseMessaging() {
    if (!getApps().length) {
        initializeApp({ credential: applicationDefault() });
    }
    return getMessaging();
}

async function withTimeout(promise, timeoutMs) {
    let timeout;
    const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`FCM send timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeout);
    }
}

async function deactivateInvalidTokens(deviceIds, supabase) {
    if (!deviceIds.length) return;

    const { error } = await supabase
        .from('push_devices')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('id', deviceIds);

    if (error) {
        console.error('FCM: failed to deactivate invalid device tokens:', error.message);
    }
}

/**
 * Sends a non-blocking-for-business notification after a draft assignment has
 * already been committed. This function always contains FCM failures so callers
 * cannot change assignment or analysis outcomes.
 */
export async function notifyDraftAssignment({
    assignedUserId,
    draftId,
    clientId,
    clientName,
    visitNumber,
    source,
    eventType = 'draft_assigned'
}, {
    supabase = supabaseAdmin,
    messagingFactory = getFirebaseMessaging,
    timeoutMs = getFcmTimeoutMs()
} = {}) {
    if (!isFcmEnabled()) {
        console.info(`FCM disabled: skipped ${eventType} notification for draft ${draftId}`);
        return { status: 'disabled', sent: 0 };
    }

    try {
        const { data: devices, error: deviceError } = await supabase
            .from('push_devices')
            .select('id, fcm_token')
            .eq('user_id', assignedUserId)
            .eq('platform', 'android')
            .eq('is_active', true);

        if (deviceError) throw deviceError;
        if (!devices?.length) {
            console.info(`FCM: no active Android devices for user ${assignedUserId}`);
            return { status: 'no_devices', sent: 0 };
        }

        const messaging = messagingFactory();
        const message = buildDraftAssignmentMessage({ draftId, clientId, clientName, visitNumber, source, eventType });
        const invalidDeviceIds = [];
        let sent = 0;

        for (let index = 0; index < devices.length; index += MAX_MULTICAST_TOKENS) {
            const batch = devices.slice(index, index + MAX_MULTICAST_TOKENS);
            const response = await withTimeout(
                messaging.sendEachForMulticast({ ...message, tokens: batch.map((device) => device.fcm_token) }),
                timeoutMs
            );

            sent += response.successCount;
            response.responses.forEach((result, responseIndex) => {
                if (!result.success && isInvalidFcmTokenError(result.error)) {
                    invalidDeviceIds.push(batch[responseIndex].id);
                }
            });
        }

        await deactivateInvalidTokens(invalidDeviceIds, supabase);
        console.info(`FCM: sent ${sent}/${devices.length} ${eventType} notification(s) for draft ${draftId}`);
        return { status: 'sent', sent, invalid: invalidDeviceIds.length };
    } catch (error) {
        console.error(`FCM: ${eventType} notification failed for draft ${draftId}:`, error.message || error);
        return { status: 'failed', sent: 0 };
    }
}
