import { VertexAI } from '@google-cloud/vertexai';
import { supabaseAdmin } from '../config/supabase.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

// ── Vertex AI (for synthesising the daily summary) ─────────────────────────
const projectId = process.env.VERTEX_PROJECT || process.env.GCS_PROJECT_ID;
const location  = process.env.VERTEX_LOCATION || 'us-central1';
const modelName = process.env.VERTEX_MODEL    || 'gemini-2.5-pro';
const vertexAI  = new VertexAI({ project: projectId, location });
const model     = vertexAI.getGenerativeModel({ model: modelName });

// ── Meta WhatsApp Cloud API ─────────────────────────────────────────────────
const WA_TOKEN    = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WA_TO       = process.env.WHATSAPP_RECIPIENT_NUMBER; // e.g. 917358046400

/**
 * Query Supabase for tickets + analysis summaries from the last 24 hours.
 * Returns { ticketRows, analysisByTicket, userMap }
 */
async function fetchTodayData() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Tickets in the last 24h (exclude training calls)
    const { data: tickets, error: ticketErr } = await supabaseAdmin
        .from('tickets')
        .select('id, status, rating, createdby, clientname, visittype, createdat, istrainingcall')
        .is('deletedat', null)
        .eq('istrainingcall', false)
        .gte('createdat', since);

    if (ticketErr) throw new Error('Failed to fetch tickets: ' + ticketErr.message);

    // 2. All active employees
    const { data: users, error: userErr } = await supabaseAdmin
        .from('users')
        .select('id, fullname')
        .eq('role', 'employee')
        .eq('status', 'active');

    if (userErr) throw new Error('Failed to fetch users: ' + userErr.message);

    const userMap = new Map((users || []).map(u => [u.id, u.fullname]));

    // 3. Analysis summaries for analyzed tickets
    const analyzedIds = (tickets || [])
        .filter(t => t.status === 'analyzed')
        .map(t => t.id);

    const analysisByTicket = new Map();
    for (let i = 0; i < analyzedIds.length; i += 200) {
        const batch = analyzedIds.slice(i, i + 200);
        const { data } = await supabaseAdmin
            .from('analysisresults')
            .select('ticketid, summary, rating')
            .in('ticketid', batch);
        if (data) data.forEach(a => analysisByTicket.set(a.ticketid, a));
    }

    return { tickets: tickets || [], analysisByTicket, userMap };
}

/**
 * Use Vertex AI to synthesise all executive brief summaries into one daily paragraph.
 */
async function synthesiseSummary(summaries) {
    if (summaries.length === 0) return 'No calls were analysed today.';
    if (summaries.length === 1) return summaries[0];

    const prompt = `You are a senior sales manager. Below are executive briefs from ${summaries.length} sales calls that happened today. 
Write ONE concise paragraph (3-4 sentences max) that summarises the overall team performance, highlights any common themes, and mentions any standout issues or wins. 
Be direct and professional. Do NOT use bullet points.

Executive Briefs:
${summaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    try {
        const response = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 512 }
        });
        const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text;
        return text?.trim() || summaries.join(' ');
    } catch (err) {
        console.error('⚠️ Vertex AI synthesis failed, using fallback:', err.message);
        // Fallback: just join first 3 summaries
        return summaries.slice(0, 3).join(' ');
    }
}

/**
 * Build the full WhatsApp report text.
 */
export async function buildDailyReport() {
    const { tickets, analysisByTicket, userMap } = await fetchTodayData();

    const today = new Date().toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    }); // e.g. "26 Mar 2026"

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });

    // ── Aggregate stats ─────────────────────────────────────────────────────
    const total    = tickets.length;
    const analyzed = tickets.filter(t => t.status === 'analyzed').length;
    const pending  = tickets.filter(t => ['pending', 'processing', 'uploaded', 'uploading', 'draft'].includes(t.status)).length;

    const ratings = tickets
        .map(t => {
            const a = analysisByTicket.get(t.id);
            return a?.rating ? Number(a.rating) : (t.rating ? Number(t.rating) : null);
        })
        .filter(r => r !== null);
    const avgRating10 = ratings.length > 0
        ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
        : null;
    const avgRating5 = avgRating10 ? (avgRating10 / 2).toFixed(1) : null;

    // ── Per-agent breakdown ─────────────────────────────────────────────────
    const agentMap = new Map();
    for (const ticket of tickets) {
        const name = userMap.get(ticket.createdby) || 'Unknown';
        const entry = agentMap.get(name) || { total: 0, analyzed: 0, ratingSum: 0, ratingCount: 0 };
        entry.total++;
        if (ticket.status === 'analyzed') {
            entry.analyzed++;
            const r = analysisByTicket.get(ticket.id)?.rating ?? ticket.rating;
            if (r) { entry.ratingSum += Number(r); entry.ratingCount++; }
        }
        agentMap.set(name, entry);
    }

    // Sort agents by total tickets desc
    const agentLines = [...agentMap.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, stats]) => {
            const ar = stats.ratingCount > 0
                ? ` | ⭐ ${(stats.ratingSum / stats.ratingCount / 2).toFixed(1)}/5`
                : '';
            return `  • ${name}: ${stats.total} ticket${stats.total !== 1 ? 's' : ''}${ar}`;
        })
        .join('\n');

    // ── Collect executive brief summaries for AI synthesis ──────────────────
    const summaries = tickets
        .filter(t => t.status === 'analyzed')
        .map(t => analysisByTicket.get(t.id)?.summary)
        .filter(Boolean);

    const overallSummary = await synthesiseSummary(summaries);

    // ── Compose the message ─────────────────────────────────────────────────
    const lines = [
        `📊 *Daily Sales Report — ${today}*`,
        ``,
        `👥 *Team Summary (Last 24h)*`,
        `• Total Tickets: ${total}`,
        `• Analysed: ${analyzed}  |  Pending: ${pending}`,
        avgRating5 ? `• Avg Rating: ⭐ ${avgRating5}/5` : `• Avg Rating: N/A`,
        ``,
        `🧑‍💼 *Agent Breakdown*`,
        agentLines || '  No tickets today.',
        ``,
        `📝 *Today's Overall Summary*`,
        overallSummary,
        ``,
        `📅 Next scheduled report: ${tomorrow} at 6:00 PM`,
    ];

    return lines.join('\n');
}

/**
 * Send a text message via WhatsApp Cloud API.
 */
export async function sendWhatsAppMessage(text) {
    if (!WA_TOKEN || !WA_PHONE_ID || !WA_TO) {
        throw new Error('WhatsApp env vars not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_RECIPIENT_NUMBER)');
    }

    const url = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`;

    const body = {
        messaging_product: 'whatsapp',
        to: WA_TO,
        type: 'text',
        text: { body: text }
    };

    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${WA_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const json = await resp.json();

    if (!resp.ok) {
        console.error('❌ WhatsApp API error:', json);
        throw new Error(`WhatsApp API error: ${json?.error?.message || resp.status}`);
    }

    console.log(`✅ WhatsApp message sent. Message ID: ${json?.messages?.[0]?.id}`);
    return json;
}

export default { buildDailyReport, sendWhatsAppMessage };
