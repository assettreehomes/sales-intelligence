import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { buckets } from '../config/gcs.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { triggerPresalesAnalysis } from '../services/presalesAnalysis.js';

const router = Router();

const TELECMI_APP_ID = process.env.TELECMI_APP_ID;
const TELECMI_SECRET  = process.env.TELECMI_SECRET;
const MIN_DURATION_SECONDS = 10;

/**
 * Download a recording from TeleCMI and upload it to GCS.
 * Returns the GCS path string.
 */
async function downloadAndStoreRecording(filename, ticketId) {
    const url = `https://rest.telecmi.com/v2/recordfile?appid=${TELECMI_APP_ID}&secret=${TELECMI_SECRET}&filename=${encodeURIComponent(filename)}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`TeleCMI download failed (${response.status}) for filename: ${filename}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    const gcsPath = `${ticketId}.mp3`;
    const gcsFile = buckets.uploads.file(gcsPath);

    await gcsFile.save(buffer, {
        contentType: 'audio/mpeg',
        metadata: { ticketId, source: 'telecmi', telecmiFilename: filename }
    });

    return `gs://${buckets.uploads.name}/${gcsPath}`;
}

/**
 * Core CDR processing pipeline. Shared by both webhook and sync.
 * Returns { processed, skipped, reason?, ticketId? }
 */
async function processCdr(cdr) {
    const cmiuid   = cdr.cmiuid   || cdr.uid    || null;
    const agent    = cdr.agent    || cdr.agentid || null;
    const from     = cdr.from?.toString()        || 'unknown';
    const duration = Number(cdr.duration || cdr.dur || 0);
    const filename = cdr.filename || cdr.file    || null;
    const recorded = String(cdr.record || cdr.recording || '').toLowerCase();
    const name     = (cdr.name && cdr.name !== 'unknown') ? cdr.name : from;
    const callTime = cdr.time ? new Date(cdr.time).toISOString() : new Date().toISOString();

    // ── Guards ──────────────────────────────────────────────────────────────
    if (recorded !== 'true') {
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
            id:               ticketId,
            source:           'telecmi',
            telecmi_cmiuid:   cmiuid,
            telecmi_filename: filename,
            client_id:        from,
            clientname:       name,
            visittype:        'telecmi_call',
            visitnumber:      1,
            createdby:        agentUserId,
            status:           'uploading',
            durationseconds:  duration || null,
            createdat:        callTime,
            gcspath:          `gs://${bucketName}/${ticketId}.mp3`
        });

    if (insertError) {
        throw new Error(`Failed to insert ticket: ${insertError.message}`);
    }

    console.log(`📞 TeleCMI: Created ticket ${ticketId} | agent=${agentFullname || agent || 'unmapped'} | from=${from} | duration=${duration}s`);

    // ── Download recording → GCS ─────────────────────────────────────────────
    try {
        await downloadAndStoreRecording(filename, ticketId);

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
    } catch (fetchErr) {
        return res.status(502).json({ error: `Failed to reach TeleCMI API: ${fetchErr.message}` });
    }

    // Process each CDR
    const results = { processed: 0, skipped: 0, failed: 0, errors: [] };

    for (const cdr of cdrs) {
        try {
            const result = await processCdr(cdr);
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
    }

    console.log(`✅ TeleCMI sync complete:`, results);
    return res.json({ success: true, total_fetched: cdrs.length, ...results });
});

export default router;
