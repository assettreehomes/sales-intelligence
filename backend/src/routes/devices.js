import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireEmployee } from '../middleware/rbac.js';

const router = Router();

function validText(value, maxLength) {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

/**
 * PUT /devices/fcm-token
 * Register or refresh the calling employee's Android FCM token.
 */
router.put('/fcm-token', authMiddleware, requireEmployee, async (req, res) => {
    try {
        const { installation_id, token, app_version } = req.body || {};

        if (!validText(installation_id, 255) || !validText(token, 4096)) {
            return res.status(400).json({ error: 'installation_id and token are required' });
        }

        if (app_version !== undefined && !validText(app_version, 100)) {
            return res.status(400).json({ error: 'app_version must be a non-empty string of at most 100 characters' });
        }

        const installationId = installation_id.trim();
        const fcmToken = token.trim();
        const now = new Date().toISOString();

        // An FCM token represents one installation. If Android restores a token
        // under a new installation ID, remove the stale owner before upserting.
        const { error: staleTokenError } = await supabaseAdmin
            .from('push_devices')
            .delete()
            .eq('fcm_token', fcmToken)
            .neq('installation_id', installationId);

        if (staleTokenError) {
            console.error('FCM device cleanup error:', staleTokenError.message);
            return res.status(500).json({ error: 'Failed to register device' });
        }

        const { data: device, error } = await supabaseAdmin
            .from('push_devices')
            .upsert({
                user_id: req.user.id,
                installation_id: installationId,
                fcm_token: fcmToken,
                platform: 'android',
                app_version: app_version?.trim() || null,
                is_active: true,
                last_seen_at: now,
                updated_at: now
            }, { onConflict: 'installation_id' })
            .select('id, installation_id, platform, is_active, last_seen_at')
            .single();

        if (error) {
            console.error('FCM device registration error:', error.message);
            return res.status(500).json({ error: 'Failed to register device' });
        }

        return res.json({ success: true, device });
    } catch (error) {
        console.error('FCM device registration error:', error);
        return res.status(500).json({ error: 'Failed to register device' });
    }
});

/**
 * DELETE /devices/fcm-token/:installationId
 * Deactivate only a device owned by the authenticated user.
 */
router.delete('/fcm-token/:installationId', authMiddleware, requireEmployee, async (req, res) => {
    try {
        const { installationId } = req.params;
        if (!validText(installationId, 255)) {
            return res.status(400).json({ error: 'Invalid installation ID' });
        }

        const { data, error } = await supabaseAdmin
            .from('push_devices')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('user_id', req.user.id)
            .eq('installation_id', installationId.trim())
            .select('id');

        if (error) {
            console.error('FCM device deactivation error:', error.message);
            return res.status(500).json({ error: 'Failed to deactivate device' });
        }

        return res.json({ success: true, deactivated: data?.length || 0 });
    } catch (error) {
        console.error('FCM device deactivation error:', error);
        return res.status(500).json({ error: 'Failed to deactivate device' });
    }
});

export default router;
