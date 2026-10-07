// Outgoing email. One small adapter so the provider can change without touching callers.
// Configured only through environment variables; the API key never lives in code.
//
//   MAIL_PROVIDER         hostinger (default) — Hostinger Email API (api.mail.hostinger.com)
//   MAIL_API_KEY          the provider's API key / token for the sending mailbox
//   MAIL_FROM             sending mailbox, e.g. mis@assettreehomes.com
//   MAIL_FROM_NAME        optional display name (default "Ai Voice Analysis")
//   HOSTINGER_MAILBOX_ID  optional; otherwise looked up from MAIL_FROM via GET /api/v1/me

const HOSTINGER_API = process.env.HOSTINGER_MAIL_API_URL || 'https://api.mail.hostinger.com';

export function isMailConfigured() {
    return Boolean(process.env.MAIL_API_KEY && process.env.MAIL_FROM);
}

async function hostingerRequest(method, path, body) {
    const res = await fetch(`${HOSTINGER_API}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${process.env.MAIL_API_KEY}`,
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
        let detail = '';
        try { detail = (await res.json())?.code || ''; } catch { /* no body */ }
        throw new Error(`Hostinger mail ${method} ${path.split('/').slice(0, 4).join('/')} failed: ${res.status} ${detail}`.trim());
    }
    return res.status === 204 ? null : res.json();
}

let cachedMailboxId = null;
async function hostingerMailboxId() {
    if (process.env.HOSTINGER_MAILBOX_ID) return process.env.HOSTINGER_MAILBOX_ID;
    if (cachedMailboxId) return cachedMailboxId;
    const me = await hostingerRequest('GET', '/api/v1/me');
    const from = process.env.MAIL_FROM.trim().toLowerCase();
    const mailbox = (me?.data?.mailboxes || []).find(m => String(m.address).toLowerCase() === from);
    if (!mailbox) throw new Error(`MAIL_API_KEY cannot send as ${process.env.MAIL_FROM} (mailbox not found for this key)`);
    cachedMailboxId = mailbox.resourceId;
    return cachedMailboxId;
}

const providers = {
    async hostinger({ to, subject, text, html }) {
        const mailboxId = await hostingerMailboxId();
        await hostingerRequest('POST', `/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/send`, {
            to,
            subject,
            text,
            html,
            displayName: process.env.MAIL_FROM_NAME || 'Ai Voice Analysis'
        });
    }
};

/**
 * Send one email. `to` is a string or array of addresses.
 * Throws if mail is not configured or the provider rejects the message.
 */
export async function sendEmail({ to, subject, text, html }) {
    if (!isMailConfigured()) throw new Error('Email not configured: set MAIL_API_KEY and MAIL_FROM');
    const providerName = (process.env.MAIL_PROVIDER || 'hostinger').toLowerCase();
    const provider = providers[providerName];
    if (!provider) throw new Error(`Unknown MAIL_PROVIDER "${providerName}"`);
    const recipients = (Array.isArray(to) ? to : String(to).split(',')).map(s => s.trim()).filter(Boolean);
    await provider({ to: recipients, subject, text, html });
}
