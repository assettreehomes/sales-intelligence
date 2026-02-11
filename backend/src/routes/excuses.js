import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin, requireEmployee } from '../middleware/rbac.js';

const router = Router();

// Predefined excuse reasons
const EXCUSE_REASONS = [
    'client_unavailable',
    'technical_issues',
    'travel_delay',
    'meeting_rescheduled',
    'emergency',
    'other'
];

const RESOLVED_STATUSES = ['accepted', 'rejected'];

function normalizeExcuse(row) {
    const ticket = row.tickets ? {
        id: row.tickets.id,
        client_name: row.tickets.client_name || row.tickets.clientname || 'Unknown Client',
        client_id: row.tickets.client_id || null,
        visit_type: row.tickets.visit_type || row.tickets.visittype || 'site_visit',
        visit_number: row.tickets.visit_number || row.tickets.visitnumber || 1,
        status: row.tickets.status || null,
        created_at: row.tickets.created_at || row.tickets.createdat || null
    } : null;

    const employee = row.users ? {
        fullname: row.users.fullname || 'Unknown',
        email: row.users.email || ''
    } : null;

    return {
        id: row.id,
        ticket_id: row.ticketid,
        employee_id: row.employeeid,
        reason: row.reason,
        reason_details: row.reasondetails || null,
        estimated_time_minutes: row.estimatedtimeminutes,
        estimated_start_time: row.estimatedstarttime,
        status: row.status,
        submitted_at: row.submittedat,
        reviewed_by: row.reviewedby,
        reviewed_at: row.reviewedat,
        admin_notes: row.adminnotes,
        next_reminder_at: row.nextreminderat,
        ticket,
        employee
    };
}

// ============================================
// EMPLOYEE ROUTES - Submit Excuses
// ============================================

/**
 * POST /excuses
 * Submit an excuse for a pending draft
 * Role: employee
 */
router.post('/', authMiddleware, requireEmployee, async (req, res) => {
    try {
        const {
            ticket_id,
            reason,
            reason_details,
            estimated_time_minutes,
            estimated_start_time
        } = req.body;

        if (!ticket_id || !reason) {
            return res.status(400).json({
                error: 'ticket_id and reason are required'
            });
        }

        if (!EXCUSE_REASONS.includes(reason)) {
            return res.status(400).json({
                error: 'Invalid reason',
                valid_reasons: EXCUSE_REASONS
            });
        }

        // Verify ticket exists and belongs to employee
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .select('id, createdby, created_by, status, clientname, client_id')
            .eq('id', ticket_id)
            .single();

        if (ticketError) {
            console.error('Ticket lookup error:', ticketError);
            return res.status(500).json({ error: 'Failed to verify ticket' });
        }

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const ticketOwnerId = ticket.created_by || ticket.createdby;
        if (req.user.role === 'employee' && ticketOwnerId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized for this ticket' });
        }

        if (!['draft', 'pending', 'uploading'].includes(ticket.status)) {
            return res.status(400).json({
                error: `Excuse can only be submitted before recording starts. Current status: ${ticket.status}`
            });
        }

        // Prevent duplicate pending excuses for same ticket + employee
        const { data: existingPending, error: pendingCheckError } = await supabaseAdmin
            .from('employeeexcuses')
            .select('id')
            .eq('ticketid', ticket_id)
            .eq('employeeid', req.user.id)
            .eq('status', 'pending')
            .limit(1);

        if (pendingCheckError) {
            console.error('Pending excuse check error:', pendingCheckError);
            return res.status(500).json({ error: 'Failed to validate existing excuses' });
        }

        if (existingPending && existingPending.length > 0) {
            return res.status(400).json({
                error: 'A pending excuse already exists for this ticket'
            });
        }

        // Create excuse record
        const excuseId = uuidv4();
        const { data: excuse, error: excuseError } = await supabaseAdmin
            .from('employeeexcuses')
            .insert({
                id: excuseId,
                ticketid: ticket_id,
                employeeid: req.user.id,
                reason,
                reasondetails: reason_details || null,
                estimatedtimeminutes: estimated_time_minutes || null,
                estimatedstarttime: estimated_start_time || null,
                status: 'pending',
                submittedat: new Date().toISOString()
            })
            .select()
            .single();

        if (excuseError) {
            console.error('Create excuse error:', excuseError);
            return res.status(500).json({ error: 'Failed to submit excuse' });
        }

        console.log(`📋 Excuse submitted for ticket ${ticket_id} by ${req.user.fullname}`);

        res.json({
            success: true,
            excuse_id: excuseId,
            excuse: normalizeExcuse(excuse),
            message: 'Excuse submitted. Awaiting admin review.'
        });

    } catch (error) {
        console.error('Submit excuse error:', error);
        res.status(500).json({ error: 'Failed to submit excuse' });
    }
});

/**
 * GET /excuses
 * Get excuses (employees see own, admin sees all)
 */
router.get('/', authMiddleware, requireEmployee, async (req, res) => {
    try {
        const { status = 'all', search = '' } = req.query;

        let query = supabaseAdmin
            .from('employeeexcuses')
            .select('*, tickets!ticketid(id, clientname, client_id, visittype, visitnumber, status, createdat), users!employeeid(fullname, email)')
            .order('submittedat', { ascending: false });

        if (req.user.role === 'employee') {
            query = query.eq('employeeid', req.user.id);
        }

        if (status && status !== 'all') {
            if (status === 'resolved') {
                query = query.in('status', RESOLVED_STATUSES);
            } else if (status === 'unresolved') {
                query = query.eq('status', 'pending');
            } else {
                query = query.eq('status', status);
            }
        }

        const { data: rows, error } = await query;

        if (error) {
            console.error('Fetch excuses error:', error);
            return res.status(500).json({ error: 'Failed to fetch excuses' });
        }

        let excuses = (rows || []).map(normalizeExcuse);

        if (search && typeof search === 'string' && search.trim()) {
            const needle = search.trim().toLowerCase();
            excuses = excuses.filter((excuse) => {
                const haystack = [
                    excuse.reason,
                    excuse.reason_details,
                    excuse.ticket?.client_name,
                    excuse.ticket?.client_id,
                    excuse.employee?.fullname,
                    excuse.employee?.email
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                return haystack.includes(needle);
            });
        }

        res.json({ excuses, total: excuses.length });

    } catch (error) {
        console.error('Get excuses error:', error);
        res.status(500).json({ error: 'Failed to get excuses' });
    }
});

// ============================================
// ADMIN ROUTES - Review Excuses
// ============================================

/**
 * GET /excuses/pending
 * Get all pending excuses for review
 * Role: admin
 */
router.get('/pending', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { data: rows, error } = await supabaseAdmin
            .from('employeeexcuses')
            .select('*, tickets!ticketid(id, clientname, client_id, visittype, visitnumber, status, createdat), users!employeeid(fullname, email)')
            .eq('status', 'pending')
            .order('submittedat', { ascending: true });

        if (error) {
            console.error('Fetch pending excuses error:', error);
            return res.status(500).json({ error: 'Failed to fetch pending excuses' });
        }

        const pendingExcuses = (rows || []).map(normalizeExcuse);

        res.json({
            pending: pendingExcuses,
            count: pendingExcuses.length
        });

    } catch (error) {
        console.error('Get pending excuses error:', error);
        res.status(500).json({ error: 'Failed to get pending excuses' });
    }
});

/**
 * POST /excuses/:id/accept
 * Accept an excuse and schedule new reminder
 * Role: admin
 */
router.post('/:id/accept', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_notes, next_reminder_at } = req.body;

        const { data: excuse, error: excuseError } = await supabaseAdmin
            .from('employeeexcuses')
            .select('id, status, ticketid')
            .eq('id', id)
            .single();

        if (excuseError || !excuse) {
            return res.status(404).json({ error: 'Excuse not found' });
        }

        if (excuse.status !== 'pending') {
            return res.status(400).json({ error: 'Excuse already reviewed' });
        }

        // Update excuse status
        const { error: updateError } = await supabaseAdmin
            .from('employeeexcuses')
            .update({
                status: 'accepted',
                reviewedby: req.user.id,
                reviewedat: new Date().toISOString(),
                adminnotes: admin_notes || null,
                nextreminderat: next_reminder_at || null
            })
            .eq('id', id);

        if (updateError) {
            console.error('Update excuse error:', updateError);
            return res.status(500).json({ error: 'Failed to accept excuse' });
        }

        console.log(`✅ Excuse ${id} accepted by ${req.user.fullname}`);

        res.json({
            success: true,
            message: 'Excuse accepted',
            next_reminder_at
        });

    } catch (error) {
        console.error('Accept excuse error:', error);
        res.status(500).json({ error: 'Failed to accept excuse' });
    }
});

/**
 * POST /excuses/:id/reject
 * Reject an excuse
 * Role: admin
 */
router.post('/:id/reject', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_notes } = req.body;

        const { data: excuse, error: excuseError } = await supabaseAdmin
            .from('employeeexcuses')
            .select('id, status, ticketid')
            .eq('id', id)
            .single();

        if (excuseError || !excuse) {
            return res.status(404).json({ error: 'Excuse not found' });
        }

        if (excuse.status !== 'pending') {
            return res.status(400).json({ error: 'Excuse already reviewed' });
        }

        // Update excuse status
        const { error: updateError } = await supabaseAdmin
            .from('employeeexcuses')
            .update({
                status: 'rejected',
                reviewedby: req.user.id,
                reviewedat: new Date().toISOString(),
                adminnotes: admin_notes || 'No reason provided'
            })
            .eq('id', id);

        if (updateError) {
            console.error('Update excuse error:', updateError);
            return res.status(500).json({ error: 'Failed to reject excuse' });
        }

        // Flag ticket for escalation
        await supabaseAdmin
            .from('tickets')
            .update({ notes: 'FLAGGED: Excuse rejected' })
            .eq('id', excuse.ticketid);

        console.log(`❌ Excuse ${id} rejected by ${req.user.fullname}`);

        res.json({
            success: true,
            message: 'Excuse rejected. Ticket flagged for review.'
        });

    } catch (error) {
        console.error('Reject excuse error:', error);
        res.status(500).json({ error: 'Failed to reject excuse' });
    }
});

export default router;
