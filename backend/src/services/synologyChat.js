// Posts to a Synology Chat channel through an Incoming Webhook (Synology Chat > Integration >
// Incoming Webhooks, created for the target channel). The webhook URL carries its own token,
// so no DSM user or password is needed.
//
//   SYNOLOGY_CHAT_WEBHOOK_URL  full webhook URL copied from Synology Chat, e.g.
//                              https://<nas>.synology.me:5001/webapi/entry.cgi?api=SYNO.Chat.External&method=incoming&version=2&token=%22...%22

export function isSynologyChatConfigured() {
    return Boolean(process.env.SYNOLOGY_CHAT_WEBHOOK_URL);
}

// Use the URL exactly as Synology shows it (token wrapped in %22 quotes); only undo an HTML-escaped
// "&amp;" that sneaks in when the link is copied from a web page or chat.
export function webhookUrl() {
    return String(process.env.SYNOLOGY_CHAT_WEBHOOK_URL || '').trim().replace(/&amp;/g, '&');
}

// Last posts and their outcome, newest first, for the dashboard's Chat Integration page.
// In memory only (one Cloud Run instance): it starts empty after a redeploy or restart.
const RECENT_LIMIT = 50;
const recentPosts = [];

function recordPost(entry) {
    recentPosts.unshift({ at: new Date().toISOString(), ...entry });
    recentPosts.length = Math.min(recentPosts.length, RECENT_LIMIT);
}

export function recentSynologyPosts() {
    return recentPosts.slice();
}

/**
 * @param {string} text
 * @param {object} [meta]  { ticketId, test } kept with the outcome in recentSynologyPosts()
 */
export async function postSynologyChat(text, meta = {}) {
    try {
        await sendToSynology(text);
        recordPost({ ...meta, ok: true });
    } catch (err) {
        recordPost({ ...meta, ok: false, error: err.message });
        throw err;
    }
}

async function sendToSynology(text) {
    if (!isSynologyChatConfigured()) throw new Error('Synology Chat not configured: set SYNOLOGY_CHAT_WEBHOOK_URL');
    const res = await fetch(webhookUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ payload: JSON.stringify({ text }) }).toString()
    });
    // Synology answers 200 with {"success":false,"error":{...}} on a bad token or channel
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON body */ }
    if (!res.ok || json?.success === false) {
        throw new Error(`Synology Chat post failed: ${res.status}${json?.error?.code ? ` error ${json.error.code}` : ''}`);
    }
}
