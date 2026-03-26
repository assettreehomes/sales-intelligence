import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { buildDailyReport, sendWhatsAppMessage, sendWhatsAppTemplate } from '../services/whatsapp.js';
import { logActivity } from '../services/activityLog.js';

const router = Router();

/**
 * POST /reports/whatsapp/send
 *
 * Triggers a WhatsApp daily report.
 * Auth: admin JWT (manual button) OR x-scheduler-secret header (Cloud Scheduler).
 *
 * Sending strategy:
 *  - If WHATSAPP_TEMPLATE_NAME is set → use template (works anytime, no 24h window needed)
 *  - Otherwise → free-form text (requires conversation window to be open)
 */
router.post('/whatsapp/send', async (req, res) => {
    const schedulerSecret = req.headers['x-scheduler-secret'];
    const expectedSecret  = process.env.SCHEDULER_SECRET;
    const isScheduler = expectedSecret && schedulerSecret === expectedSecret;

    if (!isScheduler) {
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

        // 1. Build report (returns structured data + text)
        const report = await buildDailyReport();

        // 2. Send — prefer template (no 24h restriction), fall back to free-form text
        if (process.env.WHATSAPP_TEMPLATE_NAME) {
            await sendWhatsAppTemplate(report);
        } else {
            await sendWhatsAppMessage(report.text);
        }

        // 3. Log (non-blocking)
        logActivity(req, 'report.whatsapp.sent', {
            triggered_by: isScheduler ? 'scheduler' : (req.user?.fullname || 'admin'),
            preview: report.text.slice(0, 120) + '...'
        }).catch(() => {});

        return res.status(200).json({
            success: true,
            triggered_by: isScheduler ? 'scheduler' : 'manual',
            preview: report.text
        });

    } catch (error) {
        console.error('❌ WhatsApp report error:', error);
        return res.status(500).json({ error: error.message || 'Failed to send report' });
    }
});

export default router;
