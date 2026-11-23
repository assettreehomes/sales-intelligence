import { buckets } from '../config/gcs.js';
import { isAllowedRecordingUrl, recordingExtension } from '../utils/mcubeCdr.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const FETCH_TIMEOUT_MS = 60_000;

export class McubeRecordingError extends Error {
    constructor(message, permanent = false) {
        super(message);
        this.permanent = permanent;
    }
}

/**
 * Download an MCube recording. MCube pushes the CDR at hang-up; the file can land
 * on S3 a little later, so the webhook path waits and retries.
 */
export async function downloadMcubeRecording(url, skipInitialDelay = false) {
    if (!isAllowedRecordingUrl(url)) {
        throw new McubeRecordingError('Recording URL is not an allowed MCube address', true);
    }
    const cleanUrl = String(url).trim();
    const maxAttempts = skipInitialDelay ? 2 : 4;
    const delaysMs = skipInitialDelay ? [5_000] : [20_000, 30_000, 60_000];

    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (attempt > 1) await sleep(delaysMs[attempt - 2] || 10_000);
        else if (!skipInitialDelay) await sleep(10_000);

        try {
            const response = await fetch(cleanUrl, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
            if (!response.ok) {
                // 403/404 right after hang-up usually means "not uploaded yet"; only the last attempt decides
                throw new McubeRecordingError(`MCube download failed (${response.status})`, attempt === maxAttempts && [403, 404, 410].includes(response.status));
            }
            const contentType = response.headers.get('content-type') || '';
            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.length < 1000 || /xml|json|html/i.test(contentType)) {
                throw new McubeRecordingError(`MCube recording not ready (${buffer.length} bytes, ${contentType || 'no type'})`);
            }
            return { buffer, extension: recordingExtension(cleanUrl, contentType), contentType };
        } catch (err) {
            lastError = err;
            console.warn(`⚠️  MCube: download attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
        }
    }
    throw lastError;
}

export async function storeMcubeRecordingForAnalysis(url, ticketId, skipInitialDelay = false) {
    const { buffer, extension, contentType } = await downloadMcubeRecording(url, skipInitialDelay);
    const gcsPath = `${ticketId}.${extension}`;
    await buckets.uploads.file(gcsPath).save(buffer, {
        contentType: contentType && !/octet-stream/i.test(contentType) ? contentType : (extension === 'wav' ? 'audio/wav' : 'audio/mpeg'),
        metadata: { ticketId, source: 'mcube' }
    });
    return `gs://${buckets.uploads.name}/${gcsPath}`;
}

export function isMcubePermanentFailure(err) {
    return !!err?.permanent;
}
