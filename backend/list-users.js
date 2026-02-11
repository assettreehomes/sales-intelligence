// List all auth users and debug
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function listUsers() {
    console.log('\n📋 Listing all auth users...\n');

    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    console.log(`Found ${data.users.length} users:\n`);

    data.users.forEach(u => {
        console.log(`  ID: ${u.id}`);
        console.log(`  Email: ${u.email}`);
        console.log(`  Created: ${u.created_at}`);
        console.log('  ---');
    });
}

listUsers().catch(console.error);
