import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';

import multer from 'multer';

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
    }
});

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
            .select('id, email, fullname, role, status, avatar_url')
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

/**
 * POST /users/:id/avatar
 * Upload user avatar to Supabase Storage
 * Role: admin
 */
router.post('/:id/avatar', authMiddleware, requireAdmin, upload.single('avatar'), async (req, res) => {
    try {
        const { id } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        // 1. Upload to Supabase Storage 'profile' bucket
        const fileExt = file.originalname.split('.').pop();
        const fileName = `avatar_${id}_${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabaseAdmin
            .storage
            .from('profile')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: true
            });

        if (uploadError) {
            console.error('Avatar upload error:', uploadError);
            return res.status(500).json({ error: 'Failed to upload avatar' });
        }

        // 2. Get Public URL
        const { data: { publicUrl } } = supabaseAdmin
            .storage
            .from('profile')
            .getPublicUrl(fileName);

        // 3. Update User Profile
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({ avatar_url: publicUrl })
            .eq('id', id);

        if (updateError) {
            console.error('User update error:', updateError);
            return res.status(500).json({ error: 'Failed to update user profile' });
        }

        res.json({
            success: true,
            avatar_url: publicUrl
        });

    } catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
});

export default router;
