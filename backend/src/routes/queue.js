import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { proQueue, flashQueue } from '../services/queues.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

// All queue routes require admin
router.use(authMiddleware, requireRole('admin', 'superadmin'));

/**
 * GET /admin/queue/status
 * Returns live vertex queue stats + ticket counts by status.
 */
router.get('/status', async (req, res) => {
    try {
        const queue = {
            pro:   proQueue.getQueueStats(),
            flash: flashQueue.getQueueStats(),
        };

        // Ticket counts from DB
        const { data, error } = await supabaseAdmin
            .from('tickets')
            .select('status, analysiserror')
            .eq('source', 'telecmi')
            .in('status', ['pending', 'processing', 'analysis_failed']);

        if (error) throw error;

        let pending = 0, processing = 0, retryable = 0, permanent = 0, stuckProcessing = 0;
        const now = Date.now();

        for (const t of data || []) {
            if (t.status === 'pending') { pending++; continue; }
            if (t.status === 'processing') { processing++; continue; }
            if (t.status === 'analysis_failed') {
                if ((t.analysiserror || '').startsWith('permanent_failed')) permanent++;
                else retryable++;
            }
        }

        // Stuck = processing for more than 10 minutes
        const { data: stuckTickets, error: stuckErr } = await supabaseAdmin
            .from('tickets')
            .select('id, clientname, createdby, analysis_started_at, telecmi_filename')
            .eq('status', 'processing')
            .eq('source', 'telecmi')
            .lt('analysis_started_at', new Date(now - 10 * 60 * 1000).toISOString())
            .order('analysis_started_at', { ascending: true })
            .limit(50);

        res.json({
            queue,
            tickets: {
                pending,
                processing,
                retryable,
                permanent_failed: permanent,
            },
            stuck: stuckErr ? [] : (stuckTickets || []).map(t => ({
                id:         t.id,
                name:       t.clientname || 'Unknown',
                agent:      t.createdby || null,
                stuck_min:  Math.round((now - new Date(t.analysis_started_at).getTime()) / 60000),
            })),
            autoRetry: {
                batchSize:       Number(process.env.RETRY_BATCH_SIZE) || 3,
                intervalMinutes: Math.round((Number(process.env.RETRY_INTERVAL_MS) || 1200000) / 60000),
            },
        });
    } catch (err) {
        console.error('Queue status error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /admin/queue/reset
 * 1. Drains the in-memory vertex waitQueue
 * 2. Resets all stuck processing tickets (> 5 min) → analysis_failed
 * Returns a summary.
 */
router.post('/reset', async (req, res) => {
    try {
        const cleared = proQueue.clearQueue() + flashQueue.clearQueue();

        const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: resetTickets, error } = await supabaseAdmin
            .from('tickets')
            .update({ status: 'analysis_failed', analysiserror: 'Reset: manually cleared via queue reset' })
            .eq('status', 'processing')
            .eq('source', 'telecmi')
            .lt('analysis_started_at', cutoff)
            .select('id');

        if (error) throw error;

        const ticketsReset = resetTickets?.length || 0;
        console.log(`Queue reset: cleared ${cleared} waiting jobs, reset ${ticketsReset} stuck tickets`);

        res.json({
            success:       true,
            queueCleared:  cleared,
            ticketsReset,
        });
    } catch (err) {
        console.error('Queue reset error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PATCH /admin/queue/ticket/:id/reset
 * Resets a single stuck ticket back to analysis_failed so auto-retry picks it up.
 */
router.patch('/ticket/:id/reset', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabaseAdmin
            .from('tickets')
            .update({ status: 'analysis_failed', analysiserror: 'Reset: manually reset via queue monitor' })
            .eq('id', id)
            .eq('source', 'telecmi');

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
