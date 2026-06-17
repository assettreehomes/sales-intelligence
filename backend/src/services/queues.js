/**
 * queues.js
 *
 * Two independent Vertex AI queue instances:
 *
 *   proQueue   — Gemini 2.5 Pro,   site visits  (serial, 1 at a time)
 *   flashQueue — Gemini 2.5 Flash, presales      (serial, 1 at a time)
 *
 * Both queues run serially (maxConcurrent=1) to prevent thundering-herd
 * quota exhaustion. Pro and Flash have separate quota pools on Vertex AI
 * so they never compete with each other.
 */

import { createVertexQueue } from './vertexQueue.js';

export const proQueue = createVertexQueue({
    maxConcurrent: Number(process.env.VERTEX_MAX_CONCURRENT_PRO)  || 1,
    maxRpm:        Number(process.env.VERTEX_MAX_RPM_PRO)         || 2,
    backoffBaseMs: Number(process.env.VERTEX_BACKOFF_BASE_MS_PRO) || 60_000,
    maxRetries:    Number(process.env.VERTEX_MAX_RETRIES_PRO)     || 6,
    label: 'pro',
});

export const flashQueue = createVertexQueue({
    maxConcurrent: Number(process.env.VERTEX_MAX_CONCURRENT_FLASH)  || 1,
    maxRpm:        Number(process.env.VERTEX_MAX_RPM_FLASH)         || 2,
    backoffBaseMs: Number(process.env.VERTEX_BACKOFF_BASE_MS_FLASH) || 60_000,
    maxRetries:    Number(process.env.VERTEX_MAX_RETRIES_FLASH)     || 6,
    label: 'flash',
});
