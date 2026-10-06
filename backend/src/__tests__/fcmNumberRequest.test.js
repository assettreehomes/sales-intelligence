import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notifyAdminsNumberRequest } from '../services/fcm.js';

function fakeSupabase(tables, calls) {
    return {
        from(table) {
            const q = { table, filters: [] };
            calls.push(q);
            const chain = {
                select() { return chain; },
                update(v) { q.update = v; return chain; },
                in(col, vals) { q.filters.push(['in', col, vals]); return chain; },
                eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
                then(resolve) { resolve({ data: tables[table] || [], error: null }); }
            };
            return chain;
        }
    };
}

describe('FCM number-request alert to admins', () => {
    it('sends one notification to active admin/superadmin Android devices and drops dead tokens', async () => {
        const prev = process.env.FCM_ENABLED;
        process.env.FCM_ENABLED = 'true';
        const calls = [];
        const sentMessages = [];
        const supabase = fakeSupabase({
            users: [{ id: 'admin-1' }, { id: 'super-1' }],
            push_devices: [{ id: 'd1', fcm_token: 't1' }, { id: 'd2', fcm_token: 't2' }]
        }, calls);
        const messagingFactory = () => ({
            async sendEachForMulticast(msg) {
                sentMessages.push(msg);
                return { successCount: 1, responses: [{ success: true }, { success: false, error: { code: 'messaging/registration-token-not-registered' } }] };
            }
        });

        try {
            const result = await notifyAdminsNumberRequest(
                { ticketId: 'tk-1', title: 'Client Phone Number asked by Priya S', body: '06 Oct 2026, 02:45 pm IST' },
                { supabase, messagingFactory, timeoutMs: 1000 }
            );
            assert.deepEqual(result, { status: 'sent', sent: 1, invalid: 1 });
            assert.deepEqual(calls[0].filters, [['in', 'role', ['admin', 'superadmin']], ['eq', 'status', 'active']]);
            assert.deepEqual(calls[1].filters[0], ['in', 'user_id', ['admin-1', 'super-1']]);
            assert.equal(sentMessages.length, 1);
            assert.deepEqual(sentMessages[0].tokens, ['t1', 't2']);
            assert.equal(sentMessages[0].notification.title, 'Client Phone Number asked by Priya S');
            assert.equal(sentMessages[0].data.event_type, 'number_request');
            assert.equal(sentMessages[0].data.title, 'Client Phone Number asked by Priya S');
            assert.deepEqual(calls[2].update.is_active, false);
        } finally {
            process.env.FCM_ENABLED = prev;
        }
    });

    it('does nothing when FCM is off', async () => {
        const prev = process.env.FCM_ENABLED;
        process.env.FCM_ENABLED = 'false';
        try {
            assert.deepEqual(await notifyAdminsNumberRequest({ ticketId: 'x', title: 't', body: 'b' }), { status: 'disabled', sent: 0 });
        } finally {
            process.env.FCM_ENABLED = prev;
        }
    });
});
