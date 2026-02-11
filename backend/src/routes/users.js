import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';

const router = Router();

/**
 * GET /users
 * List users with optional role filter
 * Role: admin
 */
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { role } = req.query;

        let query = supabaseAdmin
            .from('users')
            .select('id, email, fullname, role, status')
            .order('fullname', { ascending: true });

        if (role) {
            query = query.eq('role', role);
        }

        const { data: users, error } = await query;

        if (error) {
            console.error('List users error:', error);
            return res.status(500).json({ error: 'Failed to fetch users' });
        }

        res.json({ users });

    } catch (error) {
        console.error('Users error:', error);
        res.status(500).json({ error: 'Failed to list users' });
    }
});

export default router;
