import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { checkAudioExists, generatePlaybackUrl } from '../config/gcs.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireIntern } from '../middleware/rbac.js';

const router = Router();
const MIN_TRAINING_SCORE = 8; // rating is out of 10; 8+ equals 4+ stars

function sanitizeSearchTerm(value) {
    return String(value || '')
        .replace(/[,%*()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function mapTrainingTicket(row) {
    const scoreOutOf10 = typeof row.rating === 'number' ? row.rating : null;
    const starRating = scoreOutOf10 !== null ? Number((scoreOutOf10 / 2).toFixed(2)) : null;

    return {
        id: row.id,
        client_id: row.client_id || null,
        client_name: row.clientname || row.client_name || 'Unknown',
        visit_type: row.visittype || row.visit_type || 'site_visit',
        visit_number: row.visitnumber || row.visit_number || 1,
        status: row.status || 'unknown',
        rating_10: scoreOutOf10,
        rating_5: starRating,
        is_training_call: Boolean(row.istrainingcall),
        created_at: row.createdat || row.created_at || null
    };
}

/**
 * GET /training/high-rated
 * List high-rated calls (4+ stars)
 * Role: intern, admin
 */
router.get('/high-rated', authMiddleware, requireIntern, async (req, res) => {
    try {
        const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
        const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || '20'), 10) || 20));
        const offset = (page - 1) * limit;
        const search = sanitizeSearchTerm(req.query.search);

        let query = supabaseAdmin
            .from('tickets')
            .select('id, client_id, clientname, visittype, visitnumber, status, rating, istrainingcall, createdat', { count: 'exact' })
            .is('deletedat', null)
            .gte('rating', MIN_TRAINING_SCORE)
            .order('rating', { ascending: false })
            .order('createdat', { ascending: false })
            .range(offset, offset + limit - 1);

        if (search) {
            const hashless = search.replaceAll('#', '').trim();
            const clauses = [
                `clientname.ilike.%${search}%`,
                `client_id.ilike.%${search}%`,
                `id.ilike.%${hashless}%`,
                `visittype.ilike.%${hashless}%`
            ];
            query = query.or(clauses.join(','));
        }

        const { data: rows, error, count } = await query;

        if (error) {
            console.error('Fetch high-rated training tickets error:', error);
            return res.status(500).json({ error: 'Failed to fetch training tickets' });
        }

        const tickets = (rows || []).map(mapTrainingTicket);
        res.json({
            tickets,
            total: count || 0,
            page,
            limit,
            total_pages: Math.ceil((count || 0) / limit)
        });
    } catch (error) {
        console.error('Get high-rated training tickets error:', error);
        res.status(500).json({ error: 'Failed to get training tickets' });
    }
});

/**
 * GET /training/high-rated/:id
 * Get one high-rated ticket with analysis and audio URL
 * Role: intern, admin
 */
router.get('/high-rated/:id', authMiddleware, requireIntern, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .select('*')
            .eq('id', id)
            .is('deletedat', null)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const numericRating = typeof ticket.rating === 'number' ? ticket.rating : 0;
        if (numericRating < MIN_TRAINING_SCORE) {
            return res.status(403).json({ error: 'Only 4+ star tickets are available in intern training' });
        }

        const { data: analysis } = await supabaseAdmin
            .from('analysisresults')
            .select('*')
            .eq('ticketid', id)
            .maybeSingle();

        let audioUrl = null;
        const { exists, extension } = await checkAudioExists(id);
        if (exists && extension) {
            audioUrl = await generatePlaybackUrl('uploads', `${id}.${extension}`);
        }

        res.json({
            ticket: mapTrainingTicket(ticket),
            analysis: analysis || null,
            audio_url: audioUrl
        });
    } catch (error) {
        console.error('Get high-rated training ticket detail error:', error);
        res.status(500).json({ error: 'Failed to get training ticket detail' });
    }
});

export default router;
