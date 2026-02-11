import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

console.log('\n🔍 ========== SUPABASE CONNECTION TEST ==========\n');
console.log('📌 SUPABASE_URL:', supabaseUrl);
console.log('📌 Service Key (first 20 chars):', supabaseServiceKey?.substring(0, 20) + '...');

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function testConnection() {
    try {
        // Test 1: Check if we can query the tickets table
        console.log('\n📊 Test 1: Querying tickets table...');
        const { data: tickets, error: ticketError } = await supabase
            .from('tickets')
            .select('id, status, clientname')
            .limit(5);

        if (ticketError) {
            console.error('❌ Tickets query failed:', ticketError.message);
        } else {
            console.log('✅ Tickets query successful!');
            console.log('   Found', tickets.length, 'tickets');
            if (tickets.length > 0) {
                console.log('   Sample:', tickets[0]);
            }
        }

        // Test 2: Check if we can query the users table
        console.log('\n📊 Test 2: Querying users table...');
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('id, email, fullname, role')
            .limit(5);

        if (userError) {
            console.error('❌ Users query failed:', userError.message);
        } else {
            console.log('✅ Users query successful!');
            console.log('   Found', users.length, 'users');
            users.forEach(u => {
                console.log(`   - ${u.fullname} (${u.email}) - ${u.role}`);
            });
        }

        // Test 3: Check enum types
        console.log('\n📊 Test 3: Checking enum types...');
        const { data: enums, error: enumError } = await supabase
            .rpc('get_enum_types');

        if (enumError) {
            // Fallback: query pg_type directly
            const { data: enumsDirect, error: enumDirectError } = await supabase
                .from('pg_type')
                .select('typname')
                .eq('typtype', 'e');

            if (enumDirectError) {
                console.log('⚠️  Could not query enums (normal if no RPC defined)');
            }
        } else {
            console.log('✅ Enum types:', enums);
        }

        // Test 4: Try to insert and rollback a test ticket
        console.log('\n📊 Test 4: Testing insert capability...');
        const testId = crypto.randomUUID();
        const { error: insertError } = await supabase
            .from('tickets')
            .insert({
                id: testId,
                clientname: 'TEST_DELETE_ME',
                status: 'pending',
                storage_class: 'standard'
            });

        if (insertError) {
            console.error('❌ Insert test failed:', insertError.message);
            console.error('   Code:', insertError.code);
            console.error('   Details:', insertError.details);
        } else {
            console.log('✅ Insert successful!');
            // Clean up
            await supabase.from('tickets').delete().eq('id', testId);
            console.log('   (Test record deleted)');
        }

        console.log('\n========== TEST COMPLETE ==========\n');

    } catch (error) {
        console.error('❌ Unexpected error:', error);
    }
}

testConnection();
