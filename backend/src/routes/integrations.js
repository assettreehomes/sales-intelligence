// Status and test-send for the dashboard's Integrations pages (Mail and Chat).
// Shows what each integration is set to, never the API key or the webhook link.
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { supabaseAdmin } from '../config/supabase.js';
import { sendEmail, isMailConfigured } from '../services/mailer.js';
import { postSynologyChat, isSynologyChatConfigured, recentSynologyPosts } from '../services/synologyChat.js';
import { parseExcludeList, isExcludedFromChat } from '../utils/numberRequestEmail.js';
import { maskNumbersInText } from '../utils/maskPhone.js';
import { summaryTime } from '../utils/numberRequestSummary.js';
import { logActivity } from '../services/activityLog.js';

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'superadmin'));

const RECENT_LIMIT = 30;
const list = value => String(value ?? '').split(',').map(s => s.trim()).filter(Boolean);
const chatExcludeList = () => parseExcludeList(process.env.SYNOLOGY_CHAT_EXCLUDE ?? 'pammal');

async function nameMap(table, column, ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const { data } = await supabaseAdmin.from(table).select(`id, ${column}`).in('id', unique);
    return new Map((data || []).map(r => [r.id, r[column]]));
}

// Presales calls that triggered a number-request alert, newest first.
// columnsMissing = the alert columns are not in the tickets table yet (migration not run).
async function recentAlertedCalls() {
    const { data: tickets, error } = await supabaseAdmin
        .from('tickets')
        .select('id, createdat, number_alert_claimed_at, hr_email_sent_at, telecmi_lead_id, selldo_agent_name, selldo_team_name, presales_agent_id, presales_team_id, createdby, telecmi_user')
        .not('number_alert_claimed_at', 'is', null)
        .is('deletedat', null)
        .order('number_alert_claimed_at', { ascending: false })
        .limit(RECENT_LIMIT);
    if (error) {
        if (error.code === '42703' || /number_alert_claimed_at|hr_email_sent_at/.test(error.message || '')) {
            return { calls: [], columnsMissing: true };
        }
        throw error;
    }
    const rows = tickets || [];
    const agents = await nameMap('presales_employees', 'full_name', rows.map(t => t.presales_agent_id));
    const teams = await nameMap('presales_teams', 'name', rows.map(t => t.presales_team_id));
    const users = await nameMap('users', 'fullname', rows.map(t => t.createdby));
    const calls = rows.map(t => ({
        ticketId: t.id,
        callAt: t.createdat,
        alertAt: t.number_alert_claimed_at,
        emailSentAt: t.hr_email_sent_at,
        agentName: maskNumbersInText(t.selldo_agent_name || agents.get(t.presales_agent_id) || users.get(t.createdby) || t.telecmi_user || '') || null,
        teamName: t.selldo_team_name || teams.get(t.presales_team_id) || null,
        leadId: maskNumbersInText(t.telecmi_lead_id ? String(t.telecmi_lead_id) : '') || null
    }));
    return { calls, columnsMissing: false };
}

/** GET /integrations/mail */
router.get('/mail', async (req, res) => {
    try {
        const { calls, columnsMissing } = await recentAlertedCalls();
        const { h, min } = summaryTime();
        res.json({
            configured: isMailConfigured(),
            provider: (process.env.MAIL_PROVIDER || 'hostinger').toLowerCase(),
            from: process.env.MAIL_FROM || null,
            fromName: process.env.MAIL_FROM_NAME || 'Ai Voice Analysis',
            alertTo: list(process.env.NUMBER_ALERT_TO),
            summaryTo: list(process.env.NUMBER_SUMMARY_TO),
            summaryTime: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} IST`,
            columnsMissing,
            recent: calls.map(c => ({ ...c, status: c.emailSentAt ? 'sent' : 'not_sent' }))
        });
    } catch (err) {
        console.error('❌ Integrations mail status error:', err);
        res.status(500).json({ error: 'Failed to load mail integration status' });
    }
});

/** POST /integrations/mail/test — sends a test email to the alert recipients */
router.post('/mail/test', async (req, res) => {
    if (!isMailConfigured()) return res.status(400).json({ error: 'Mail is not configured on the backend (MAIL_API_KEY and MAIL_FROM)' });
    const to = list(process.env.NUMBER_ALERT_TO);
    const recipients = to.length ? to : [process.env.MAIL_FROM];
    const by = req.user?.fullname || req.user?.email || 'an admin';
    try {
        await sendEmail({
            to: recipients,
            subject: 'Ai Voice Analysis — test email',
            text: `This is a test email from Ai Voice Analysis, sent by ${by} from the dashboard's Mail Integration page.\n\nIf you received it, number-request alerts will reach this mailbox.`,
            html: `<p>This is a test email from <strong>Ai Voice Analysis</strong>, sent by ${String(by).replace(/[<>&]/g, '')} from the dashboard's Mail Integration page.</p><p>If you received it, number-request alerts will reach this mailbox.</p>`
        });
        logActivity(req, 'integration.mail.test', { to: recipients }).catch(() => {});
        res.json({ success: true, to: recipients });
    } catch (err) {
        console.error('⚠️ Test email failed:', err.message);
        res.status(502).json({ error: err.message });
    }
});

/** GET /integrations/chat */
router.get('/chat', async (req, res) => {
    try {
        const { calls, columnsMissing } = await recentAlertedCalls();
        const excluded = chatExcludeList();
        const posts = recentSynologyPosts();
        const byTicket = new Map();
        posts.forEach(p => { if (p.ticketId && !byTicket.has(p.ticketId)) byTicket.set(p.ticketId, p); });
        res.json({
            configured: isSynologyChatConfigured(),
            channel: process.env.SYNOLOGY_CHAT_CHANNEL || '1370',
            excluded,
            columnsMissing,
            recent: calls.map(c => {
                const post = byTicket.get(c.ticketId);
                let status = 'unknown';
                if (isExcludedFromChat(c, excluded)) status = 'skipped';
                else if (post) status = post.ok ? 'sent' : 'failed';
                return { ...c, status, postedAt: post?.at || null, error: post?.ok === false ? post.error : null };
            }),
            tests: posts.filter(p => p.test).slice(0, 5)
        });
    } catch (err) {
        console.error('❌ Integrations chat status error:', err);
        res.status(500).json({ error: 'Failed to load chat integration status' });
    }
});

/** POST /integrations/chat/test — posts a test message to the Synology Chat channel */
router.post('/chat/test', async (req, res) => {
    if (!isSynologyChatConfigured()) return res.status(400).json({ error: 'Synology Chat is not configured on the backend (SYNOLOGY_CHAT_WEBHOOK_URL)' });
    const by = req.user?.fullname || req.user?.email || 'an admin';
    try {
        await postSynologyChat(`✅ Test message from Ai Voice Analysis, sent by ${by}. Number-request alerts will be posted in this channel.`, { test: true });
        logActivity(req, 'integration.chat.test', {}).catch(() => {});
        res.json({ success: true });
    } catch (err) {
        console.error('⚠️ Test chat post failed:', err.message);
        res.status(502).json({ error: err.message });
    }
});

export default router;
