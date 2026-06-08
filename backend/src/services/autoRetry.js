/**
 * autoRetry.js
 *
 * Background service that automatically retries presales tickets that failed
 * analysis. Uses a blacklist approach — retries everything except tickets
 * explicitly marked "permanent_failed:..." which are unrecoverable.
 *
 * On each retry:
 *   1. Re-downloads the recording from TeleCMI (GCS file deleted after failure)
 *   2. If TeleCMI says the recording is gone → marks permanent_failed, never retries again
 *   3. If download succeeds → re-triggers analysis
 *   4. After MAX_ATTEMPTS failures → marks permanent_failed: max retries exceeded
 *
 * Env vars:
 *   RETRY_BATCH_SIZE    Tickets processed per cycle         (default: 3)
 *   RETRY_INTERVAL_MS   Milliseconds between cycles        (default: 20 min)
 *   RETRY_MAX_ATTEMPTS  Max retries per ticket per session  (default: 10)
 */

import { supabaseAdmin } from '../config/supabase.js';
import { storeTelecmiRecordingForAnalysis } from './telecmiRecording.js';
import { triggerPresalesAnalysis } from './presalesAnalysis.js';

const BATCH_SIZE    = Number(process.env.RETRY_BATCH_SIZE)   || 3;
const INTERVAL_MS   = Number(process.env.RETRY_INTERVAL_MS)  || 20 * 60 * 1000;
const MAX_ATTEMPTS  = Number(process.env.RETRY_MAX_ATTEMPTS) || 10;
const INITIAL_DELAY = 3 * 60 * 1000;  // wait 3 min after boot before first run
const STAGGER_MS    = 20 * 1000;      // 20s between tickets in a batch

const sleep = ms => new Promise(r => setTimeout(r, ms));

// In-memory retry counter — resets on server restart (intentional:
// a new deploy means quota may have been increased or code was fixed)
const retryAttempts = new Map();

// Returns true if the download error means TeleCMI permanently lost the recording
function isTelecmiPermanentFailure(err) {
    const msg = err?.message || '';
    return (
        msg.includes('TeleCMI error:') ||          // TeleCMI returned a JSON error payload
        msg.includes('TeleCMI download failed (404)') || // 404 from TeleCMI
        msg.includes('TeleCMI recording unavailable')    // catch-all from downloadTelecmiRecording
    );
}

async function markPermanentFailed(ticketId, reason) {
    await supabaseAdmin
        .from('tickets')
        .update({ status: 'analysis_failed', analysiserror: `permanent_failed: ${reason}` })
        .eq('id', ticketId);
    console.warn(`Auto-retry: permanently failed ${ticketId} — ${reason}`);
}

async function runRetryBatch() {
    try {
        // Blacklist approach: retry everything that isn't permanently failed
        const { data: tickets, error } = await supabaseAdmin
            .from('tickets')
            .select('id, telecmi_filename, client_id, clientname, createdby, durationseconds, selldo_agent_name, selldo_agent_email, telecmi_lead_id, selldo_team_name')
            .eq('status', 'analysis_failed')
            .eq('source', 'telecmi')
            .not('telecmi_filename', 'is', null)
            .not('analysiserror', 'ilike', 'permanent_failed%')
            .order('createdat', { ascending: true })
            .limit(BATCH_SIZE);

        if (error) {
            console.warn('Auto-retry: DB query failed:', error.message);
            return;
        }

        if (!tickets || tickets.length === 0) return;

        console.log(`Auto-retry: ${tickets.length} eligible ticket(s) found`);

        for (const ticket of tickets) {
            const attempts = retryAttempts.get(ticket.id) || 0;

            if (attempts >= MAX_ATTEMPTS) {
                await markPermanentFailed(ticket.id, 'max retries exceeded');
                retryAttempts.delete(ticket.id);
                continue;
            }

            // Re-download recording from TeleCMI — GCS file was deleted on original failure
            try {
                await storeTelecmiRecordingForAnalysis(ticket.telecmi_filename, ticket.id, true);
            } catch (downloadErr) {
                if (isTelecmiPermanentFailure(downloadErr)) {
                    // TeleCMI no longer has this recording — mark permanent, never retry again
                    await markPermanentFailed(ticket.id, 'TeleCMI recording unavailable');
                    retryAttempts.delete(ticket.id);
                } else {
                    // Transient network/timeout error — skip this cycle, try next time
                    console.warn(`Auto-retry: re-download failed for ${ticket.id} (transient):`, downloadErr.message);
                }
                continue;
            }

            // Reset ticket so triggerPresalesAnalysis picks it up cleanly
            await supabaseAdmin
                .from('tickets')
                .update({ status: 'pending', analysiserror: null })
                .eq('id', ticket.id);

            // Fire analysis — no await, triggerPresalesAnalysis handles all status updates
            triggerPresalesAnalysis(ticket.id, ticket).catch(err => {
                console.error(`Auto-retry: analysis failed for ${ticket.id}:`, err.message);
            });

            retryAttempts.set(ticket.id, attempts + 1);
            console.log(`Auto-retry: queued ${ticket.id} (attempt ${attempts + 1}/${MAX_ATTEMPTS})`);

            await sleep(STAGGER_MS);
        }
    } catch (err) {
        console.warn('Auto-retry: unexpected error in batch:', err.message);
    }
}

export function startAutoRetry() {
    console.log(`Auto-retry service scheduled — first run in 3 min, then every ${INTERVAL_MS / 60000} min`);
    setTimeout(() => {
        runRetryBatch();
        setInterval(runRetryBatch, INTERVAL_MS);
    }, INITIAL_DELAY);
}
