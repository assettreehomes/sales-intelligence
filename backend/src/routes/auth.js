import { Router } from 'express';
import { supabaseAdmin, supabasePublic } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

/**
 * POST /auth/login
 * Send magic link or OTP to email
 */
router.post('/login', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check if user exists in our users table
        const { data: existingUser, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, email, role, status')
            .eq('email', email.toLowerCase())
            .single();

        if (userError || !existingUser) {
            return res.status(404).json({
                error: 'User not found. Please contact your administrator.'
            });
        }

        if (existingUser.status !== 'active') {
            return res.status(403).json({
                error: 'Account is not active. Please contact your administrator.'
            });
        }

        // Send OTP via Supabase Auth
        const { data, error } = await supabasePublic.auth.signInWithOtp({
            email: email.toLowerCase(),
            options: {
                shouldCreateUser: false // Don't auto-create users
            }
        });

        if (error) {
            console.error('OTP send error:', error);
            return res.status(500).json({ error: 'Failed to send verification code' });
        }

        res.json({
            success: true,
            message: 'Verification code sent to your email',
            email: email.toLowerCase()
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /auth/verify
 * Verify OTP and return session
 */
router.post('/verify', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and OTP are required' });
        }

        // Verify OTP with Supabase
        const { data, error } = await supabasePublic.auth.verifyOtp({
            email: email.toLowerCase(),
            token: otp,
            type: 'email'
        });

        if (error) {
            console.error('OTP verification error:', error);
            return res.status(401).json({ error: 'Invalid or expired verification code' });
        }

        // Get user profile with role
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('id, email, fullname, role, status')
            .eq('id', data.user.id)
            .single();

        if (profileError) {
            console.error('Profile fetch error:', profileError);
            return res.status(500).json({ error: 'Failed to fetch user profile' });
        }

        // Update last login
        await supabaseAdmin
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', data.user.id);

        res.json({
            success: true,
            user: {
                id: data.user.id,
                email: data.user.email,
                fullname: profile.fullname,
                role: profile.role
            },
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at
            }
        });

    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

/**
 * GET /auth/me
 * Get current user profile
 */
router.get('/me', authMiddleware, async (req, res) => {
    res.json({
        user: req.user
    });
});

/**
 * POST /auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        const { data, error } = await supabasePublic.auth.refreshSession({
            refresh_token
        });

        if (error) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        res.json({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at
        });

    } catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

/**
 * POST /auth/logout
 * Sign out user
 */
router.post('/logout', authMiddleware, async (req, res) => {
    try {
        // Note: With JWT-based auth, logout is primarily client-side
        // The token will remain valid until expiry
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

export default router;
