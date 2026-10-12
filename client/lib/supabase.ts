import { createBrowserClient } from '@supabase/ssr';
import { supabaseUrl, SUPABASE_STORAGE_KEY } from '@/lib/endpoints';

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
    if (!supabaseClient) {
        supabaseClient = createBrowserClient(
            supabaseUrl(),
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            SUPABASE_STORAGE_KEY ? { cookieOptions: { name: SUPABASE_STORAGE_KEY } } : undefined
        );
    }
    return supabaseClient;
}
