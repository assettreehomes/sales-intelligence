import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

// GCS Configuration
const projectId = process.env.GCS_PROJECT_ID || 'sales-audio-intelligence';

// Initialize Storage client
const storage = new Storage({ projectId });

// Bucket configurations
export const buckets = {
    uploads: storage.bucket(process.env.GCS_BUCKET_UPLOADS || 'sales-audio-uploads-2025'),
    training: storage.bucket(process.env.GCS_BUCKET_TRAINING || 'sales-audio-training-library-2025'),
    temp: storage.bucket(process.env.GCS_BUCKET_TEMP || 'sales-audio-temp-2025')
};

// MIME type mappings
const mimeTypes = {
    'wav': 'audio/wav',
    'mp3': 'audio/mpeg',
    'm4a': 'audio/mp4',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    'webm': 'audio/webm',
    'aac': 'audio/aac'
};

/**
 * Generate a signed URL for uploading audio to the uploads bucket
 * Uses Impersonated Credentials (works with ADC, no key file needed)
 */
export async function generateUploadUrl(ticketId, filename) {
    const extension = filename.split('.').pop()?.toLowerCase() || 'mp3';
    const gcsPath = `${ticketId}.${extension}`;
    const contentType = mimeTypes[extension] || 'audio/mpeg';

    // Service account email for impersonation
    const serviceAccountEmail = process.env.GCS_SERVICE_ACCOUNT_EMAIL ||
        'sales-audio-backend@mystical-melody-486113-p0.iam.gserviceaccount.com';

    // Import GoogleAuth dynamically
    const { GoogleAuth, Impersonated } = await import('google-auth-library');

    // Create impersonated credentials
    const auth = new GoogleAuth();
    const sourceClient = await auth.getClient();

    const impersonatedCredentials = new Impersonated({
        sourceClient: sourceClient,
        targetPrincipal: serviceAccountEmail,
        lifetime: 3600,
        delegates: [],
        targetScopes: ['https://www.googleapis.com/auth/devstorage.read_write']
    });

    // Create a new Storage client with impersonated credentials
    const { Storage } = await import('@google-cloud/storage');
    const impersonatedStorage = new Storage({
        projectId: projectId,
        authClient: impersonatedCredentials
    });

    const bucket = impersonatedStorage.bucket(process.env.GCS_BUCKET_UPLOADS || 'sales-audio-uploads-2025');

    const [url] = await bucket.file(gcsPath).getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
        contentType: contentType
    });

    return {
        uploadUrl: url,
        gcsPath: `gs://${bucket.name}/${gcsPath}`,
        contentType
    };
}

/**
 * Generate a signed URL for audio playback
 */
export async function generatePlaybackUrl(bucketName, filePath) {
    try {
        const targetBucket = bucketName === 'training' ? buckets.training : buckets.uploads;

        // Use query parameter authentication instead of signed URLs
        // This works because Cloud Run service account already has storage.objectViewer
        const file = targetBucket.file(filePath);

        // Make the file temporarily accessible with a signed URL
        // The Cloud Run service account can sign on behalf of itself
        const options = {
            version: 'v4',
            action: 'read',
            expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        };

        const [url] = await file.getSignedUrl(options);
        return url;
    } catch (error) {
        console.error('Signed URL generation failed:', error.message);
        throw new Error(`Failed to generate playback URL: ${error.message}`);
    }
}

/**
 * Check if audio file exists in uploads bucket
 */
export async function checkAudioExists(ticketId) {
    const extensions = ['mp3', 'wav', 'm4a', 'ogg', 'webm', 'flac', 'aac'];

    for (const ext of extensions) {
        const [exists] = await buckets.uploads.file(`${ticketId}.${ext}`).exists();
        if (exists) {
            return { exists: true, extension: ext, path: `${ticketId}.${ext}` };
        }
    }

    return { exists: false, extension: null, path: null };
}

/**
 * Get GCS URI for Vertex AI
 */
export function getAudioUri(ticketId, extension = 'mp3') {
    return `gs://${buckets.uploads.name}/${ticketId}.${extension}`;
}

/**
 * Move audio to training bucket (promotion)
 */
export async function promoteToTraining(ticketId, extension = 'mp3') {
    const sourcePath = `${ticketId}.${extension}`;
    const destPath = `${ticketId}.${extension}`;

    await buckets.uploads.file(sourcePath).copy(buckets.training.file(destPath));

    return `gs://${buckets.training.name}/${destPath}`;
}

/**
 * Get training library audio URL
 */
export async function getTrainingAudioUrl(ticketId, extension = 'mp3') {
    const path = `${ticketId}.${extension}`;
    return generatePlaybackUrl('training', path);
}

export { storage, mimeTypes };
