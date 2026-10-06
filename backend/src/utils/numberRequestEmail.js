// Builds the HR alert sent when a presales agent asks a customer for their number.
// Pure function (no I/O) so it can be tested with a sample analysis.
import { maskNumbersInText } from './maskPhone.js';

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = s => maskNumbersInText(String(s ?? '').trim());

function formatIst(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    }) + ' IST';
}

function formatDuration(seconds) {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s <= 0) return null;
    return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
}

/**
 * @param {object} p
 * @param {string} p.agentName
 * @param {object} p.ticket          tickets row (id, createdat, durationseconds, telecmi_lead_id, selldo_team_name, telecmi_direction)
 * @param {string} p.summary         analysis summary
 * @param {Array}  p.instances       number_requests.instances after the WhatsApp "Hi" filter
 * @param {string} [p.dashboardUrl]  e.g. https://one.assettreehomes.com
 * @returns {{ subject: string, text: string, html: string }}
 */
export function buildNumberRequestEmail({ agentName, ticket = {}, summary, instances = [], dashboardUrl }) {
    const agent = clean(agentName) || 'Unknown agent';
    const subject = `Client Phone Number asked by ${agent}`;

    const details = [
        ['Agent', agent],
        ['Team', clean(ticket.selldo_team_name) || null],
        ['Call date & time', formatIst(ticket.createdat)],
        ['Duration', formatDuration(ticket.durationseconds)],
        ['Direction', ticket.telecmi_direction || null],
        ['Lead ID', clean(ticket.telecmi_lead_id) || null],
        ['Ticket', ticket.id || null]
    ].filter(([, v]) => v);

    const proofs = instances.map(inst => ({
        time: clean(inst.time) || null,
        quote: clean(inst.transcript_excerpt) || null,
        reason: clean(inst.reason) || null
    }));

    const link = dashboardUrl && ticket.id ? `${dashboardUrl.replace(/\/+$/, '')}/admin/tickets/${ticket.id}` : null;
    const summaryText = clean(summary) || 'No summary available.';

    const text = [
        `${agent} asked a customer for their phone number on a presales call.`,
        '',
        ...details.map(([k, v]) => `${k}: ${v}`),
        '',
        'CALL SUMMARY',
        summaryText,
        '',
        'PROOF OF SPEECH',
        ...proofs.flatMap((p, i) => [
            `${i + 1}. ${p.time ? `[${p.time}] ` : ''}"${p.quote || '(no transcript excerpt)'}"`,
            ...(p.reason ? [`   ${p.reason}`] : [])
        ]),
        ...(link ? ['', `Open the call: ${link}`] : []),
        '',
        'Customer numbers are masked. This alert is sent automatically by Ai Voice Analysis.'
    ].join('\n');

    const row = ([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;max-width:640px">
<div style="background:#27316f;color:#fff;padding:12px 16px;font-size:16px"><strong>Client Phone Number asked</strong></div>
<div style="border:1px solid #ddd;border-top:0;padding:16px">
<p style="margin-top:0">${escapeHtml(agent)} asked a customer for their phone number on a presales call.</p>
<table style="border-collapse:collapse;margin-bottom:16px">${details.map(row).join('')}</table>
<h3 style="color:#27316f;margin:16px 0 6px">Call Summary</h3>
<p style="margin:0">${escapeHtml(summaryText)}</p>
<h3 style="color:#27316f;margin:16px 0 6px">Proof of Speech</h3>
${proofs.map(p => `<div style="border-left:4px solid #f5aa1d;background:#fafafa;padding:8px 12px;margin-bottom:8px">
${p.time ? `<div style="color:#555;font-size:12px">At ${escapeHtml(p.time)}</div>` : ''}
<div style="font-size:15px">&ldquo;${escapeHtml(p.quote || '(no transcript excerpt)')}&rdquo;</div>
${p.reason ? `<div style="color:#555;font-size:12px;margin-top:4px">${escapeHtml(p.reason)}</div>` : ''}
</div>`).join('\n')}
${link ? `<p><a href="${escapeHtml(link)}" style="color:#27316f">Open the call in the dashboard</a></p>` : ''}
<p style="color:#888;font-size:12px;margin-bottom:0">Customer numbers are masked. This alert is sent automatically by Ai Voice Analysis.</p>
</div></div>`;

    return { subject, text, html };
}
