/**
 * vertexQueue.js
 *
 * Factory that creates independent Vertex AI rate-limited queues.
 * Use createVertexQueue(config) to get a queue instance with its own
 * semaphore, RPM window, and retry settings.
 *
 * Two instances are created in queues.js:
 *   proQueue   — Gemini 2.5 Pro,   site visits  (CONCURRENT=1, low RPM)
 *   flashQueue — Gemini 2.5 Flash, presales     (CONCURRENT=3, higher RPM)
 *
 * Exported:
 *   createVertexQueue(config) → { callVertex, getQueueStats, clearQueue }
 *   is429(error)              → boolean  (shared utility, no instance state)
 */

/**
 * Returns true if the error is a Vertex AI 429 / RESOURCE_EXHAUSTED or 503 / SERVICE_UNAVAILABLE.
 */
export function is429(error) {
    const code = Number(error?.code ?? error?.status ?? error?.statusCode);
    if (code === 429 || code === 503) return true;
    const msg = String(error?.message || '');
    // Whole-number match only: "Unterminated string in JSON at position 31429"
    // is a bad model response, not a quota error, and must reach the repair retry.
    return (
        /(^|[^0-9])(429|503)([^0-9]|$)/.test(msg) ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('SERVICE_UNAVAILABLE')
    );
}

/**
 * createVertexQueue(config)
 *
 * @param {object} config
 * @param {number} config.maxConcurrent  Max simultaneous Vertex AI calls
 * @param {number} config.maxRpm         Max requests per 60-second window
 * @param {number} config.backoffBaseMs  Base delay for exponential backoff
 * @param {number} config.maxRetries     Max 429 retry attempts
 * @param {string} config.label          Log label (e.g. 'pro', 'flash')
 *
 * @returns {{ callVertex, getQueueStats, clearQueue }}
 */
export function createVertexQueue({ maxConcurrent, maxRpm, backoffBaseMs, maxRetries, label = 'vertex' }) {
    // ── Semaphore ─────────────────────────────────────────────────────────────

    let activeSlots = 0;
    const waitQueue = [];

    function acquireSlot() {
        return new Promise((resolve, reject) => {
            if (activeSlots < maxConcurrent) {
                activeSlots++;
                resolve();
            } else {
                waitQueue.push({ resolve, reject });
            }
        });
    }

    function releaseSlot() {
        const next = waitQueue.shift();
        if (next) {
            next.resolve(); // hand our slot straight to the next waiter
        } else {
            activeSlots--;
        }
    }

    // ── RPM rate limiter ──────────────────────────────────────────────────────

    const callTimestamps = [];

    function recordCall() {
        callTimestamps.push(Date.now());
    }

    async function waitForRpmSlot() {
        while (true) {
            const now = Date.now();
            while (callTimestamps.length > 0 && callTimestamps[0] <= now - 60_000) {
                callTimestamps.shift();
            }
            if (callTimestamps.length < maxRpm) {
                // Claim the slot in the same tick as the check, so concurrent jobs
                // cannot all pass the check before any of them is recorded.
                recordCall();
                break;
            }
            const waitMs = callTimestamps[0] + 60_000 - now + 100;
            console.log(`[${label}] RPM limit (${callTimestamps.length}/${maxRpm}/min) — waiting ${Math.round(waitMs / 1000)}s`);
            await new Promise(r => setTimeout(r, waitMs));
        }
    }

    // ── Backoff ───────────────────────────────────────────────────────────────

    function backoffDelay(attempt) {
        const exp    = backoffBaseMs * Math.pow(2, attempt);
        const jitter = Math.random() * 10_000;
        return Math.min(exp + jitter, 300_000);
    }

    // ── Main callVertex ───────────────────────────────────────────────────────

    async function callVertex(fn, callLabel = label) {
        let attempt = 0;

        while (true) {
            await acquireSlot();
            await waitForRpmSlot();

            try {
                const result = await fn();
                releaseSlot();
                return result;
            } catch (error) {
                releaseSlot();

                if (is429(error) && attempt < maxRetries) {
                    const delay = backoffDelay(attempt);
                    console.warn(
                        `[${callLabel}] Vertex AI 429/503 — attempt ${attempt + 1}/${maxRetries}.` +
                        ` Retrying in ${Math.round(delay / 1000)}s`
                    );
                    await new Promise(r => setTimeout(r, delay));
                    attempt++;
                    continue;
                }

                throw error;
            }
        }
    }

    // ── Stats / drain ─────────────────────────────────────────────────────────

    function getQueueStats() {
        const now = Date.now();
        const recentCalls = callTimestamps.filter(t => t > now - 60_000).length;
        return {
            active:        activeSlots,
            waiting:       waitQueue.length,
            maxConcurrent,
            rpm:           recentCalls,
            maxRpm,
        };
    }

    // Cancels every job still waiting for a slot (their callVertex rejects with
    // "Queue cleared by admin"). Running jobs are left alone. Previously this
    // granted every waiter a slot at once, so "clear" actually started them all.
    function clearQueue() {
        const count = waitQueue.length;
        while (waitQueue.length > 0) {
            waitQueue.shift().reject(new Error('Queue cleared by admin'));
        }
        return count;
    }

    return { callVertex, getQueueStats, clearQueue };
}
