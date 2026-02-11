import { supabaseAdmin } from './src/config/supabase.js';

async function checkSchema() {
    const { data, error } = await supabaseAdmin
        .from('analysisresults')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Columns:', data && data.length > 0 ? Object.keys(data[0]) : 'Table empty or no access');
        if (data && data.length > 0) {
            console.log('Sample row:', data[0]);
        }
    }
}

checkSchema();
