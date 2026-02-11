import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { getTrainingAudioUrl, checkAudioExists } from '../config/gcs.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireIntern } from '../middleware/rbac.js';

const router = Router();

// ============================================
// INTERN ROUTES - Training Library (Read Only)
// ============================================

/**
 * GET /training
 * List all training calls (4+ star rated)
 * Role: intern, admin
 */
router.get('/', authMiddleware, requireIntern, async (req, res) => {
    try {
        const { limit = 20, offset = 0, search } = req.query;

        let query = supabaseAdmin
            .from('training_tickets')
            .select(`
                id,
                ticket_id,
                promoted_at,
                tickets!inner(
                    id,
                    client_name,
                    visit_type,
                    visit_number,
                    rating,
                    created_at
                )
            `, { count: 'exact' })
            .order('promoted_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (search) {
            query = query.ilike('tickets.client_name', `%${search}%`);
        }

        const { data: trainingCalls, error, count } = await query;

        if (error) {
            console.error('Fetch training calls error:', error);
            return res.status(500).json({ error: 'Failed to fetch training library' });
        }

        // Transform response
        const calls = trainingCalls.map(tc => ({
            id: tc.ticket_id,
            client_name: tc.tickets.client_name,
            visit_type: tc.tickets.visit_type,
            visit_number: tc.tickets.visit_number,
            rating: tc.tickets.rating,
            call_date: tc.tickets.created_at,
            promoted_at: tc.promoted_at
        }));

        res.json({
            training_calls: calls,
            total: count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Get training error:', error);
        res.status(500).json({ error: 'Failed to get training library' });
    }
});

/**
 * GET /training/:id
 * Get single training call details
 * Role: intern, admin
 */
router.get('/:id', authMiddleware, requireIntern, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify this is a training call
        const { data: trainingTicket, error: ttError } = await supabaseAdmin
            .from('training_tickets')
            .select('ticket_id')
            .eq('ticket_id', id)
            .single();

        if (ttError || !trainingTicket) {
            return res.status(404).json({ error: 'Training call not found' });
        }

        // Get ticket details
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .select('id, client_name, visit_type, visit_number, rating, created_at, notes')
            .eq('id', id)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Get analysis
        const { data: analysis } = await supabaseAdmin
            .from('analysis_results')
            .select('summary, key_moments, improvement_suggestions, objections')
            .eq('ticket_id', id)
            .single();

        res.json({
            ticket,
            analysis: analysis || null
        });

    } catch (error) {
        console.error('Get training detail error:', error);
        res.status(500).json({ error: 'Failed to get training call' });
    }
});

/**
 * GET /training/:id/audio
 * Get audio playback URL for training call
 * Role: intern, admin
 */
router.get('/:id/audio', authMiddleware, requireIntern, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify this is a training call
        const { data: trainingTicket, error: ttError } = await supabaseAdmin
            .from('training_tickets')
            .select('ticket_id')
            .eq('ticket_id', id)
            .single();

        if (ttError || !trainingTicket) {
            return res.status(404).json({ error: 'Training call not found' });
        }

        // Check audio exists and get extension
        const { exists, extension } = await checkAudioExists(id);

        if (!exists) {
            return res.status(404).json({ error: 'Audio file not found' });
        }

        // Generate signed URL for training bucket
        const audioUrl = await getTrainingAudioUrl(id, extension);

        res.json({
            audio_url: audioUrl,
            expires_in: '24 hours'
        });

    } catch (error) {
        console.error('Get training audio error:', error);
        res.status(500).json({ error: 'Failed to get audio URL' });
    }
});

/**
 * GET /training/stats
 * Get training library statistics
 * Role: admin
 */
router.get('/stats', authMiddleware, requireIntern, async (req, res) => {
    try {
        // Get total count
        const { count: totalCount } = await supabaseAdmin
            .from('training_tickets')
            .select('*', { count: 'exact', head: true });

        // Get average rating of training calls
        const { data: avgData } = await supabaseAdmin
            .from('tickets')
            .select('rating')
            .eq('is_training_call', true)
            .not('rating', 'is', null);

        const avgRating = avgData && avgData.length > 0
            ? avgData.reduce((sum, t) => sum + t.rating, 0) / avgData.length
            : 0;

        // Get recent additions (last 7 days)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const { count: recentCount } = await supabaseAdmin
            .from('training_tickets')
            .select('*', { count: 'exact', head: true })
            .gte('promoted_at', weekAgo.toISOString());

        res.json({
            total_calls: totalCount || 0,
            average_rating: Math.round(avgRating * 10) / 10,
            added_this_week: recentCount || 0
        });

    } catch (error) {
        console.error('Get training stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

export default router;
