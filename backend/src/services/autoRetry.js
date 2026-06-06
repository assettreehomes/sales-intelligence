/**
 * autoRetry.js
 *
 * Background service that automatically retries presales tickets that failed
 * analysis due to Vertex AI 429 RESOURCE_EXHAUSTED errors or a broken prior
 * retry attempt that left the ticket with "Audio not found in GCS".
 *
 * The GCS audio file is deleted on every failure, so each retry re-downloads
 * the recording from TeleCMI before re-triggering analysis.
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

async function runRetryBatch() {
    try {
        const { data: tickets, error } = await supabaseAdmin
            .from('tickets')
            .select('id, telecmi_filename, client_id, clientname, createdby, durationseconds, selldo_agent_name, selldo_agent_email, telecmi_lead_id, selldo_team_name')
            .eq('status', 'analysis_failed')
            .eq('source', 'telecmi')
            .not('telecmi_filename', 'is', null)
            .or('analysiserror.ilike.%429%,analysiserror.ilike.%Audio not found%')
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
                console.warn(`Auto-retry: max attempts (${MAX_ATTEMPTS}) reached for ${ticket.id} — skipping`);
                continue;
            }

            // Re-download recording from TeleCMI — GCS file was deleted on original failure
            try {
                await storeTelecmiRecordingForAnalysis(ticket.telecmi_filename, ticket.id, true);
            } catch (downloadErr) {
                // Download failure is a separate problem — leave as analysis_failed,
                // do not burn retry budget on a download issue
                console.warn(`Auto-retry: re-download failed for ${ticket.id}:`, downloadErr.message);
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
