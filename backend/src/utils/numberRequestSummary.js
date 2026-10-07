// Daily "number request" summary email for operations + HR. Pure function (no I/O).
import { maskNumbersInText } from './maskPhone.js';
import { isExcludedFromChat } from './numberRequestEmail.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = s => maskNumbersInText(String(s ?? '').trim());
const IST = 'Asia/Kolkata';

const IST_OFFSET_MS = 330 * 60 * 1000;

export function summaryTime() {
    const m = /^(\d{1,2}):(\d{2})$/.exec(process.env.NUMBER_SUMMARY_TIME || '21:00');
    return m ? { h: Number(m[1]), min: Number(m[2]) } : { h: 21, min: 0 };
}

/** Latest run time (HH:MM IST) at or before `now`. */
export function latestRunAt(now = new Date(), { h, min } = summaryTime()) {
    const ist = new Date(now.getTime() + IST_OFFSET_MS);
    let run = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), h, min) - IST_OFFSET_MS;
    if (run > now.getTime()) run -= 24 * 60 * 60 * 1000;
    return new Date(run);
}


const fmtDay = d => new Date(d).toLocaleDateString('en-IN', { timeZone: IST, day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = d => new Date(d).toLocaleTimeString('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: true });
const fmtDateTime = d => (d ? `${fmtDay(d)}, ${fmtTime(d)}` : '—');
function fmtDuration(seconds) {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s <= 0) return '—';
    return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
}

function countBy(rows, key) {
    const map = new Map();
    for (const r of rows) {
        const k = key(r);
        const cur = map.get(k) || { calls: 0, requests: 0, agents: new Set(), team: r.teamName, first: null, last: null };
        cur.calls += 1;
        cur.requests += r.instances.length;
        cur.agents.add(r.agentName);
        const t = r.ticket.createdat;
        if (t && (!cur.first || t < cur.first)) cur.first = t;
        if (t && (!cur.last || t > cur.last)) cur.last = t;
        map.set(k, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].calls - a[1].calls || String(a[0]).localeCompare(String(b[0])));
}

/**
 * @param {object} p
 * @param {Array}  p.calls  [{ ticket, agentName, teamName, summary, instances, emailSentAt }]
 * @param {Date|string} p.from  window start
 * @param {Date|string} p.to    window end (the report day is taken from this)
 * @param {string[]} [p.chatExcluded]  SYNOLOGY_CHAT_EXCLUDE words, to show which calls skipped chat
 * @param {string}  [p.dashboardUrl]
 * @returns {{ subject: string, text: string, html: string }}
 */
export function buildNumberRequestSummary({ calls = [], from, to, chatExcluded = [], dashboardUrl }) {
    const day = fmtDay(to);
    const window = `${fmtDateTime(from)} to ${fmtDateTime(to)} IST`;
    const rows = calls
        .map(c => ({ ...c, agentName: clean(c.agentName) || 'Unknown agent', teamName: clean(c.teamName) || 'No team', instances: c.instances || [] }))
        .sort((a, b) => a.teamName.localeCompare(b.teamName) || a.agentName.localeCompare(b.agentName) || String(a.ticket.createdat).localeCompare(String(b.ticket.createdat)));
    const base = dashboardUrl ? dashboardUrl.replace(/\/+$/, '') : null;
    const link = id => (base && id ? `${base}/admin/tickets/${id}` : null);

    if (!rows.length) {
        const subject = `Number Request Summary – ${day}: no number requests today`;
        const text = `No presales agent asked a customer for a phone number between ${window}.\n\nThis summary is sent automatically by Ai Voice Analysis every day at 9 pm.`;
        const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;max-width:760px">
<div style="background:#27316f;color:#fff;padding:12px 16px;font-size:16px"><strong>Number Request Summary – ${esc(day)}</strong></div>
<div style="border:1px solid #ddd;border-top:0;padding:16px"><p style="margin:0"><strong>No number requests today.</strong></p>
<p style="color:#555">No presales agent asked a customer for a phone number between ${esc(window)}.</p>
<p style="color:#888;font-size:12px;margin-bottom:0">Sent automatically by Ai Voice Analysis every day at 9 pm.</p></div></div>`;
        return { subject, text, html };
    }

    const totalRequests = rows.reduce((n, r) => n + r.instances.length, 0);
    const byTeam = countBy(rows, r => r.teamName);
    const byAgent = countBy(rows, r => `${r.agentName}\u0000${r.teamName}`);
    const agentCount = byAgent.length;
    const subject = `Number Request Summary – ${day}: ${rows.length} call${rows.length === 1 ? '' : 's'} by ${agentCount} agent${agentCount === 1 ? '' : 's'}`;

    const alertsFor = r => {
        const email = r.emailSentAt ? `HR email sent ${fmtTime(r.emailSentAt)}` : 'HR email not recorded';
        const chat = isExcludedFromChat({ agentName: r.agentName, teamName: r.teamName }, chatExcluded) ? 'Synology Chat skipped (excluded team/agent)' : 'Synology Chat eligible';
        return `${email} · ${chat}`;
    };

    // ── Plain text ──
    const t = [];
    t.push(`NUMBER REQUEST SUMMARY – ${day}`, `Window: ${window}`, '');
    t.push('OVERVIEW', `Flagged calls: ${rows.length}`, `Number requests (instances): ${totalRequests}`, `Agents involved: ${agentCount}`, `Teams involved: ${byTeam.length}`, '');
    t.push('BY TEAM');
    for (const [team, v] of byTeam) t.push(`- ${team}: ${v.calls} call(s), ${v.requests} request(s), ${v.agents.size} agent(s)`);
    t.push('', 'BY AGENT');
    for (const [key, v] of byAgent) {
        const [agent, team] = key.split('\u0000');
        t.push(`- ${agent} (${team}): ${v.calls} call(s), ${v.requests} request(s), ${fmtTime(v.first)}–${fmtTime(v.last)}`);
    }
    t.push('', 'CALL DETAILS');
    rows.forEach((r, i) => {
        t.push('', `${i + 1}. ${r.agentName} · ${r.teamName} · ${fmtDateTime(r.ticket.createdat)} · ${fmtDuration(r.ticket.durationseconds)}`);
        if (r.ticket.telecmi_lead_id) t.push(`   Lead ID: ${clean(r.ticket.telecmi_lead_id)}`);
        t.push(`   Ticket: ${link(r.ticket.id) || r.ticket.id}`);
        t.push(`   Summary: ${clean(r.summary) || 'No summary available.'}`);
        t.push('   Proof of speech:');
        for (const inst of r.instances) {
            t.push(`     ${inst.time ? `[${clean(inst.time)}] ` : ''}"${clean(inst.transcript_excerpt) || '(no transcript excerpt)'}"`);
            if (inst.reason) t.push(`       ${clean(inst.reason)}`);
        }
        t.push(`   Alerts: ${alertsFor(r)}`);
    });
    t.push('', 'Customer numbers are masked. Sent automatically by Ai Voice Analysis every day at 9 pm.');

    // ── HTML ──
    const th = s => `<th style="text-align:left;padding:6px 10px;background:#f1f2f8;color:#27316f;border-bottom:1px solid #ddd">${esc(s)}</th>`;
    const td = s => `<td style="padding:6px 10px;border-bottom:1px solid #eee;vertical-align:top">${s}</td>`;
    const stat = (n, label) => `<td style="padding:10px 14px;border:1px solid #e3e5f0;text-align:center"><div style="font-size:22px;font-weight:bold;color:#27316f">${n}</div><div style="color:#555;font-size:12px">${esc(label)}</div></td>`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;max-width:760px">
<div style="background:#27316f;color:#fff;padding:12px 16px;font-size:16px"><strong>Number Request Summary – ${esc(day)}</strong></div>
<div style="border:1px solid #ddd;border-top:0;padding:16px">
<p style="margin-top:0;color:#555">${esc(window)}</p>
<table style="border-collapse:collapse;margin-bottom:16px"><tr>${stat(rows.length, 'Flagged calls')}${stat(totalRequests, 'Number requests')}${stat(agentCount, 'Agents')}${stat(byTeam.length, 'Teams')}</tr></table>
<h3 style="color:#27316f;margin:16px 0 6px">By team</h3>
<table style="border-collapse:collapse;width:100%"><tr>${th('Team')}${th('Calls')}${th('Requests')}${th('Agents')}</tr>
${byTeam.map(([team, v]) => `<tr>${td(esc(team))}${td(v.calls)}${td(v.requests)}${td(v.agents.size)}</tr>`).join('')}</table>
<h3 style="color:#27316f;margin:16px 0 6px">By agent</h3>
<table style="border-collapse:collapse;width:100%"><tr>${th('Agent')}${th('Team')}${th('Calls')}${th('Requests')}${th('First – last call')}</tr>
${byAgent.map(([key, v]) => { const [agent, team] = key.split('\u0000'); return `<tr>${td(`<strong>${esc(agent)}</strong>`)}${td(esc(team))}${td(v.calls)}${td(v.requests)}${td(`${esc(fmtTime(v.first))} – ${esc(fmtTime(v.last))}`)}</tr>`; }).join('')}</table>
<h3 style="color:#27316f;margin:20px 0 6px">Call details</h3>
${rows.map((r, i) => `<div style="border:1px solid #e3e5f0;border-left:4px solid #27316f;padding:10px 12px;margin-bottom:10px">
<div><strong>${i + 1}. ${esc(r.agentName)}</strong> · ${esc(r.teamName)} · ${esc(fmtDateTime(r.ticket.createdat))} · ${esc(fmtDuration(r.ticket.durationseconds))}</div>
<div style="color:#555;font-size:12px;margin-top:2px">${r.ticket.telecmi_lead_id ? `Lead ID ${esc(clean(r.ticket.telecmi_lead_id))} · ` : ''}${link(r.ticket.id) ? `<a href="${esc(link(r.ticket.id))}" style="color:#27316f">Open the call</a>` : `Ticket ${esc(r.ticket.id)}`}</div>
<p style="margin:8px 0"><strong>Summary:</strong> ${esc(clean(r.summary) || 'No summary available.')}</p>
<div style="font-weight:bold;margin-bottom:4px">Proof of speech</div>
${r.instances.map(inst => `<div style="border-left:4px solid #f5aa1d;background:#fafafa;padding:6px 10px;margin-bottom:6px">${inst.time ? `<span style="color:#555;font-size:12px">At ${esc(clean(inst.time))}</span><br>` : ''}&ldquo;${esc(clean(inst.transcript_excerpt) || '(no transcript excerpt)')}&rdquo;${inst.reason ? `<div style="color:#555;font-size:12px;margin-top:2px">${esc(clean(inst.reason))}</div>` : ''}</div>`).join('')}
<div style="color:#555;font-size:12px">Alerts: ${esc(alertsFor(r))}</div>
</div>`).join('\n')}
<p style="color:#888;font-size:12px;margin-bottom:0">Customer numbers are masked. Sent automatically by Ai Voice Analysis every day at 9 pm.</p>
</div></div>`;

    return { subject, text: t.join('\n'), html };
}
