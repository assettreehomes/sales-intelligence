import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { triggerPresalesAnalysis } from '../services/presalesAnalysis.js';
import { resolvePresalesOrg } from '../services/presalesDirectory.js';
import { storeTelecmiRecordingForAnalysis } from '../services/telecmiRecording.js';

const router = Router();

const TELECMI_APP_ID     = process.env.TELECMI_APP_ID;
const TELECMI_SECRET     = process.env.TELECMI_SECRET;
const MIN_DURATION_SECONDS = 20;
const SYNC_STAGGER_MS    = Number(process.env.VERTEX_SYNC_STAGGER_MS) || 1500;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Mask phone number — keep first 5 + last 2 digits, hide the rest with X
// e.g. 919840912567 → 91984XXXXX67, 9876543210 → 98765XXXX10
function maskPhone(number) {
    const s = String(number);
    if (s === 'unknown' || s.length < 7) return s;
    return s.slice(0, 5) + 'X'.repeat(Math.max(0, s.length - 7)) + s.slice(-2);
}

/**
 * Core CDR processing pipeline. Shared by both webhook and sync.
 * Returns { processed, skipped, reason?, ticketId? }
 * @param {object} cdr - The call detail record
 * @param {boolean} skipInitialDelay - Skip the 45s wait (use true for sync, false for webhook)
 */
async function processCdr(cdr, skipInitialDelay = false) {
    const cmiuid     = cdr.cmiuid   || cdr.cmiuuid || cdr.uid || null;
    const callId     = cdr.call_id  || null;
    const requestId  = cdr.request_id?.toString().trim() || null;
    const agent     = cdr.agent    || cdr.agentid || cdr.user || null;
    const direction = cdr.direction || 'outbound';
    // Explicit direction-aware customer number mapping:
    // outbound = agent calls customer → customer number is in 'to'
    // inbound  = customer calls in   → customer number is in 'from'
    const from      = maskPhone(direction === 'inbound'
        ? (cdr.from?.toString() || 'unknown')
        : (cdr.to?.toString()   || cdr.from?.toString() || 'unknown'));
    // webhook uses 'answeredsec'; sync API uses 'duration' or 'dur'
    const duration  = Number(cdr.duration || cdr.dur || cdr.answeredsec || 0);
    const filename  = cdr.filename || cdr.file    || null;
    const recorded  = String(cdr.record || cdr.recording || '').toLowerCase();
    const name      = (cdr.name && cdr.name !== 'unknown') ? cdr.name : from;
    const callTime  = cdr.time ? new Date(cdr.time).toISOString() : new Date().toISOString();

    // Parse lead/CRM ID from custom field (JSON string from Click-to-Call API)
    const rawCustom = (cdr.custom && cdr.custom !== 'false') ? String(cdr.custom) : null;
    let telecmiLeadId = null;
    if (rawCustom) {
        try {
            const parsed = JSON.parse(rawCustom);
            telecmiLeadId = parsed.lead_id || parsed.leadId || parsed.id || null;
            if (telecmiLeadId) telecmiLeadId = String(telecmiLeadId);
        } catch (_) {
            // custom is not valid JSON — store as-is, no lead ID extracted
        }
    }

    // ── Guards ──────────────────────────────────────────────────────────────
    // Trust filename presence as proof of recording — /answered API may omit 'record' field
    const isRecorded = recorded === 'true' || !!filename;
    if (!isRecorded) {
        return { skipped: true, reason: 'not_recorded' };
    }
    if (duration < MIN_DURATION_SECONDS) {
        return { skipped: true, reason: 'too_short', duration };
    }
    if (!filename) {
        return { skipped: true, reason: 'no_filename' };
    }
    if (!cmiuid) {
        return { skipped: true, reason: 'no_cmiuid' };
    }
    if (!TELECMI_APP_ID || !TELECMI_SECRET) {
        throw new Error('TELECMI_APP_ID or TELECMI_SECRET not set in environment');
    }

    // ── Idempotency ─────────────────────────────────────────────────────────
    const { data: existing } = await supabaseAdmin
        .from('tickets')
        .select('id')
        .eq('telecmi_cmiuid', cmiuid)
        .maybeSingle();

    if (existing) {
        return { skipped: true, reason: 'duplicate', ticketId: existing.id };
    }

    // ── Agent mapping ────────────────────────────────────────────────────────
    let agentUserId   = null;
    let agentFullname = null;
    if (agent) {
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('id, fullname')
            .eq('telecmi_agent_id', agent)
            .maybeSingle();
        if (user) {
            agentUserId   = user.id;
            agentFullname = user.fullname;
        }
    }

    // ── Create ticket ────────────────────────────────────────────────────────
    const ticketId  = uuidv4();
    const bucketName = process.env.GCS_BUCKET_UPLOADS || 'sales-audio-uploads-2025';

    const { error: insertError } = await supabaseAdmin
        .from('tickets')
        .insert({
            id:                ticketId,
            source:            'telecmi',
            telecmi_cmiuid:    cmiuid,
            telecmi_call_id:   callId,
            telecmi_filename:  filename,
            telecmi_user:      agent,           // raw e.g. "5088_33336999"
            telecmi_direction: direction,        // "inbound" | "outbound"
            telecmi_custom:      rawCustom,        // raw JSON string (null if custom=false)
            telecmi_lead_id:     telecmiLeadId,   // extracted lead ID or null
            telecmi_request_id:  requestId,       // TeleCMI request_id — used for Sell.Do matching
            client_id:         from,
            clientname:        name,
            visittype:         'telecmi_call',
            visitnumber:       1,
            createdby:         agentUserId,
            status:            'uploading',
            durationseconds:   duration || null,
            createdat:         callTime,
            gcspath:           `gs://${bucketName}/${ticketId}.mp3`
        });

    if (insertError) {
        throw new Error(`Failed to insert ticket: ${insertError.message}`);
    }

    console.log(`📞 TeleCMI: Created ticket ${ticketId} | agent=${agentFullname || agent || 'unmapped'} | from=${from} | duration=${duration}s`);

    // ── Reconcile pending Sell.Do data (graceful — never blocks ticket creation) ──
    if (callId || cmiuid) {
        try {
            // Sell.Do sends call_id for outbound, cmiuid for inbound — try both
            let pending = null;
            if (callId) {
                const { data } = await supabaseAdmin
                    .from('selldo_pending_calls')
                    .select('*')
                    .eq('call_id', callId)
                    .eq('matched', false)
                    .limit(1)
                    .maybeSingle();
                pending = data;
            }
            if (!pending && cmiuid) {
                const { data } = await supabaseAdmin
                    .from('selldo_pending_calls')
                    .select('*')
                    .eq('call_id', cmiuid)
                    .eq('matched', false)
                    .limit(1)
                    .maybeSingle();
                pending = data;
            }
            if (!pending && requestId) {
                const { data } = await supabaseAdmin
                    .from('selldo_pending_calls')
                    .select('*')
                    .eq('call_id', requestId)
                    .eq('matched', false)
                    .limit(1)
                    .maybeSingle();
                pending = data;
            }

            if (pending) {
                let org = {
                    agentId: pending.presales_agent_id || null,
                    teamId: pending.presales_team_id || null
                };
                try {
                    const mappedOrg = await resolvePresalesOrg({
                        agent_name: pending.agent_name,
                        agent_email: pending.agent_email,
                        team_name: pending.team_name
                    });
                    org = {
                        agentId: mappedOrg.agentId || org.agentId,
                        teamId: mappedOrg.teamId || org.teamId
                    };
                } catch (orgError) {
                    console.warn(`⚠️ TeleCMI: presales directory mapping skipped for pending Sell.Do call ${callId}:`, orgError.message);
                }

                const updates = {
                    selldo_call_id:     pending.call_id,
                    selldo_agent_name:  pending.agent_name,
                    selldo_agent_email: pending.agent_email || null,
                    selldo_team_name:   pending.team_name,
                    selldo_call_status: pending.call_status,
                    selldo_direction:   pending.direction,
                    selldo_enriched_at: new Date().toISOString(),
                    presales_agent_id:  org.agentId || null,
                    presales_team_id:   org.teamId || null
                };

                if (pending.lead_id) {
                    updates.telecmi_lead_id = String(pending.lead_id);
                    updates.client_id       = String(pending.lead_id);
                }

                const { error: enrichError } = await supabaseAdmin
                    .from('tickets')
                    .update(updates)
                    .eq('id', ticketId);

                if (enrichError) {
                    throw enrichError;
                }

                const { error: pendingUpdateError } = await supabaseAdmin
                    .from('selldo_pending_calls')
                    .update({
                        matched: true,
                        matched_ticket: ticketId,
                        matched_at: new Date().toISOString()
                    })
                    .eq('id', pending.id);

                if (pendingUpdateError) {
                    throw pendingUpdateError;
                }

                console.log(`🔗 TeleCMI→Sell.Do reconciled for ticket ${ticketId}`);
            }
        } catch (e) {
            console.warn(`⚠️ Sell.Do reconciliation skipped for ${ticketId}:`, e.message);
        }
    }

    // ── Download recording → GCS ─────────────────────────────────────────────
    try {
        await storeTelecmiRecordingForAnalysis(filename, ticketId, skipInitialDelay);

        await supabaseAdmin
            .from('tickets')
            .update({ status: 'pending' })
            .eq('id', ticketId);

        console.log(`☁️  TeleCMI: Recording uploaded to GCS for ticket ${ticketId}`);
    } catch (downloadError) {
        console.error(`❌ TeleCMI: Recording download failed for ${ticketId}:`, downloadError.message);
        await supabaseAdmin
            .from('tickets')
            .update({ status: 'analysis_failed', analysiserror: `Download failed: ${downloadError.message}` })
            .eq('id', ticketId);
        return { processed: false, ticketId, error: downloadError.message };
    }

    // ── Trigger presales analysis (async — doesn't block webhook response) ───
    const ticketForAnalysis = {
        id:             ticketId,
        client_id:      from,
        clientname:     name,
        createdby:      agentUserId,
        agent_name:     agentFullname,
        durationseconds: duration,
        source:         'telecmi'
    };

    triggerPresalesAnalysis(ticketId, ticketForAnalysis).catch(err => {
        console.error(`❌ TeleCMI: Analysis pipeline failed for ${ticketId}:`, err.message);
    });

    return { processed: true, ticketId };
}

// ============================================================
// POST /telecmi/webhook
// Called by TeleCMI when a call ends. No user auth.
// Returns 200 immediately; processing is fully async.
// ============================================================
router.post('/webhook', async (req, res) => {
    // Always respond 200 immediately — TeleCMI retries on anything else
    res.status(200).json({ received: true });

    const payload = req.body;
    if (!payload || typeof payload !== 'object') return;

    console.log('📞 TeleCMI webhook received:', JSON.stringify({
        timestamp: new Date().toISOString(),
        body: payload
    }));

    try {
        const result = await processCdr(payload);
        if (result.skipped) {
            console.log(`⏭️  TeleCMI webhook: skipped (${result.reason})`);
        } else if (result.processed) {
            console.log(`✅ TeleCMI webhook: queued analysis for ticket ${result.ticketId}`);
        }
    } catch (err) {
        console.error('❌ TeleCMI webhook processCdr error:', err.message);
    }
});

// ============================================================
// POST /telecmi/sync
// Admin-only: pull answered calls from TeleCMI API and process any new ones.
// Body: { start_date?: number (ms), end_date?: number (ms) }
// Defaults to last 24 hours.
// ============================================================
router.post('/sync', authMiddleware, requireAdmin, async (req, res) => {
    if (!TELECMI_APP_ID || !TELECMI_SECRET) {
        return res.status(500).json({ error: 'TELECMI_APP_ID / TELECMI_SECRET not configured' });
    }

    const now       = Date.now();
    const startDate = Number(req.body?.start_date) || (now - 24 * 60 * 60 * 1000);
    const endDate   = Number(req.body?.end_date)   || now;
    const page      = Number(req.body?.page)       || 1;
    const limit     = Math.min(Number(req.body?.limit) || 50, 100);

    console.log(`🔄 TeleCMI sync: ${new Date(startDate).toISOString()} → ${new Date(endDate).toISOString()}`);

    // Fetch answered calls from TeleCMI
    let cdrs = [];
    try {
        const telecmiRes = await fetch('https://rest.telecmi.com/v2/answered', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                appid:      Number(TELECMI_APP_ID),
                secret:     TELECMI_SECRET,
                start_date: startDate,
                end_date:   endDate,
                page,
                limit
            })
        });

        const telecmiData = await telecmiRes.json();

        if (!telecmiRes.ok || telecmiData.code !== 200) {
            return res.status(502).json({
                error: 'TeleCMI API error',
                details: telecmiData
            });
        }

        cdrs = telecmiData.cdr || [];
        console.log(`📋 TeleCMI sync: fetched ${cdrs.length} CDRs (total available: ${telecmiData.count})`);
        if (cdrs.length > 0) {
            console.log('📋 TeleCMI sync CDR sample:', JSON.stringify(cdrs[0]));
        }
    } catch (fetchErr) {
        return res.status(502).json({ error: `Failed to reach TeleCMI API: ${fetchErr.message}` });
    }

    // Process each CDR
    const results = { processed: 0, skipped: 0, failed: 0, errors: [] };

    for (const cdr of cdrs) {
        try {
            const result = await processCdr(cdr, true); // skipInitialDelay=true: recordings already available

            if (result.processed) {
                results.processed++;
            } else {
                results.skipped++;
            }
        } catch (err) {
            results.failed++;
            results.errors.push({ cmiuid: cdr.cmiuid, error: err.message });
            console.error(`❌ TeleCMI sync: CDR ${cdr.cmiuid} failed:`, err.message);
        }
        // Stagger each CDR to prevent simultaneous GCS uploads + analysis bursts
        await sleep(SYNC_STAGGER_MS);
    }

    console.log(`✅ TeleCMI sync complete:`, results);
    return res.json({ success: true, total_fetched: cdrs.length, ...results });
});

export default router;
