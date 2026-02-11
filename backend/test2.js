import { Storage } from '@google-cloud/storage';

async function testAuth() {
  const storage = new Storage({
  projectId: 'mystical-melody-486113-p0', // Correct project ID
});

const bucket = storage.bucket('sales-audio-temp-2025-p0'); // Correct bucket name

  const file = bucket.file('healthcheck.txt');

  await file.save('ok');
  const [exists] = await file.exists();

  console.log('✅ Backend auth works:', exists);
}

testAuth();
