import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { logActivity } from '../services/activityLog.js';
import multer from 'multer';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

const router = Router();

/**
 * GET /users
 * List users with optional role filter — admin only
 */
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { role } = req.query;
        let query = supabaseAdmin
            .from('users')
            .select('id, email, fullname, role, status, avatar_url, sales_email, last_login')
            .order('fullname', { ascending: true });
        if (role) query = query.eq('role', role);
        const { data: users, error } = await query;
        if (error) return res.status(500).json({ error: 'Failed to fetch users' });
        res.json({ users });
    } catch (error) {
        res.status(500).json({ error: 'Failed to list users' });
    }
});

/**
 * POST /users
 * Create a new employee account — admin only
 * Body: { fullname, email, password, sales_email? }
 */
router.post('/', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { fullname, email, password, sales_email } = req.body;

        if (!fullname?.trim() || !email?.trim() || !password?.trim()) {
            return res.status(400).json({ error: 'fullname, email and password are required' });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // 1. Check if user already exists in our users table
        const { data: existing } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists' });
        }

        // 2. Create Supabase Auth user (email is auto-confirmed — no verification email)
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password: password.trim(),
            email_confirm: true
        });

        if (authError) {
            console.error('Auth create error:', authError);
            return res.status(500).json({ error: authError.message || 'Failed to create auth account' });
        }

        // 3. Insert into users table
        const newUser = {
            id: authData.user.id,
            email: normalizedEmail,
            fullname: fullname.trim(),
            role: 'employee',
            status: 'active',
            ...(sales_email?.trim() ? { sales_email: sales_email.trim().toLowerCase() } : {})
        };

        const { data: user, error: insertError } = await supabaseAdmin
            .from('users')
            .insert(newUser)
            .select('id, email, fullname, role, status, sales_email')
            .single();

        if (insertError) {
            // Rollback: delete auth user if profile insert fails
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
            console.error('User insert error:', insertError);
            return res.status(500).json({ error: 'Failed to create user profile' });
        }

        await logActivity(req, 'user.created', { email: normalizedEmail, fullname: fullname.trim() });

        return res.status(201).json({ success: true, user });

    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create employee' });
    }
});

/**
 * PATCH /users/:id/status
 * Toggle employee active/inactive — admin only
 * Body: { status: 'active' | 'inactive' }
 */
router.patch('/:id/status', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ error: "status must be 'active' or 'inactive'" });
        }

        // Update users table
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({ status })
            .eq('id', id);

        if (updateError) {
            return res.status(500).json({ error: 'Failed to update status' });
        }

        // Sync with Supabase Auth: ban or unban
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
            ban_duration: status === 'inactive' ? '87600h' : 'none'
        });

        if (authError) {
            console.error('Auth ban error (non-fatal):', authError.message);
            // Non-fatal — profile is already updated
        }

        await logActivity(req, `user.status.${status}`, { userId: id });

        return res.json({ success: true, status });

    } catch (error) {
        console.error('Status update error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

/**
 * DELETE /users/:id
 * Remove employee — admin only
 * Blocks deletion if employee has active tickets (deactivate instead)
 */
router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Check for existing tickets
        const { count, error: ticketErr } = await supabaseAdmin
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('createdby', id)
            .is('deletedat', null);

        if (ticketErr) {
            return res.status(500).json({ error: 'Failed to check tickets' });
        }

        if (count > 0) {
            return res.status(409).json({
                error: `This employee has ${count} ticket${count !== 1 ? 's' : ''} — deactivate their account instead of deleting.`
            });
        }

        // 2. Get email for logging
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('email, fullname')
            .eq('id', id)
            .maybeSingle();

        // 3. Delete Supabase Auth record
        const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
        if (authDeleteError) {
            console.error('Auth delete error:', authDeleteError.message);
            return res.status(500).json({ error: 'Failed to delete auth account' });
        }

        // 4. Delete from users table
        const { error: dbDeleteError } = await supabaseAdmin
            .from('users')
            .delete()
            .eq('id', id);

        if (dbDeleteError) {
            console.error('DB delete error:', dbDeleteError.message);
            return res.status(500).json({ error: 'Failed to delete user profile' });
        }

        await logActivity(req, 'user.deleted', { email: user?.email, fullname: user?.fullname });

        return res.json({ success: true });

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete employee' });
    }
});

/**
 * POST /users/:id/avatar
 * Upload user avatar — admin only
 */
router.post('/:id/avatar', authMiddleware, requireAdmin, upload.single('avatar'), async (req, res) => {
    try {
        const { id } = req.params;
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'No image file provided' });

        const fileExt = file.originalname.split('.').pop();
        const fileName = `avatar_${id}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabaseAdmin
            .storage.from('profile')
            .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });

        if (uploadError) return res.status(500).json({ error: 'Failed to upload avatar' });

        const { data: { publicUrl } } = supabaseAdmin.storage.from('profile').getPublicUrl(fileName);

        const { error: updateError } = await supabaseAdmin
            .from('users').update({ avatar_url: publicUrl }).eq('id', id);

        if (updateError) return res.status(500).json({ error: 'Failed to update user profile' });

        res.json({ success: true, avatar_url: publicUrl });

    } catch (error) {
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
});

export default router;
