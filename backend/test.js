import dotenv from 'dotenv';
dotenv.config();  
import { Storage } from '@google-cloud/storage';

async function testAuth() {

  try {
    const storage = new Storage({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    
    const [buckets] = await storage.getBuckets();
    console.log('✅ Authentication successful!');
    console.log('Buckets:', buckets.map(b => b.name));
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
  }
}

testAuth();
