// Fix user by deleting orphan and creating fresh
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

async function fixUser() {
    const email = 'tijop22175@cimario.com';
    const password = 'TicketIntel2024!';
    const fullname = 'Test Employee';
    const role = 'employee';

    console.log(`\n🔧 Fixing user: ${email}\n`);

    // Step 1: Delete orphan from public.users (has no auth.users match)
    console.log('🗑️  Deleting orphan record from public.users...');
    const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('email', email);

    if (deleteError) {
        console.log('⚠️  Delete error (may not exist):', deleteError.message);
    } else {
        console.log('✅ Orphan deleted from public.users');
    }

    // Step 2: Create new auth user
    console.log('👤 Creating auth user...');
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    });

    if (authError) {
        console.error('❌ Failed to create auth user:', authError.message);
        return;
    }
    console.log('✅ Auth user created:', authUser.user.id);

    // Step 3: Create profile in public.users
    console.log('📝 Creating profile...');
    const { error: profileError } = await supabase
        .from('users')
        .insert({
            id: authUser.user.id,
            email,
            fullname,
            role,
            status: 'active'
        });

    if (profileError) {
        console.error('❌ Failed to create profile:', profileError.message);
        return;
    }
    console.log('✅ Profile created');

    console.log('\n🎉 User ready to login!');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role: ${role}\n`);
}

fixUser().catch(console.error);
