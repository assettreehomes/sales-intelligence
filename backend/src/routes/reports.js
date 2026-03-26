import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { buildDailyReport, sendWhatsAppMessage } from '../services/whatsapp.js';
import { logActivity } from '../services/activityLog.js';

const router = Router();

/**
 * POST /reports/whatsapp/send
 *
 * Triggers a WhatsApp daily report.
 * Two valid auth paths:
 *  1. Admin JWT (manual "Send Report" button in dashboard)
 *  2. x-scheduler-secret header (Google Cloud Scheduler cron at 6pm IST)
 */
router.post('/whatsapp/send', async (req, res) => {
    // ── Auth: scheduler secret OR admin JWT ────────────────────────────────
    const schedulerSecret = req.headers['x-scheduler-secret'];
    const expectedSecret  = process.env.SCHEDULER_SECRET;

    const isScheduler = expectedSecret && schedulerSecret === expectedSecret;

    if (!isScheduler) {
        // Fall back to JWT admin auth
        try {
            await new Promise((resolve, reject) => {
                authMiddleware(req, res, (err) => err ? reject(err) : resolve());
            });
            await new Promise((resolve, reject) => {
                requireAdmin(req, res, (err) => err ? reject(err) : resolve());
            });
        } catch {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    try {
        console.log(`📲 WhatsApp report triggered by: ${isScheduler ? 'Cloud Scheduler' : req.user?.fullname || 'admin'}`);

        // 1. Build the report text
        const reportText = await buildDailyReport();

        // 2. Send to WhatsApp
        await sendWhatsAppMessage(reportText);

        // 3. Log (non-blocking)
        logActivity(req, 'report.whatsapp.sent', {
            triggered_by: isScheduler ? 'scheduler' : (req.user?.fullname || 'admin'),
            preview: reportText.slice(0, 120) + '...'
        }).catch(() => {});

        return res.status(200).json({
            success: true,
            triggered_by: isScheduler ? 'scheduler' : 'manual',
            preview: reportText
        });

    } catch (error) {
        console.error('❌ WhatsApp report error:', error);
        return res.status(500).json({ error: error.message || 'Failed to send report' });
    }
});

export default router;
