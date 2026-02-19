import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';

const router = Router();

/**
 * GET /activity-log
 * Fetch activity logs with filters and pagination.
 * Role: admin
 */
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const {
            dateFrom,
            dateTo,
            action,
            userId,
            page = 1,
            limit = 25,
        } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
        const offset = (pageNum - 1) * pageSize;

        let query = supabaseAdmin
            .from('activity_logs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + pageSize - 1);

        if (dateFrom) {
            query = query.gte('created_at', new Date(dateFrom).toISOString());
        }
        if (dateTo) {
            // End of the selected day
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            query = query.lte('created_at', end.toISOString());
        }
        if (action && action !== 'all') {
            query = query.eq('action', action);
        }
        if (userId && userId !== 'all') {
            query = query.eq('user_id', userId);
        }

        const { data: logs, count, error } = await query;

        if (error) {
            console.error('Activity log fetch error:', error);
            return res.status(500).json({ error: 'Failed to fetch activity logs' });
        }

        res.json({
            logs: logs || [],
            total: count || 0,
            page: pageNum,
            limit: pageSize,
            totalPages: Math.ceil((count || 0) / pageSize),
        });
    } catch (error) {
        console.error('Activity log error:', error);
        res.status(500).json({ error: 'Failed to fetch activity logs' });
    }
});

/**
 * GET /activity-log/export
 * Download activity logs as CSV.
 * Role: admin
 */
router.get('/export', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { dateFrom, dateTo, action, userId } = req.query;

        let query = supabaseAdmin
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5000);

        if (dateFrom) {
            query = query.gte('created_at', new Date(dateFrom).toISOString());
        }
        if (dateTo) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            query = query.lte('created_at', end.toISOString());
        }
        if (action && action !== 'all') {
            query = query.eq('action', action);
        }
        if (userId && userId !== 'all') {
            query = query.eq('user_id', userId);
        }

        const { data: logs, error } = await query;

        if (error) {
            console.error('Activity log export error:', error);
            return res.status(500).json({ error: 'Failed to export activity logs' });
        }

        // Build CSV
        const headers = ['Timestamp', 'User', 'Action', 'Details', 'Device', 'OS', 'Browser', 'Location', 'IP Address'];
        const rows = (logs || []).map((log) => {
            const ts = new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            const d = typeof log.details === 'object' ? log.details : {};
            const { device = '', os = '', browser = '', ...rest } = d;
            const detailsStr = JSON.stringify(rest);
            return [
                ts,
                log.user_name || '',
                log.action || '',
                `"${detailsStr.replace(/"/g, '""')}"`,
                device,
                os,
                browser,
                log.location || '',
                log.ip_address || '',
            ].join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=activity_log_${new Date().toISOString().slice(0, 10)}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Activity log CSV error:', error);
        res.status(500).json({ error: 'Failed to export activity logs' });
    }
});

export default router;
