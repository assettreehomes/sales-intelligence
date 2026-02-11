// Check auth.identities for orphan records
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

async function checkIdentities() {
    const email = 'tijop22175@cimario.com';

    console.log(`\n🔍 Checking for orphan records for: ${email}\n`);

    // Check auth.identities via raw SQL (need RPC or direct query)
    const { data, error } = await supabase.rpc('check_auth_identities', { target_email: email });

    if (error) {
        console.log('RPC not available, trying direct approach...');

        // Try to get more details from the error by creating with different email
        const testEmail = `test_${Date.now()}@test.com`;
        const { data: testUser, error: testError } = await supabase.auth.admin.createUser({
            email: testEmail,
            password: 'Test123456!',
            email_confirm: true
        });

        if (testError) {
            console.log('Test user creation also failed:', testError.message);
        } else {
            console.log('Test user created successfully:', testUser.user.id);
            console.log('Issue is specific to the email:', email);

            // Delete test user
            await supabase.auth.admin.deleteUser(testUser.user.id);
            console.log('Test user deleted');
        }
    } else {
        console.log('Identity data:', data);
    }
}

checkIdentities().catch(console.error);
