/**
 * vertexQueue.js
 *
 * Shared Vertex AI rate limiter used by both analysis flows
 * (presales phone calls and site visit recordings).
 *
 * Provides:
 *   - Semaphore: caps concurrent Vertex AI calls per process instance
 *   - RPM limiter: sliding 60s window prevents bursting past quota
 *   - Exponential backoff: retries 429 RESOURCE_EXHAUSTED with jitter
 *   - Transparency: callers get the exact same return value as a direct call
 *
 * Env vars:
 *   VERTEX_MAX_CONCURRENT   Max simultaneous calls (default: 3)
 *   VERTEX_MAX_RPM          Max requests per minute (default: 3)
 *   VERTEX_BACKOFF_BASE_MS  Base delay for backoff in ms (default: 30000)
 *   VERTEX_MAX_RETRIES      Max 429 retry attempts (default: 4)
 */

const MAX_CONCURRENT  = Number(process.env.VERTEX_MAX_CONCURRENT)  || 3;
const MAX_RPM         = Number(process.env.VERTEX_MAX_RPM)         || 3;
const BACKOFF_BASE_MS = Number(process.env.VERTEX_BACKOFF_BASE_MS) || 30_000;
const MAX_RETRIES     = Number(process.env.VERTEX_MAX_RETRIES)     || 4;

// ── Semaphore ─────────────────────────────────────────────────────────────────

let activeSlots = 0;
const waitQueue  = [];

function acquireSlot() {
    return new Promise(resolve => {
        if (activeSlots < MAX_CONCURRENT) {
            activeSlots++;
            resolve();
        } else {
            waitQueue.push(resolve);
        }
    });
}

function releaseSlot() {
    const next = waitQueue.shift();
    if (next) {
        // Hand the slot directly to the next waiter — activeSlots stays the same
        next();
    } else {
        activeSlots--;
    }
}

// ── RPM rate limiter ──────────────────────────────────────────────────────────
// Tracks timestamps of calls dispatched in the last 60 seconds.
// waitForRpmSlot() blocks until there is room under the MAX_RPM cap.

const callTimestamps = [];

function recordCall() {
    callTimestamps.push(Date.now());
}

async function waitForRpmSlot() {
    while (true) {
        const now = Date.now();
        // Evict entries older than 60 seconds
        while (callTimestamps.length > 0 && callTimestamps[0] <= now - 60_000) {
            callTimestamps.shift();
        }
        if (callTimestamps.length < MAX_RPM) break;
        // Wait until the oldest entry exits the 60s window (+100ms buffer)
        const waitMs = callTimestamps[0] + 60_000 - now + 100;
        console.log(`RPM limit (${callTimestamps.length}/${MAX_RPM}/min) — waiting ${Math.round(waitMs / 1000)}s`);
        await new Promise(r => setTimeout(r, waitMs));
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the error is a Vertex AI 429 / RESOURCE_EXHAUSTED.
 * Exported so callers can distinguish 429s from validation errors.
 */
export function is429(error) {
    const msg = String(error?.message || '');
    return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
}

function backoffDelay(attempt) {
    const exp    = BACKOFF_BASE_MS * Math.pow(2, attempt);       // 30s, 60s, 120s, 240s
    const jitter = Math.random() * 10_000;                       // up to 10s jitter
    return Math.min(exp + jitter, 300_000);                      // cap at 5 minutes
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * callVertex(fn, label?)
 *
 * Wraps any Vertex AI generateContent() call with:
 *   1. Semaphore acquisition  — waits if all slots are busy
 *   2. Execution of fn()
 *   3. On 429: releases slot, waits with exponential backoff, re-acquires, retries
 *   4. On any other error: releases slot, re-throws immediately
 *   5. On success: releases slot, returns result
 *
 * @param {() => Promise<any>} fn    Function wrapping model.generateContent(...)
 * @param {string}             label Optional label for log messages
 * @returns {Promise<any>}           Same value as fn() on success
 */
export async function callVertex(fn, label = 'vertex') {
    let attempt = 0;

    while (true) {
        await acquireSlot();
        await waitForRpmSlot();

        try {
            recordCall();
            const result = await fn();
            releaseSlot();
            return result;
        } catch (error) {
            releaseSlot();

            if (is429(error) && attempt < MAX_RETRIES) {
                const delay = backoffDelay(attempt);
                console.warn(
                    `⏳ [${label}] Vertex AI 429 — attempt ${attempt + 1}/${MAX_RETRIES}.` +
                    ` Retrying in ${Math.round(delay / 1000)}s`
                );
                await new Promise(r => setTimeout(r, delay));
                attempt++;
                continue;
            }

            // Non-429 error, or retries exhausted — let caller handle it
            throw error;
        }
    }
}

/**
 * getQueueStats()
 * Surfaced on /health so you can monitor queue pressure in production.
 */
export function getQueueStats() {
    const now = Date.now();
    const recentCalls = callTimestamps.filter(t => t > now - 60_000).length;
    return {
        active:        activeSlots,
        waiting:       waitQueue.length,
        maxConcurrent: MAX_CONCURRENT,
        rpm:           recentCalls,
        maxRpm:        MAX_RPM
    };
}
