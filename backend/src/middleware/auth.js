import { supabaseAdmin } from '../config/supabase.js';

/**
 * Authentication middleware
 * Verifies Supabase JWT and attaches user to request
 */
export async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Missing or invalid authorization header'
            });
        }

        const token = authHeader.split(' ')[1];

        // Verify the token with Supabase
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                error: 'Invalid or expired token'
            });
        }

        // Fetch user profile with role from our users table
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('id, email, fullname, role, status')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return res.status(403).json({
                error: 'User profile not found'
            });
        }

        if (profile.status !== 'active') {
            return res.status(403).json({
                error: 'Account is not active'
            });
        }

        // 24h Session Limit for Superadmin
        if (profile.role === 'superadmin' && profile.lastlogin) {
            const lastLogin = new Date(profile.lastlogin).getTime();
            const now = Date.now();
            const limit = 24 * 60 * 60 * 1000; // 24 hours

            if (now - lastLogin > limit) {
                return res.status(401).json({
                    error: 'Session expired. Please login again.',
                    code: 'SESSION_EXPIRED'
                });
            }
        }

        // Attach user info to request
        req.user = {
            id: user.id,
            email: user.email,
            fullname: profile.fullname,
            role: profile.role,
            status: profile.status
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            error: 'Authentication failed'
        });
    }
}

/**
 * Optional auth middleware - doesn't fail if no token
 * Useful for public endpoints that have different behavior for logged-in users
 */
export async function optionalAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    // If token provided, validate it
    return authMiddleware(req, res, next);
}

export default authMiddleware;
