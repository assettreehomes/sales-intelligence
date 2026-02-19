import { Router } from 'express';
import crypto from 'crypto';
import { supabaseAdmin, supabasePublic } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { logActivity } from '../services/activityLog.js';
import { verifyCaptcha } from '../services/captcha.js';
import {
    generateTOTPSecret,
    verifyTOTPCode,
    getTOTPUri,
    generateQRCodeDataUri,
    encryptSecret,
    decryptSecret
} from '../services/totp.js';

const router = Router();

// In-memory store for temporary tokens (short-lived, 5 min expiry)
// In production, use Redis or a database table
const tempTokenStore = new Map();

/**
 * Create a temporary token for the TOTP verification step.
 * This token is NOT a session token — it's a short-lived proof of password auth.
 */
function createTempToken(userId, sessionData) {
    const token = crypto.randomBytes(32).toString('hex');
    tempTokenStore.set(token, {
        userId,
        sessionData,
        createdAt: Date.now(),
        attempts: 0,
    });

    // Auto-cleanup after 5 minutes
    setTimeout(() => {
        tempTokenStore.delete(token);
    }, 5 * 60 * 1000);

    return token;
}

/**
 * POST /auth/login
 * Password login with CAPTCHA verification.
 * Returns session directly if no TOTP, or tempToken if TOTP is required.
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password, captchaToken } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // 1. CAPTCHA verified later — only required for superadmin

        // 2. Check if user exists and is active
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

        const isSuperadmin = existingUser.role === 'superadmin';

        // 2b. Verify CAPTCHA — required for ALL users
        const captchaValid = await verifyCaptcha(captchaToken);
        if (!captchaValid) {
            return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });
        }

        // 3. Authenticate with Supabase (password)
        const { data: authData, error: authError } = await supabasePublic.auth.signInWithPassword({
            email: email.toLowerCase(),
            password,
        });

        if (authError) {
            console.error('Password auth error:', authError.message);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // 4. Get user profile
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('id, email, fullname, role, status')
            .eq('id', authData.user.id)
            .single();

        if (profileError) {
            return res.status(500).json({ error: 'Failed to fetch user profile' });
        }

        const sessionData = {
            access_token: authData.session.access_token,
            refresh_token: authData.session.refresh_token,
            expires_at: authData.session.expires_at,
        };

        const userInfo = {
            id: authData.user.id,
            email: authData.user.email,
            fullname: profile.fullname,
            role: profile.role,
        };

        // 5. Non-superadmin → skip TOTP, return session directly
        if (!isSuperadmin) {
            await supabaseAdmin
                .from('users')
                .update({ last_login: new Date().toISOString() })
                .eq('id', authData.user.id);

            req.user = { id: profile.id, fullname: profile.fullname, email: profile.email };
            await logActivity(req, 'auth.login', { email: profile.email });

            return res.json({
                success: true,
                user: userInfo,
                session: sessionData,
            });
        }

        // 6. Superadmin — check TOTP status
        const { data: totpRecord } = await supabaseAdmin
            .from('totp_secrets')
            .select('encrypted_secret, enabled')
            .eq('user_id', authData.user.id)
            .single();

        // Case A: TOTP is enabled → require 6-digit code
        if (totpRecord?.enabled) {
            const tempToken = createTempToken(authData.user.id, sessionData);
            return res.json({
                success: true,
                requiresTOTP: true,
                requiresTOTPSetup: false,
                tempToken,
                user: userInfo,
            });
        }

        // Case B: No TOTP set up → require setup (generate QR)
        if (!totpRecord) {
            const { base32Secret } = generateTOTPSecret(email.toLowerCase());
            const otpauthUri = getTOTPUri(email.toLowerCase(), base32Secret);
            const qrCodeDataUri = await generateQRCodeDataUri(otpauthUri);

            // Store the secret encrypted (not yet enabled)
            const encryptedSecret = encryptSecret(base32Secret);
            await supabaseAdmin.from('totp_secrets').upsert({
                user_id: authData.user.id,
                encrypted_secret: encryptedSecret,
                enabled: false,
            });

            const tempToken = createTempToken(authData.user.id, sessionData);
            return res.json({
                success: true,
                requiresTOTP: false,
                requiresTOTPSetup: true,
                tempToken,
                qrCodeDataUri,
                base32Secret,
                user: userInfo,
            });
        }

        // Case C: TOTP record exists but not enabled (re-setup)
        if (totpRecord && !totpRecord.enabled) {
            const base32Secret = decryptSecret(totpRecord.encrypted_secret);
            const otpauthUri = getTOTPUri(email.toLowerCase(), base32Secret);
            const qrCodeDataUri = await generateQRCodeDataUri(otpauthUri);

            const tempToken = createTempToken(authData.user.id, sessionData);
            return res.json({
                success: true,
                requiresTOTP: false,
                requiresTOTPSetup: true,
                tempToken,
                qrCodeDataUri,
                base32Secret,
                user: userInfo,
            });
        }

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /auth/totp/verify
 * Verify TOTP code for users who already have 2FA enabled.
 */
router.post('/totp/verify', async (req, res) => {
    try {
        const { tempToken, totpCode } = req.body;

        if (!tempToken || !totpCode) {
            return res.status(400).json({ error: 'Temporary token and TOTP code are required' });
        }

        const stored = tempTokenStore.get(tempToken);
        if (!stored) {
            return res.status(401).json({ error: 'Session expired. Please login again.' });
        }

        // Rate limit: max 5 attempts
        if (stored.attempts >= 5) {
            tempTokenStore.delete(tempToken);
            return res.status(429).json({ error: 'Too many attempts. Please login again.' });
        }

        stored.attempts++;

        // Get the user's TOTP secret
        const { data: totpRecord } = await supabaseAdmin
            .from('totp_secrets')
            .select('encrypted_secret')
            .eq('user_id', stored.userId)
            .single();

        if (!totpRecord) {
            return res.status(400).json({ error: 'TOTP not configured for this user' });
        }

        const base32Secret = decryptSecret(totpRecord.encrypted_secret);
        const isValid = verifyTOTPCode(base32Secret, totpCode);

        if (!isValid) {
            return res.status(401).json({
                error: 'Invalid authenticator code. Please try again.',
                attemptsRemaining: 5 - stored.attempts,
            });
        }

        // Success — clean up temp token and return session
        tempTokenStore.delete(tempToken);

        // Update last login
        await supabaseAdmin
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', stored.userId);

        // Get fresh profile
        const { data: profile } = await supabaseAdmin
            .from('users')
            .select('id, email, fullname, role, status')
            .eq('id', stored.userId)
            .single();

        // Log successful login
        req.user = { id: profile.id, fullname: profile.fullname, email: profile.email };
        await logActivity(req, 'auth.login', { email: profile.email });

        res.json({
            success: true,
            user: {
                id: profile.id,
                email: profile.email,
                fullname: profile.fullname,
                role: profile.role,
            },
            session: stored.sessionData,
        });

    } catch (error) {
        console.error('TOTP verify error:', error);
        res.status(500).json({ error: 'TOTP verification failed' });
    }
});

/**
 * POST /auth/totp/confirm-setup
 * Verify the first TOTP code during setup to activate 2FA.
 */
router.post('/totp/confirm-setup', async (req, res) => {
    try {
        const { tempToken, totpCode } = req.body;

        if (!tempToken || !totpCode) {
            return res.status(400).json({ error: 'Temporary token and TOTP code are required' });
        }

        const stored = tempTokenStore.get(tempToken);
        if (!stored) {
            return res.status(401).json({ error: 'Session expired. Please login again.' });
        }

        // Get the user's pending TOTP secret
        const { data: totpRecord } = await supabaseAdmin
            .from('totp_secrets')
            .select('encrypted_secret, enabled')
            .eq('user_id', stored.userId)
            .single();

        if (!totpRecord) {
            return res.status(400).json({ error: 'TOTP setup not initiated' });
        }

        const base32Secret = decryptSecret(totpRecord.encrypted_secret);
        const isValid = verifyTOTPCode(base32Secret, totpCode);

        if (!isValid) {
            return res.status(401).json({ error: 'Invalid code. Please scan the QR code and try again.' });
        }

        // Activate TOTP
        await supabaseAdmin
            .from('totp_secrets')
            .update({ enabled: true, updated_at: new Date().toISOString() })
            .eq('user_id', stored.userId);

        // Clean up temp token
        tempTokenStore.delete(tempToken);

        // Update last login
        await supabaseAdmin
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', stored.userId);

        // Get fresh profile
        const { data: profile } = await supabaseAdmin
            .from('users')
            .select('id, email, fullname, role, status')
            .eq('id', stored.userId)
            .single();

        console.log(`✅ TOTP activated for user: ${profile.email}`);

        // Log TOTP setup + login
        req.user = { id: profile.id, fullname: profile.fullname, email: profile.email };
        await logActivity(req, 'auth.totp.setup', { email: profile.email });
        await logActivity(req, 'auth.login', { email: profile.email });

        res.json({
            success: true,
            user: {
                id: profile.id,
                email: profile.email,
                fullname: profile.fullname,
                role: profile.role,
            },
            session: stored.sessionData,
        });

    } catch (error) {
        console.error('TOTP setup confirm error:', error);
        res.status(500).json({ error: 'TOTP setup failed' });
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
        await logActivity(req, 'auth.logout', { email: req.user?.email });
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

export default router;
