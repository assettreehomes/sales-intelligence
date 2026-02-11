// Script to set CORS on GCS bucket
import { Storage } from '@google-cloud/storage';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyFilePath = join(__dirname, 'sales-audio-intel-demo-4aa6328d5485.json');

const storage = new Storage({
    keyFilename: keyFilePath,
    projectId: 'sales-audio-intel-demo'
});

const bucketName = 'sales-audio-demo';

async function setCors() {
    const corsConfig = [
        {
            origin: ['http://localhost:3000', 'http://localhost:3001', '*'],
            method: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'HEAD'],
            responseHeader: ['Content-Type', 'Content-Length', 'Content-Range', 'Accept', 'Authorization', 'Origin', 'X-Requested-With', 'Access-Control-Allow-Origin'],
            maxAgeSeconds: 3600
        }
    ];

    try {
        await storage.bucket(bucketName).setCorsConfiguration(corsConfig);
        console.log(`✅ CORS configuration set on bucket: ${bucketName}`);
        console.log('CORS config:', JSON.stringify(corsConfig, null, 2));
    } catch (error) {
        console.error('❌ Error setting CORS:', error.message);
    }
}

setCors();
