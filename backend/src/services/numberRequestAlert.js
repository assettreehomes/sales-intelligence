// Emails HR when a presales call's analysis flags the agent asking the customer for a number.
// One email per call: the ticket is claimed (hr_number_alert_sent_at) before sending, so a
// re-analysis of the same call never resends.
//
//   NUMBER_ALERT_TO   recipients, comma separated (e.g. hr@assettreehomes.com); unset = alerts off
//   DASHBOARD_URL     optional, adds an "Open the call" link (e.g. https://one.assettreehomes.com)
//   + the MAIL_* settings in mailer.js
import { supabaseAdmin } from '../config/supabase.js';
import { sendEmail, isMailConfigured } from './mailer.js';
import { buildNumberRequestEmail } from '../utils/numberRequestEmail.js';

const isMissingColumn = err => err && (err.code === '42703' || err.code === 'PGRST204' || /hr_number_alert_sent_at/.test(err.message || ''));

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

// true = this call is ours to send; false = already sent (or claimed by a parallel run)
async function claimTicket(ticket) {
    const { data, error } = await supabaseAdmin
        .from('tickets')
        .update({ hr_number_alert_sent_at: new Date().toISOString() })
        .eq('id', ticket.id)
        .is('hr_number_alert_sent_at', null)
        .select('id');
    if (!error) return { claimed: (data || []).length > 0, tracked: true };
    if (!isMissingColumn(error)) throw error;
    // Column not added yet: only alert when the call was not already flagged before this
    // analysis, so re-analysing a flagged call does not resend.
    return { claimed: ticket.asked_mobile_number !== true, tracked: false };
}

async function releaseClaim(ticketId) {
    await supabaseAdmin.from('tickets').update({ hr_number_alert_sent_at: null }).eq('id', ticketId);
}

/**
 * Never throws: an email problem must not fail the analysis.
 * @param {object} ticket  the ticket row as it was BEFORE this analysis saved its flag
 */
export async function sendNumberRequestAlert({ ticket, summary, instances }) {
    try {
        if (!instances?.length) return;
        const to = process.env.NUMBER_ALERT_TO;
        if (!to || !isMailConfigured()) return;

        const { claimed, tracked } = await claimTicket(ticket);
        if (!claimed) {
            console.log(`📧 Number-request alert already sent for ticket ${ticket.id} — skipping`);
            return;
        }

        const email = buildNumberRequestEmail({
            agentName: await resolveAgentName(ticket),
            ticket,
            summary,
            instances,
            dashboardUrl: process.env.DASHBOARD_URL
        });

        try {
            await sendEmail({ to, ...email });
        } catch (sendErr) {
            if (tracked) await releaseClaim(ticket.id).catch(() => {});
            throw sendErr;
        }
        console.log(`📧 Number-request alert sent for ticket ${ticket.id}`);
    } catch (err) {
        console.error(`⚠️ Number-request alert failed for ticket ${ticket?.id}:`, err.message);
    }
}
