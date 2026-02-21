import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';

const router = Router();

/**
 * POST /employee/heartbeat
 * Updates the employee's online status, recording state, current client/ticket, and battery.
 * Called periodically by the frontend/mobile app (every 30s).
 */
router.post('/heartbeat', authMiddleware, async (req, res) => {
    try {
        const {
            is_online,
            is_recording,
            current_client_id,
            current_ticket_id,
            battery_level
        } = req.body;

        const userId = req.user.id;

        // Validate battery_level if provided
        const validBattery = (typeof battery_level === 'number' && battery_level >= 0 && battery_level <= 100)
            ? battery_level
            : null;

        const upsertData = {
            user_id: userId,
            is_online: is_online ?? true,
            is_recording: is_recording ?? false,
            current_client_id: current_client_id || null,
            current_ticket_id: current_ticket_id || null,
            last_heartbeat: new Date().toISOString(),
        };

        // Only overwrite battery fields if a valid battery value was sent
        if (validBattery !== null) {
            upsertData.battery_level = validBattery;
            upsertData.battery_updated_at = new Date().toISOString();
        }

        const { error } = await supabaseAdmin
            .from('employee_status')
            .upsert(upsertData, { onConflict: 'user_id' });

        if (error) {
            console.error('Heartbeat upsert error:', error);
            return res.status(500).json({ error: 'Failed to update heartbeat' });
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Heartbeat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /employee/status
 * Fetches the status of all employees/interns, enriched with:
 *   - battery level + timestamp
 *   - current ticket details (client name, visit info, draft vs live)
 * Role: Admin only
 */
router.get('/status', authMiddleware, requireAdmin, async (req, res) => {
    try {
        // 1. Get all employees/interns
        const { data: users, error: usersError } = await supabaseAdmin
            .from('users')
            .select('id, fullname, email, role, avatar_url')
            .in('role', ['employee', 'intern']);

        if (usersError) throw usersError;

        // 2. Get their status rows
        const userIds = users.map(u => u.id);
        const { data: statuses, error: statusError } = await supabaseAdmin
            .from('employee_status')
            .select('*')
            .in('user_id', userIds);

        if (statusError) throw statusError;

        // 3. Collect all non-null current_ticket_ids and batch-fetch those tickets
        const ticketIds = (statuses || [])
            .map(s => s.current_ticket_id)
            .filter(Boolean);

        let ticketMap = new Map();
        if (ticketIds.length > 0) {
            const { data: tickets, error: ticketError } = await supabaseAdmin
                .from('tickets')
                .select('id, clientname, client_name, visittype, visit_type, visitnumber, visit_number, status')
                .in('id', ticketIds);

            if (!ticketError && tickets) {
                ticketMap = new Map(tickets.map(t => [t.id, t]));
            }
        }

        // 4. Merge everything
        const statusMap = new Map((statuses || []).map(s => [s.user_id, s]));
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

        const result = users.map(user => {
            const status = statusMap.get(user.id);

            let isOnline = false;
            let isRecording = false;
            let currentClientId = null;
            let currentTicketId = null;
            let lastHeartbeat = null;
            let batteryLevel = null;
            let batteryUpdatedAt = null;
            let currentTicket = null;

            if (status) {
                lastHeartbeat = status.last_heartbeat;
                batteryLevel = status.battery_level ?? null;
                batteryUpdatedAt = status.battery_updated_at ?? null;

                const heartbeatDate = new Date(status.last_heartbeat);
                if (heartbeatDate > twoMinutesAgo && status.is_online) {
                    isOnline = true;
                    isRecording = status.is_recording;
                    currentClientId = status.current_client_id;
                    currentTicketId = status.current_ticket_id;

                    // Enrich with ticket details if we have a current_ticket_id
                    if (currentTicketId) {
                        const t = ticketMap.get(currentTicketId);
                        if (t) {
                            currentTicket = {
                                id: t.id,
                                client_name: t.clientname || t.client_name || currentClientId || 'Unknown',
                                visit_type: t.visittype || t.visit_type || 'site_visit',
                                visit_number: t.visitnumber || t.visit_number || 1,
                                is_draft: t.status === 'draft',
                                ticket_status: t.status,
                            };
                        }
                    }
                }
            }

            return {
                user,
                status: {
                    is_online: isOnline,
                    is_recording: isRecording,
                    current_client_id: currentClientId,
                    current_ticket_id: currentTicketId,
                    current_ticket: currentTicket,
                    last_heartbeat: lastHeartbeat,
                    battery_level: batteryLevel,
                    battery_updated_at: batteryUpdatedAt,
                }
            };
        });

        res.json({ statuses: result });

    } catch (error) {
        console.error('Get employee status error:', error);
        res.status(500).json({ error: 'Failed to fetch employee status' });
    }
});

export default router;
