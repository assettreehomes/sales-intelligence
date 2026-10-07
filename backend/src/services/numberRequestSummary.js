// Daily summary of presales number requests, emailed to operations + HR at 9 pm IST.
//
//   NUMBER_SUMMARY_TO    recipients, comma separated (e.g. operations@assettreehomes.com,hr@assettreehomes.com); unset = off
//   NUMBER_SUMMARY_TIME  HH:MM in IST (default 21:00)
//   + the MAIL_* settings in mailer.js
//
// Runs in-process (Cloud Run keeps one instance with min-instances=1); it can also be triggered by
// POST /reports/number-requests/send. The window is the 24 hours up to the latest run time, by when
// the call was analysed, so a call analysed after 9 pm goes into the next day's summary.
import { supabaseAdmin } from '../config/supabase.js';
import { sendEmail, isMailConfigured } from './mailer.js';
import { buildNumberRequestSummary, latestRunAt } from '../utils/numberRequestSummary.js';
import { parseExcludeList } from '../utils/numberRequestEmail.js';
import { dropWhatsAppGreetings } from '../utils/numberRequests.js';

async function nameMap(table, column, ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const { data } = await supabaseAdmin.from(table).select(`id, ${column}`).in('id', unique);
    return new Map((data || []).map(r => [r.id, r[column]]));
}

async function loadFlaggedCalls(from, to) {
    const { data: tickets, error } = await supabaseAdmin
        .from('tickets')
        .select('*')
        .eq('source', 'telecmi')
        .eq('asked_mobile_number', true)
        .gte('analysiscompletedat', from.toISOString())
        .lt('analysiscompletedat', to.toISOString())
        .is('deletedat', null)
        .order('createdat', { ascending: true })
        .limit(2000);
    if (error) throw new Error(`Failed to load flagged calls: ${error.message}`);
    if (!tickets?.length) return [];

    const ids = tickets.map(t => t.id);
    const analyses = new Map();
    for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabaseAdmin.from('analysisresults').select('ticketid, summary, scores').in('ticketid', ids.slice(i, i + 200));
        (data || []).forEach(a => analyses.set(a.ticketid, a));
    }
    const agents = await nameMap('presales_employees', 'full_name', tickets.map(t => t.presales_agent_id));
    const teams = await nameMap('presales_teams', 'name', tickets.map(t => t.presales_team_id));
    const users = await nameMap('users', 'fullname', tickets.map(t => t.createdby));

    return tickets
        .map(t => {
            const a = analyses.get(t.id) || {};
            const instances = dropWhatsAppGreetings(a.scores?.number_requests || { instances: [] }).instances;
            return {
                ticket: t,
                agentName: t.selldo_agent_name || agents.get(t.presales_agent_id) || users.get(t.createdby) || t.telecmi_user || null,
                teamName: t.selldo_team_name || teams.get(t.presales_team_id) || null,
                summary: a.summary,
                instances,
                emailSentAt: t.hr_email_sent_at || null
            };
        })
        .filter(c => c.instances.length > 0);
}

/** Builds and sends the summary for the 24 h ending at `to`. Throws on failure. */
export async function sendNumberRequestSummary({ to = latestRunAt() } = {}) {
    const recipients = process.env.NUMBER_SUMMARY_TO;
    if (!recipients) throw new Error('NUMBER_SUMMARY_TO is not set');
    if (!isMailConfigured()) throw new Error('Email not configured: set MAIL_API_KEY and MAIL_FROM');
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const calls = await loadFlaggedCalls(from, to);
    const email = buildNumberRequestSummary({
        calls, from, to,
        chatExcluded: parseExcludeList(process.env.SYNOLOGY_CHAT_EXCLUDE ?? 'pammal'),
        dashboardUrl: process.env.DASHBOARD_URL
    });
    await sendEmail({ to: recipients, ...email });
    console.log(`📧 Number-request summary sent (${calls.length} call(s)) to ${recipients}`);
    return { calls: calls.length, subject: email.subject };
}

export function startNumberRequestSummary() {
    if (!process.env.NUMBER_SUMMARY_TO) return;
    const scheduleNext = () => {
        const next = latestRunAt(new Date(Date.now() + 24 * 60 * 60 * 1000));
        const wait = Math.max(next.getTime() - Date.now(), 1000);
        console.log(`Number-request summary scheduled for ${next.toISOString()}`);
        setTimeout(async () => {
            try {
                await sendNumberRequestSummary({ to: next });
            } catch (err) {
                console.error('⚠️ Number-request summary failed:', err.message);
            }
            scheduleNext();
        }, wait);
    };
    scheduleNext();
}
