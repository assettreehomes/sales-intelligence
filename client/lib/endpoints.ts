// Where the browser sends API and Supabase traffic.
//
// By default the dashboard talks to both through its own address
// (/proxy/api and /proxy/supabase, rewritten in next.config.ts), so a network
// that blocks supabase.co or the Cloud Run URL can still sign in.
// Set NEXT_PUBLIC_DIRECT_CONNECT=true to go straight to the services instead.

const DIRECT_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const DIRECT_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

const useProxy =
    process.env.NEXT_PUBLIC_DIRECT_CONNECT !== 'true' && Boolean(process.env.NEXT_PUBLIC_API_URL);

export const API_URL = useProxy ? '/proxy/api' : DIRECT_API_URL;

export function supabaseUrl(): string {
    if (useProxy && DIRECT_SUPABASE_URL && typeof window !== 'undefined') {
        return `${window.location.origin}/proxy/supabase`;
    }
    return DIRECT_SUPABASE_URL;
}

// Keep the session key of the direct URL so signed-in users stay signed in.
export const SUPABASE_STORAGE_KEY = DIRECT_SUPABASE_URL
    ? `sb-${new URL(DIRECT_SUPABASE_URL).hostname.split('.')[0]}-auth-token`
    : undefined;
