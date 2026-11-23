import express, { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { triggerPresalesAnalysis } from '../services/presalesAnalysis.js';
import { storeMcubeRecordingForAnalysis } from '../services/mcubeRecording.js';
import { parseMcubeCdr, isAllowedRecordingUrl } from '../utils/mcubeCdr.js';
import { maskPhone } from '../utils/maskPhone.js';
import { mcubeWebhookAllowed } from '../utils/webhookSecret.js';

// MCube → Plumbline. Mirrors the TeleCMI flow in routes/telecmi.js:
// push at hang-up → ticket (source 'mcube') → recording to GCS → presales analysis
// → Plumbline round robin (DB trigger on status 'analyzed').

const router = Router();
// MCube may post JSON or a form body
router.use(express.urlencoded({ extended: false, limit: '1mb' }));

const MIN_DURATION_SECONDS = Number.isFinite(Number(process.env.MCUBE_MIN_DURATION_SECONDS))
    && process.env.MCUBE_MIN_DURATION_SECONDS !== ''
    ? Number(process.env.MCUBE_MIN_DURATION_SECONDS)
    : 3;

const last10 = (d) => (d ? String(d).replace(/\D/g, '').slice(-10) : null);

function redact(payload) {
    const out = { ...payload };
    for (const key of ['callto', 'callfrom', 'caller', 'customer_number', 'emp_phone']) {
        if (out[key] != null) out[key] = maskPhone(String(out[key]).trim());
    }
    if (out.filename) out.filename = '[recording url]';
    return out;
}

// emp_phone → Plinth agent list (av_tel_agents.mcube_exe) → presales_employees by email.
// Read-only: unknown agents are left unmapped instead of creating directory rows.
async function mapAgent({ agentPhone, agentName, agentEmail }) {
    let email = agentEmail || null;
    const phone = last10(agentPhone);
    if (!email && phone) {
        const { data } = await supabaseAdmin
            .from('av_tel_agents')
            .select('dir_email, mcube_exe')
            .not('mcube_exe', 'is', null)
            .limit(500);
        const hit = (data || []).find(a => last10(a.mcube_exe) === phone);
        email = hit?.dir_email || null;
    }
    let emp = null;
    if (email) {
        const { data } = await supabaseAdmin
            .from('presales_employees')
            .select('id, full_name, team_id')
            .ilike('email', email)
            .limit(1)
            .maybeSingle();
        emp = data;
    }
    if (!emp && agentName) {
        const { data } = await supabaseAdmin
            .from('presales_employees')
            .select('id, full_name, team_id')
            .eq('status', 'active')
            .ilike('full_name', agentName)
            .limit(2);
        if (data?.length === 1) emp = data[0];
    }
    return { agentId: emp?.id || null, teamId: emp?.team_id || null, agentFullname: emp?.full_name || agentName || null, email };
}

export async function processMcubeCdr(payload, skipInitialDelay = false) {
    const cdr = parseMcubeCdr(payload);

    // ── Guards ───────────────────────────────────────────────────────────────
    if (!cdr.callId) return { skipped: true, reason: 'no_callid' };
    if (!cdr.answered) return { skipped: true, reason: `not_answered:${cdr.dialstatus || 'unknown'}` };
    if (!cdr.recordingUrl) return { skipped: true, reason: 'no_recording' };
    if (!isAllowedRecordingUrl(cdr.recordingUrl)) return { skipped: true, reason: 'recording_host_not_allowed' };
    if (cdr.talkSec < MIN_DURATION_SECONDS) return { skipped: true, reason: 'too_short', duration: cdr.talkSec };

    // ── Idempotency (MCube retries / duplicate pushes) ───────────────────────
    const { data: existing, error: existingError } = await supabaseAdmin
        .from('tickets').select('id').eq('mcube_callid', cdr.callId).limit(1);
    if (existingError) throw new Error(`Duplicate check failed: ${existingError.message}`);
    if (existing?.length) return { skipped: true, reason: 'duplicate', ticketId: existing[0].id };

    const org = await mapAgent(cdr).catch(err => {
        console.warn('⚠️ MCube: agent mapping skipped:', err.message);
        return { agentId: null, teamId: null, agentFullname: cdr.agentName, email: null };
    });

    // The customer number is never stored: masked for display only. The lead id
    // comes from the click-to-call passthrough or from Sell.Do reconciliation.
    const masked = cdr.customerNumber ? maskPhone(cdr.customerNumber) : 'unknown';
    const ticketId = uuidv4();
    const bucketName = process.env.GCS_BUCKET_UPLOADS || 'sales-audio-uploads-2025';

    const { error: insertError } = await supabaseAdmin.from('tickets').insert({
        id:                 ticketId,
        source:             'mcube',
        mcube_callid:       cdr.callId,
        mcube_recording_url: cdr.recordingUrl,
        mcube_agent_phone:  cdr.agentPhone,
        mcube_agent_name:   cdr.agentName,
        mcube_group:        cdr.group,
        mcube_did:          cdr.did,
        mcube_dialstatus:   cdr.dialstatus,
        mcube_disconnected_by: cdr.disconnectedBy,
        mcube_raw:          redact(payload),
        // Generic call columns that Plumbline and the analysis app already read
        telecmi_direction:  cdr.direction,
        telecmi_lead_id:    cdr.leadId,
        client_id:          cdr.leadId || masked,
        clientname:         masked,
        visittype:          'telecmi_call',
        visitnumber:        1,
        presales_agent_id:  org.agentId,
        presales_team_id:   org.teamId,
        selldo_agent_email: org.email,
        status:             'uploading',
        durationseconds:    cdr.talkSec || null,
        createdat:          cdr.startIso || new Date().toISOString(),
        gcspath:            `gs://${bucketName}/${ticketId}`
    });
    if (insertError) {
        if (insertError.code === '23505') return { skipped: true, reason: 'duplicate' };
        throw new Error(`Failed to insert ticket: ${insertError.message}`);
    }
    console.log(`📞 MCube: created ticket ${ticketId} | agent=${org.agentFullname || 'unmapped'} | ${cdr.direction} | ${cdr.talkSec}s`);

    // ── Sell.Do reconciliation (same table as TeleCMI; matched on MCube callid) ──
    try {
        const { data: pending } = await supabaseAdmin
            .from('selldo_pending_calls').select('*')
            .eq('call_id', cdr.callId).eq('matched', false).limit(1).maybeSingle();
        if (pending) {
            const updates = {
                selldo_call_id: pending.call_id,
                selldo_agent_name: pending.agent_name,
                selldo_agent_email: pending.agent_email || org.email,
                selldo_team_name: pending.team_name,
                selldo_call_status: pending.call_status,
                selldo_direction: pending.direction,
                selldo_enriched_at: new Date().toISOString(),
                presales_agent_id: pending.presales_agent_id || org.agentId,
                presales_team_id: pending.presales_team_id || org.teamId
            };
            if (pending.lead_id) {
                updates.telecmi_lead_id = String(pending.lead_id);
                updates.client_id = String(pending.lead_id);
            }
            await supabaseAdmin.from('tickets').update(updates).eq('id', ticketId);
            await supabaseAdmin.from('selldo_pending_calls')
                .update({ matched: true, matched_ticket: ticketId, matched_at: new Date().toISOString() })
                .eq('id', pending.id);
            console.log(`🔗 MCube→Sell.Do reconciled for ticket ${ticketId}`);
        }
    } catch (e) {
        console.warn(`⚠️ MCube: Sell.Do reconciliation skipped for ${ticketId}:`, e.message);
    }

    // ── Recording → GCS ──────────────────────────────────────────────────────
    try {
        const uri = await storeMcubeRecordingForAnalysis(cdr.recordingUrl, ticketId, skipInitialDelay);
        await supabaseAdmin.from('tickets').update({ status: 'pending', gcspath: uri }).eq('id', ticketId);
    } catch (err) {
        console.error(`❌ MCube: recording download failed for ${ticketId}:`, err.message);
        await supabaseAdmin.from('tickets')
            .update({ status: 'analysis_failed', analysiserror: `${err.permanent ? 'permanent_failed: ' : ''}Download failed: ${err.message}` })
            .eq('id', ticketId);
        return { processed: false, ticketId, error: err.message };
    }

    triggerPresalesAnalysis(ticketId, {
        id: ticketId,
        client_id: cdr.leadId || masked,
        clientname: masked,
        createdby: null,
        agent_name: org.agentFullname,
        durationseconds: cdr.talkSec,
        source: 'mcube'
    }).catch(err => console.error(`❌ MCube: analysis failed for ${ticketId}:`, err.message));

    return { processed: true, ticketId };
}

// ============================================================
// POST /mcube/webhook?secret=...
// Configured in MCube as the "call disconnect" push URL. No user auth;
// shared secret required (MCUBE_WEBHOOK_SECRET). Replies 200 at once.
// ============================================================
router.post('/webhook', (req, res) => {
    if (!mcubeWebhookAllowed(req)) {
        console.warn('⚠️ MCube webhook: invalid or missing secret');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return res.status(400).json({ error: 'Expected a JSON or form body' });
    }
    res.status(200).json({ received: true });

    console.log('📞 MCube webhook received:', JSON.stringify(redact(payload)));
    processMcubeCdr(payload)
        .then(r => console.log(r.skipped ? `⏭️  MCube webhook: skipped (${r.reason})` : `✅ MCube webhook: ticket ${r.ticketId}`))
        .catch(err => console.error('❌ MCube webhook error:', err.message));
});

export default router;
