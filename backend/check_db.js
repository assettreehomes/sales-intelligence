import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTickets() {
    const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .limit(5);

    if (error) {
        console.error('Error fetching tickets:', error);
    } else {
        console.log('Tickets found:', data.length);
        console.log(JSON.stringify(data, null, 2));
    }
}

checkTickets();
