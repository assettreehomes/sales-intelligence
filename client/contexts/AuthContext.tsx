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
    signIn: (email: string, password: string) => Promise<{ error?: string }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Timeout helper
const timeoutPromise = (ms: number) => new Promise<null>((r) => setTimeout(() => r(null), ms));

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const supabase = useMemo(() => createClient(), []);

    // Fetch user profile from users table - with timeout
    const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
        try {
            const query = supabase
                .from('users')
                .select('id, email, fullname, role, status')
                .eq('id', userId)
                .single();

            const result = await Promise.race([query, timeoutPromise(5000)]);

            if (!result || 'error' in result && result.error) {
                console.error('Profile fetch error:', result && 'error' in result ? result.error : 'timeout');
                return null;
            }
            return 'data' in result ? result.data as UserProfile : null;
        } catch (err) {
            console.error('Profile fetch exception:', err);
            return null;
        }
    }, [supabase]);

    // Initialize auth state on mount
    useEffect(() => {
        let mounted = true;

        const initAuth = async () => {
            try {
                // Get session with timeout
                const sessionQuery = supabase.auth.getSession();
                const sessionResult = await Promise.race([sessionQuery, timeoutPromise(5000)]);

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

                    // Fetch profile asynchronously - don't block loading
                    fetchProfile(currentSession.user.id).then((userProfile) => {
                        if (mounted) setProfile(userProfile);
                    });
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
                    // Fetch profile in background
                    fetchProfile(newSession.user.id).then((userProfile) => {
                        if (mounted) setProfile(userProfile);
                    });
                } else {
                    setProfile(null);
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

                // Fetch profile
                const userProfile = await fetchProfile(data.user.id);
                setProfile(userProfile);

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
    }, [supabase]);

    const value = useMemo(() => ({
        user,
        session,
        profile,
        loading,
        signIn,
        signOut,
    }), [user, session, profile, loading, signIn, signOut]);

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
