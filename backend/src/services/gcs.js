import { Storage } from '@google-cloud/storage';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

// Use GOOGLE_APPLICATION_CREDENTIALS from env
const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? join(__dirname, '../..', process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : null;

const storageOptions = {
    projectId: process.env.GCP_PROJECT_ID || 'sales-audio-intel-demo'
};

// Only add keyFilename if we have a path
if (keyFilePath) {
    storageOptions.keyFilename = keyFilePath;
}

const storage = new Storage(storageOptions);

const bucketName = process.env.GCS_BUCKET || 'sales-audio-demo';
const bucket = storage.bucket(bucketName);

/**
 * Generate a signed URL for uploading audio to raw/ folder
 * @param {string} ticketId 
 * @param {string} filename 
 * @returns {Promise<string>} Signed PUT URL
 */
export async function generateUploadUrl(ticketId, filename) {
    const extension = filename.split('.').pop()?.toLowerCase() || 'wav';
    const gcsPath = `raw/${ticketId}.${extension}`;

    // Map file extensions to MIME types
    const mimeTypes = {
        'wav': 'audio/wav',
        'mp3': 'audio/mpeg',
        'm4a': 'audio/mp4',
        'ogg': 'audio/ogg',
        'flac': 'audio/flac',
        'aac': 'audio/aac',
        'webm': 'audio/webm'
    };

    const contentType = mimeTypes[extension] || 'application/octet-stream';

    const [url] = await bucket.file(gcsPath).getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
        contentType: contentType
    });

    return {
        uploadUrl: url,
        gcsPath: `gs://${bucketName}/${gcsPath}`,
        contentType: contentType
    };
}

/**
 * Generate a signed URL for audio playback from raw/ folder
 * @param {string} ticketId 
 * @param {string} extension - File extension (default: wav)
 * @returns {Promise<string>} Signed GET URL
 */
export async function generatePlaybackUrl(ticketId, extension = 'wav') {
    // Check for audio in raw/ folder with various extensions
    const extensions = [extension, 'wav', 'mp3', 'm4a', 'ogg', 'webm'];

    for (const ext of extensions) {
        const rawPath = `raw/${ticketId}.${ext}`;
        const file = bucket.file(rawPath);
        const [exists] = await file.exists();

        if (exists) {
            const [url] = await file.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
            });
            return url;
        }
    }

    return null;
}

/**
 * Check if raw audio exists for a ticket
 * @param {string} ticketId 
 * @param {string} extension - File extension to check
 * @returns {Promise<{exists: boolean, extension: string}>}
 */
export async function checkRawAudioExists(ticketId, extension = null) {
    // Check for audio in raw/ folder with various extensions
    const extensions = extension ? [extension] : ['wav', 'mp3', 'm4a', 'ogg', 'webm', 'flac', 'aac'];

    for (const ext of extensions) {
        const rawPath = `raw/${ticketId}.${ext}`;
        const [exists] = await bucket.file(rawPath).exists();
        if (exists) {
            return { exists: true, extension: ext };
        }
    }

    return { exists: false, extension: null };
}

/**
 * Get the GCS URI for raw audio
 * @param {string} ticketId 
 * @param {string} extension - File extension
 * @returns {string}
 */
export function getRawAudioUri(ticketId, extension = 'wav') {
    return `gs://${bucketName}/raw/${ticketId}.${extension}`;
}
