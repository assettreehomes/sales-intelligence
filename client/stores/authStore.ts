import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createClient } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

/**
 * Shared helper to get the current Supabase access token.
 * Used by all Zustand stores for authenticated API calls.
 */
export async function getToken(): Promise<string | null> {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}

/**
 * Base URL for the backend API.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface UserProfile {
    id: string;
    email: string;
    fullname: string;
    role: string;
    avatar_url?: string;
}

interface AuthState {
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    initialized: boolean;
    setUser: (user: User | null) => void;
    setProfile: (profile: UserProfile | null) => void;
    setLoading: (loading: boolean) => void;
    checkSession: () => Promise<void>;
    signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            profile: null,
            loading: true,
            initialized: false,
            setUser: (user) => set({ user }),
            setProfile: (profile) => set({ profile }),
            setLoading: (loading) => set({ loading }),
            checkSession: async () => {
                try {
                    set({ loading: true });
                    const supabase = createClient();
                    const { data: { session } } = await supabase.auth.getSession();

                    if (session?.user) {
                        set({ user: session.user });

                        // Fetch profile
                        const { data: profile } = await supabase
                            .from('users')
                            .select('*')
                            .eq('id', session.user.id)
                            .single();

                        if (profile) {
                            set({ profile });
                        }
                    } else {
                        set({ user: null, profile: null });
                    }
                } catch (error) {
                    console.error('Session check failed:', error);
                    set({ user: null, profile: null });
                } finally {
                    set({ loading: false, initialized: true });
                }
            },
            signOut: async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                set({ user: null, profile: null });
            }
        }),
        {
            name: 'auth-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                user: state.user,
                profile: state.profile
            }), // Only persist user and profile
        }
    )
);
