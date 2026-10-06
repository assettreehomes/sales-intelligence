// Alerts HR (email) and admins (Android push) when a presales call's analysis flags the agent
// asking the customer for a number. One alert per call: the ticket is claimed
// (number_alert_claimed_at) before sending, so a re-analysis of the same call never resends.
// hr_email_sent_at records a successful HR email (the dashboard shows a Mail badge for it).
//
//   NUMBER_ALERT_TO   email recipients, comma separated (e.g. hr@assettreehomes.com); unset = no email
//   DASHBOARD_URL     optional, adds an "Open the call" link to the email
//   + the MAIL_* settings in mailer.js; the push uses the existing FCM_ENABLED setup in fcm.js
import { supabaseAdmin } from '../config/supabase.js';
import { sendEmail, isMailConfigured } from './mailer.js';
import { isFcmEnabled, notifyAdminsNumberRequest } from './fcm.js';
import { buildNumberRequestEmail, buildNumberRequestPush } from '../utils/numberRequestEmail.js';

const isMissingColumn = err => err && (err.code === '42703' || err.code === 'PGRST204' || /number_alert_claimed_at|hr_email_sent_at/.test(err.message || ''));

async function resolveAgentName(ticket) {
    if (ticket.selldo_agent_name) return ticket.selldo_agent_name;
    if (ticket.presales_agent_id) {
        const { data } = await supabaseAdmin.from('presales_employees').select('full_name').eq('id', ticket.presales_agent_id).maybeSingle();
        if (data?.full_name) return data.full_name;
    }
    if (ticket.createdby) {
        const { data } = await supabaseAdmin.from('users').select('fullname').eq('id', ticket.createdby).maybeSingle();
        if (data?.fullname) return data.fullname;
    }
    return ticket.telecmi_user || ticket.telecmi_agent_id || null;
}

// true = this call is ours to alert on; false = already alerted (or claimed by a parallel run)
async function claimTicket(ticket) {
    const { data, error } = await supabaseAdmin
        .from('tickets')
        .update({ number_alert_claimed_at: new Date().toISOString() })
        .eq('id', ticket.id)
        .is('number_alert_claimed_at', null)
        .select('id');
    if (!error) return { claimed: (data || []).length > 0, tracked: true };
    if (!isMissingColumn(error)) throw error;
    // Column not added yet: only alert when the call was not already flagged before this
    // analysis, so re-analysing a flagged call does not resend.
    return { claimed: ticket.asked_mobile_number !== true, tracked: false };
}

async function releaseClaim(ticketId) {
    await supabaseAdmin.from('tickets').update({ number_alert_claimed_at: null }).eq('id', ticketId);
}

/**
 * Never throws: an alert problem must not fail the analysis.
 * @param {object} ticket  the ticket row as it was BEFORE this analysis saved its flag
 */
export async function sendNumberRequestAlert({ ticket, summary, instances }) {
    try {
        if (!instances?.length) return;
        const to = process.env.NUMBER_ALERT_TO;
        const emailOn = Boolean(to) && isMailConfigured();
        const pushOn = isFcmEnabled();
        if (!emailOn && !pushOn) return;

        const { claimed, tracked } = await claimTicket(ticket);
        if (!claimed) {
            console.log(`📧 Number-request alert already sent for ticket ${ticket.id} — skipping`);
            return;
        }

        const agentName = await resolveAgentName(ticket);
        let delivered = false;

        if (pushOn) {
            const push = await notifyAdminsNumberRequest({ ticketId: ticket.id, ...buildNumberRequestPush({ agentName, ticket, instances }) });
            delivered = push.sent > 0;
        }

        if (emailOn) {
            try {
                const email = buildNumberRequestEmail({ agentName, ticket, summary, instances, dashboardUrl: process.env.DASHBOARD_URL });
                await sendEmail({ to, ...email });
                delivered = true;
                if (tracked) {
                    const { error } = await supabaseAdmin.from('tickets').update({ hr_email_sent_at: new Date().toISOString() }).eq('id', ticket.id);
                    if (error) console.warn(`⚠️ Could not record HR email for ticket ${ticket.id}:`, error.message);
                }
                console.log(`📧 Number-request email sent for ticket ${ticket.id}`);
            } catch (err) {
                console.error(`⚠️ Number-request email failed for ticket ${ticket.id}:`, err.message);
            }
        }

        // Nothing went out: let a later re-analysis try again
        if (!delivered && tracked) await releaseClaim(ticket.id).catch(() => {});
    } catch (err) {
        console.error(`⚠️ Number-request alert failed for ticket ${ticket?.id}:`, err.message);
    }
}
