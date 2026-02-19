import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { logActivity } from '../services/activityLog.js';

const router = Router();

/**
 * POST /employee/heartbeat
 * Updates the employee's online status, recording state, and current client.
 * Called periodically by the frontend.
 */
router.post('/heartbeat', authMiddleware, async (req, res) => {
    try {
        const { is_online, is_recording, current_client_id } = req.body;
        const userId = req.user.id;

        // Upsert status
        const { error } = await supabaseAdmin
            .from('employee_status')
            .upsert({
                user_id: userId,
                is_online: is_online ?? true, // Default to true if calling heartbeat
                is_recording: is_recording ?? false,
                current_client_id: current_client_id || null,
                last_heartbeat: new Date().toISOString(),
            }, { onConflict: 'user_id' });

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
 * Fetches the status of all employees/interns.
 * Role: Admin only
 */
router.get('/status', authMiddleware, requireAdmin, async (req, res) => {
    try {
        // 1. Get all users with role employee or intern
        const { data: users, error: usersError } = await supabaseAdmin
            .from('users')
            .select('id, fullname, email, role')
            .in('role', ['employee', 'intern']);

        if (usersError) {
            throw usersError;
        }

        // 2. Get status for these users
        const userIds = users.map(u => u.id);
        const { data: statuses, error: statusError } = await supabaseAdmin
            .from('employee_status')
            .select('*')
            .in('user_id', userIds);

        if (statusError) {
            throw statusError;
        }

        // 3. Merge and process
        const statusMap = new Map(statuses?.map(s => [s.user_id, s]) || []);
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

        const result = users.map(user => {
            const status = statusMap.get(user.id);
            let isOnline = false;
            let isRecording = false;
            let currentClient = null;
            let lastHeartbeat = null;

            if (status) {
                const heartbeatDate = new Date(status.last_heartbeat);
                // If heartbeat is older than 2 mins, consider offline
                if (heartbeatDate > twoMinutesAgo && status.is_online) {
                    isOnline = true;
                    isRecording = status.is_recording; // Only trust recording if online
                    currentClient = status.current_client_id;
                }
                lastHeartbeat = status.last_heartbeat;
            }

            return {
                user,
                status: {
                    is_online: isOnline,
                    is_recording: isRecording,
                    current_client_id: currentClient,
                    last_heartbeat: lastHeartbeat
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
