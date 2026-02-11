// Reset user password and sync profile
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

async function resetUser() {
    const email = 'tijop22175@cimario.com';
    const password = 'TicketIntel2024!';
    const fullname = 'Test Employee';
    const role = 'employee';

    console.log(`\n🔧 Resetting user: ${email}\n`);

    // Find user in auth.users
    const { data: authData } = await supabase.auth.admin.listUsers();
    const authUser = authData.users.find(u => u.email === email);

    if (!authUser) {
        console.log('❌ User not found in auth.users');
        return;
    }

    console.log('✅ Found auth user:', authUser.id);

    // Reset password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
        authUser.id,
        { password }
    );

    if (updateError) {
        console.error('❌ Failed to reset password:', updateError.message);
        return;
    }
    console.log('✅ Password reset!');

    // Check public.users profile
    const { data: profileData } = await supabase
        .from('users')
        .select('id')
        .eq('id', authUser.id)
        .single();

    if (!profileData) {
        console.log('📝 Creating profile in public.users...');
        const { error: insertError } = await supabase
            .from('users')
            .upsert({
                id: authUser.id,
                email,
                fullname,
                role,
                status: 'active'
            });

        if (insertError) {
            console.error('❌ Profile error:', insertError.message);
            return;
        }
        console.log('✅ Profile created');
    } else {
        console.log('✅ Profile exists');
    }

    console.log('\n🎉 User ready to login!');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role: ${role}\n`);
}

resetUser().catch(console.error);
