'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase';
import { User, Session } from '@supabase/supabase-js';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface UserProfile {
    id: string;
    email: string;
    fullname: string;
    role: 'superadmin' | 'admin' | 'employee' | 'intern';
    status: 'active' | 'inactive';
    lastlogin?: string;
}

/**
 * Login result types for the multi-step auth flow
 */
export interface LoginResult {
    error?: string;
    /** If true, user must enter a 6-digit TOTP code */
    requiresTOTP?: boolean;
    /** If true, user must set up TOTP (scan QR code first) */
    requiresTOTPSetup?: boolean;
    /** Temporary token for TOTP verification step */
    tempToken?: string;
    /** QR code data URI for TOTP setup */
    qrCodeDataUri?: string;
    /** Base32 secret for manual entry */
    base32Secret?: string;
    /** User info (available before TOTP step) */
    user?: { id: string; email: string; fullname: string; role: string };
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    profile: UserProfile | null;
    loading: boolean;
    profileLoading: boolean;
    signIn: (email: string, password: string) => Promise<LoginResult>;
    completeTOTP: (tempToken: string, totpCode: string) => Promise<LoginResult>;
    confirmTOTPSetup: (tempToken: string, totpCode: string) => Promise<LoginResult>;
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
                .select('id, email, fullname, role, status, lastlogin')
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

    /**
     * Set the Supabase session from server-provided tokens and hydrate user/profile state.
     */
    const hydrateSession = useCallback(async (sessionData: { access_token: string; refresh_token: string }) => {
        const { data, error } = await supabase.auth.setSession({
            access_token: sessionData.access_token,
            refresh_token: sessionData.refresh_token,
        });

        if (error) {
            console.error('setSession error:', error);
            return;
        }

        if (data.session && data.user) {
            setSession(data.session);
            setUser(data.user);
            setProfileLoading(true);
            const userProfile = await fetchProfile(data.user.id);
            setProfile(userProfile);
            setProfileLoading(false);
        }
    }, [supabase, fetchProfile]);

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

    /**
     * Sign in with email, password, and CAPTCHA token.
     * Goes through the backend which validates CAPTCHA + checks TOTP.
     */
    const signIn = useCallback(async (email: string, password: string): Promise<LoginResult> => {
        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                return { error: data.error || 'Login failed' };
            }

            // If TOTP is required, return the temp token for next step
            if (data.requiresTOTP || data.requiresTOTPSetup) {
                return {
                    requiresTOTP: data.requiresTOTP,
                    requiresTOTPSetup: data.requiresTOTPSetup,
                    tempToken: data.tempToken,
                    qrCodeDataUri: data.qrCodeDataUri,
                    base32Secret: data.base32Secret,
                    user: data.user,
                };
            }

            // No TOTP required — set session directly (shouldn't normally happen since all users need TOTP)
            if (data.session) {
                await hydrateSession(data.session);
            }

            return {};
        } catch (err) {
            console.error('SignIn error:', err);
            return { error: 'An unexpected error occurred' };
        }
    }, [hydrateSession]);

    /**
     * Complete TOTP verification for users who already have 2FA enabled.
     */
    const completeTOTP = useCallback(async (tempToken: string, totpCode: string): Promise<LoginResult> => {
        try {
            const response = await fetch(`${API_URL}/auth/totp/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempToken, totpCode }),
            });

            const data = await response.json();

            if (!response.ok) {
                return { error: data.error || 'Verification failed' };
            }

            // Success — set the session
            if (data.session) {
                await hydrateSession(data.session);
            }

            return {};
        } catch (err) {
            console.error('TOTP verify error:', err);
            return { error: 'An unexpected error occurred' };
        }
    }, [hydrateSession]);

    /**
     * Confirm TOTP setup (first-time activation).
     */
    const confirmTOTPSetup = useCallback(async (tempToken: string, totpCode: string): Promise<LoginResult> => {
        try {
            const response = await fetch(`${API_URL}/auth/totp/confirm-setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempToken, totpCode }),
            });

            const data = await response.json();

            if (!response.ok) {
                return { error: data.error || 'Setup failed' };
            }

            // Success — set the session
            if (data.session) {
                await hydrateSession(data.session);
            }

            return {};
        } catch (err) {
            console.error('TOTP setup error:', err);
            return { error: 'An unexpected error occurred' };
        }
    }, [hydrateSession]);

    // Sign out
    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setProfile(null);
        setProfileLoading(false);
    }, [supabase]);

    // Superadmin Auto-Logout Check
    useEffect(() => {
        if (!profile || profile.role !== 'superadmin' || !profile.lastlogin) return;

        const checkSession = () => {
            if (!profile.lastlogin) return;

            const loginTime = new Date(profile.lastlogin).getTime();
            if (isNaN(loginTime)) {
                console.warn('Invalid lastlogin date', profile.lastlogin);
                return;
            }

            const now = Date.now();
            const limit = 24 * 60 * 60 * 1000; // 24 hours
            const elapsed = now - loginTime;
            const remaining = limit - elapsed;

            // Force logout if expired
            if (remaining <= 0) {
                console.log('Session expired for superadmin. Auto-logging out.');
                void signOut();
                return;
            }
        };

        const interval = setInterval(checkSession, 60 * 1000); // Check every minute
        checkSession(); // Check immediately on mount/profile load

        return () => clearInterval(interval);
    }, [profile, signOut]);

    const value = useMemo(() => ({
        user,
        session,
        profile,
        loading,
        profileLoading,
        signIn,
        completeTOTP,
        confirmTOTPSetup,
        signOut,
    }), [user, session, profile, loading, profileLoading, signIn, completeTOTP, confirmTOTPSetup, signOut]);

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
