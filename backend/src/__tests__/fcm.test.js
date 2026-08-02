import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftAssignmentMessage, isInvalidFcmTokenError, notifyDraftAssignment } from '../services/fcm.js';

describe('FCM draft assignment payload', () => {
    it('uses the existing Android assignment action and notification channel', () => {
        const message = buildDraftAssignmentMessage({
            draftId: 'draft-123',
            clientName: 'Test Client',
            visitNumber: 2,
            source: 'admin',
            eventType: 'draft_assigned'
        });

        assert.equal(message.notification.title, 'New task assigned');
        assert.equal(message.notification.body, 'Test Client - Visit #2');
        assert.deepEqual(message.data, {
            draft_id: 'draft-123',
            action: 'view_new_assignment',
            event_type: 'draft_assigned',
            assignment_source: 'admin'
        });
        assert.equal(message.android.priority, 'high');
        assert.equal(message.android.notification.channelId, 'draft_reminders');
    });

    it('identifies only permanently invalid Firebase tokens for deactivation', () => {
        assert.equal(isInvalidFcmTokenError({ code: 'messaging/registration-token-not-registered' }), true);
        assert.equal(isInvalidFcmTokenError({ code: 'messaging/invalid-registration-token' }), true);
        assert.equal(isInvalidFcmTokenError({ code: 'messaging/internal-error' }), false);
    });

    it('keeps assignment success isolated when FCM sending fails', async () => {
        const previousEnabled = process.env.FCM_ENABLED;
        process.env.FCM_ENABLED = 'true';

        const query = {
            select() { return this; },
            eq() { return this; },
            then(resolve) {
                resolve({ data: [{ id: 'device-1', fcm_token: 'token-1' }], error: null });
            }
        };
        const result = await notifyDraftAssignment({
            assignedUserId: 'employee-1',
            draftId: 'draft-1',
            clientName: 'Test Client',
            visitNumber: 1,
            source: 'admin'
        }, {
            supabase: { from: () => query },
            messagingFactory: () => ({
                sendEachForMulticast: async () => { throw new Error('Firebase unavailable'); }
            }),
            timeoutMs: 50
        });

        if (previousEnabled === undefined) delete process.env.FCM_ENABLED;
        else process.env.FCM_ENABLED = previousEnabled;

        assert.deepEqual(result, { status: 'failed', sent: 0 });
    });
});
