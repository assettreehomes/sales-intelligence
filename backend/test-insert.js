import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
    console.log('Testing insert with BOTH column styles...');
    const testId = crypto.randomUUID();

    const { data, error: insertErr } = await supabase.from('tickets').insert({
        id: testId,
        clientname: 'TEST_CLIENT',
        client_name: 'TEST_CLIENT',  // Try both
        createdby: 'da651b69-2588-415f-b416-4d72f65a061b',
        created_by: 'da651b69-2588-415f-b416-4d72f65a061b',
        status: 'pending'
    }).select();

    if (insertErr) {
        console.log('Insert error:', insertErr.message);
    } else {
        console.log('✅ Insert successful!', data);
        // Clean up
        await supabase.from('tickets').delete().eq('id', testId);
        console.log('Cleaned up test record');
    }
}
run();
