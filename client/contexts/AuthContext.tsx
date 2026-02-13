'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase';
import { User, Session } from '@supabase/supabase-js';

export interface UserProfile {
    id: string;
    email: string;
    fullname: string;
    role: 'superadmin' | 'admin' | 'employee' | 'intern';
    status: 'active' | 'inactive';
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    profile: UserProfile | null;
    loading: boolean;
    profileLoading: boolean;
    signIn: (email: string, password: string) => Promise<{ error?: string }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROFILE_TIMEOUT_MS = 15000;

function isAbortError(err: unknown): boolean {
    return err instanceof Error && err.name === 'AbortError';
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [profileLoading, setProfileLoading] = useState(false);

    const supabase = useMemo(() => createClient(), []);

    // Fetch user profile from users table with explicit request timeout.
    const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);

        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, email, fullname, role, status')
                .eq('id', userId)
                .abortSignal(controller.signal)
                .single();

            if (error) {
                console.error('Profile fetch error:', error.message || error);
                return null;
            }

            return data as UserProfile;
        } catch (err) {
            if (isAbortError(err)) {
                console.error(`Profile fetch error: timeout after ${PROFILE_TIMEOUT_MS}ms`);
                return null;
            }

            console.error('Profile fetch exception:', err);
            return null;
        } finally {
            clearTimeout(timeoutId);
        }
    }, [supabase]);

    // Initialize auth state on mount
    useEffect(() => {
        let mounted = true;

        const initAuth = async () => {
            try {
                const sessionResult = await supabase.auth.getSession();

                if (!mounted) return;

                if (!sessionResult || ('error' in sessionResult && sessionResult.error)) {
                    console.log('No session or error');
                    setLoading(false);
                    return;
                }

                const currentSession = 'data' in sessionResult ? sessionResult.data.session : null;

                if (currentSession?.user) {
                    setSession(currentSession);
                    setUser(currentSession.user);
                    setProfileLoading(true);

                    // Fetch profile asynchronously - don't block app initialization.
                    fetchProfile(currentSession.user.id)
                        .then((userProfile) => {
                            if (mounted) setProfile(userProfile);
                        })
                        .finally(() => {
                            if (mounted) setProfileLoading(false);
                        });
                } else {
                    setProfileLoading(false);
                }

                // Always set loading to false after checking session
                setLoading(false);
            } catch (err) {
                console.error('Auth init error:', err);
                if (mounted) setLoading(false);
            }
        };

        initAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event: string, newSession: Session | null) => {
                if (!mounted) return;

                console.log('Auth state change:', event);
                setSession(newSession);
                setUser(newSession?.user ?? null);

                if (newSession?.user) {
                    setProfileLoading(true);

                    // Fetch profile in background
                    fetchProfile(newSession.user.id)
                        .then((userProfile) => {
                            if (mounted) setProfile(userProfile);
                        })
                        .finally(() => {
                            if (mounted) setProfileLoading(false);
                        });
                } else {
                    setProfile(null);
                    setProfileLoading(false);
                }

                setLoading(false);
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [supabase, fetchProfile]);

    // Sign in with email and password
    const signIn = useCallback(async (email: string, password: string) => {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                return { error: error.message };
            }

            if (data.session) {
                setSession(data.session);
                setUser(data.user);
                setProfileLoading(true);

                // Fetch profile
                const userProfile = await fetchProfile(data.user.id);
                setProfile(userProfile);
                setProfileLoading(false);

                if (userProfile?.status !== 'active') {
                    await supabase.auth.signOut();
                    return { error: 'Account is not active. Contact administrator.' };
                }
            }

            return {};
        } catch (err) {
            console.error('SignIn error:', err);
            return { error: 'An unexpected error occurred' };
        }
    }, [supabase, fetchProfile]);

    // Sign out
    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setProfile(null);
        setProfileLoading(false);
    }, [supabase]);

    const value = useMemo(() => ({
        user,
        session,
        profile,
        loading,
        profileLoading,
        signIn,
        signOut,
    }), [user, session, profile, loading, profileLoading, signIn, signOut]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
