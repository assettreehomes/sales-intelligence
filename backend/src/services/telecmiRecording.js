import { buckets } from '../config/gcs.js';

const TELECMI_APP_ID = process.env.TELECMI_APP_ID;
const TELECMI_SECRET = process.env.TELECMI_SECRET;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function downloadTelecmiRecording(filename, skipInitialDelay = false) {
    if (!TELECMI_APP_ID || !TELECMI_SECRET) {
        throw new Error('TELECMI_APP_ID or TELECMI_SECRET not set in environment');
    }

    const url = `https://rest.telecmi.com/v2/play?appid=${TELECMI_APP_ID}&secret=${TELECMI_SECRET}&file=${encodeURIComponent(filename)}`;
    const maxAttempts = skipInitialDelay ? 2 : 4;
    const delaysMs = skipInitialDelay ? [5_000] : [30_000, 30_000];

    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (attempt > 1) {
            const delay = delaysMs[attempt - 2] || 5_000;
            console.log(`🔁 TeleCMI: Retry ${attempt - 1}/${maxAttempts - 1} for ${filename} — waiting ${delay / 1000}s`);
            await sleep(delay);
        } else if (!skipInitialDelay) {
            console.log(`⏳ TeleCMI: Waiting 45s for recording to be ready: ${filename}`);
            await sleep(45_000);
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`TeleCMI download failed (${response.status}) for filename: ${filename}`);
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.length < 1000) {
                throw new Error(`TeleCMI returned suspiciously small file (${buffer.length} bytes) — recording may not be ready yet`);
            }

            return buffer;
        } catch (err) {
            lastError = err;
            console.warn(`⚠️  TeleCMI: Download attempt ${attempt} failed for ${filename}: ${err.message}`);
        }
    }

    throw lastError;
}

export async function storeTelecmiRecordingForAnalysis(filename, ticketId, skipInitialDelay = false) {
    const buffer = await downloadTelecmiRecording(filename, skipInitialDelay);
    const gcsPath = `${ticketId}.mp3`;
    const gcsFile = buckets.uploads.file(gcsPath);

    await gcsFile.save(buffer, {
        contentType: 'audio/mpeg',
        metadata: { ticketId, source: 'telecmi', telecmiFilename: filename }
    });

    return `gs://${buckets.uploads.name}/${gcsPath}`;
}
