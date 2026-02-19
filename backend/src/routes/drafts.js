import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin, requireEmployee } from '../middleware/rbac.js';
import { logActivity } from '../services/activityLog.js';
import { getVisitSequence } from '../services/visitSequencing.js';

const router = Router();

// ============================================
// ADMIN ROUTES - Draft Creation
// ============================================

/**
 * POST /drafts
 * Create a draft ticket for an employee (delayed recording)
 * Role: admin
 */
router.post('/', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const {
            employee_id,
            client_id,
            client_name,
            visit_type,
            expected_recording_time,
            scheduled_time,
            notes
        } = req.body;

        if (!employee_id || !client_name) {
            return res.status(400).json({
                error: 'employee_id and client_name are required'
            });
        }

        // Verify employee exists
        const { data: employee, error: empError } = await supabaseAdmin
            .from('users')
            .select('id, fullname, role')
            .eq('id', employee_id)
            .eq('role', 'employee')
            .single();

        if (empError || !employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const ticketId = uuidv4();

        const normalizedClientName = client_name.trim();
        const normalizedClientId = client_id?.trim() || normalizedClientName;

        // Get visit sequence
        const { visitNumber, previousTicketId } = await getVisitSequence(normalizedClientId);

        // Web admin panel sends "expected_recording_time" as the scheduled datetime
        // Use it as scheduled_time in the database
        const finalScheduledTime = expected_recording_time || scheduled_time || null;

        // Create draft ticket
        // Note: Database has BOTH column formats (with and without underscores), so we populate both
        const { data: draft, error: draftError } = await supabaseAdmin
            .from('tickets')
            .insert({
                id: ticketId,
                client_id: normalizedClientId,
                clientname: normalizedClientName,
                visittype: visit_type || 'site_visit',
                visitnumber: visitNumber,
                previousvisitticketid: previousTicketId,
                createdby: employee_id,
                status: 'draft',
                notes: notes || null,
                scheduled_time: finalScheduledTime,
                scheduledtime: finalScheduledTime
            })
            .select()
            .single();

        if (draftError) {
            console.error('Draft creation error:', draftError);
            return res.status(500).json({ error: 'Failed to create draft' });
        }

        console.log(`📝 Created draft ticket: ${ticketId} for employee ${employee.fullname}`);
        await logActivity(req, 'draft.assign', { ticket_id: ticketId, employee_name: employee.fullname, client_name: normalizedClientName });

        res.json({
            success: true,
            draft: {
                id: ticketId,
                client_id: normalizedClientId,
                client_name: normalizedClientName,
                visit_number: visitNumber,
                assigned_to: employee.fullname,
                scheduled_time: finalScheduledTime
            }
        });

    } catch (error) {
        console.error('Create draft error:', error);
        res.status(500).json({ error: 'Failed to create draft' });
    }
});

/**
 * GET /drafts
 * Get pending drafts for current employee
 * Role: employee
 */
router.get('/', authMiddleware, requireEmployee, async (req, res) => {
    try {
        const { data: rows, error } = await supabaseAdmin
            .from('tickets')
            .select('*')
            .eq('status', 'draft');

        if (error) {
            console.error('Fetch drafts error:', error);
            return res.status(500).json({ error: 'Failed to fetch drafts' });
        }

        const filteredRows = (rows || []).filter((row) => {
            if (req.user.role !== 'employee') return true;
            const ownerId = row.created_by || row.createdby;
            return ownerId === req.user.id;
        });

        const drafts = filteredRows
            .map((row) => ({
                id: row.id,
                client_id: row.client_id || null,
                client_name: row.client_name || row.clientname || 'Unknown Client',
                visit_type: row.visit_type || row.visittype || 'site_visit',
                visit_number: row.visit_number || row.visitnumber || 1,
                notes: row.notes || null,
                created_at: row.created_at || row.createdat || null,
                scheduled_time: row.scheduled_time || row.scheduledtime || null,
                expected_recording_time: row.expected_recording_time || row.expectedrecordingtime || row.expected_duration || row.expectedduration || null
            }))
            .sort((a, b) => {
                const aTs = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTs = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTs - aTs;
            });

        res.json({ drafts });

    } catch (error) {
        console.error('Get drafts error:', error);
        res.status(500).json({ error: 'Failed to get drafts' });
    }
});

/**
 * POST /drafts/:id/start
 * Mark recording as started for a draft
 * Role: employee
 */
router.post('/:id/start', authMiddleware, requireEmployee, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify draft belongs to employee
        const { data: draft, error: draftError } = await supabaseAdmin
            .from('tickets')
            .select('*')
            .eq('id', id)
            .single();

        if (draftError || !draft) {
            return res.status(404).json({ error: 'Draft not found' });
        }

        if (draft.status !== 'draft') {
            return res.status(400).json({ error: 'Ticket is not a draft' });
        }

        const ownerId = draft.created_by || draft.createdby;
        if (req.user.role === 'employee' && ownerId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to access this draft' });
        }

        // Update status to pending (recording started)
        const { error: updateError } = await supabaseAdmin
            .from('tickets')
            .update({
                status: 'pending',
                uploadstartedat: new Date().toISOString(),
                upload_started_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateError) {
            console.error('Update draft error:', updateError);
            return res.status(500).json({ error: 'Failed to start recording' });
        }

        console.log(`🎙️ Recording started for draft: ${id}`);

        res.json({
            success: true,
            message: 'Recording started',
            ticket_id: id
        });

    } catch (error) {
        console.error('Start draft error:', error);
        res.status(500).json({ error: 'Failed to start draft' });
    }
});

/**
 * GET /drafts/pending
 * Get drafts pending reminder (admin view)
 * Role: admin
 */
router.get('/pending', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { data: pendingDrafts, error } = await supabaseAdmin
            .from('tickets')
            .select('*, users!created_by(fullname, email)')
            .eq('status', 'draft')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Fetch pending drafts error:', error);
            return res.status(500).json({ error: 'Failed to fetch pending drafts' });
        }

        res.json({
            pending: pendingDrafts,
            count: pendingDrafts.length
        });

    } catch (error) {
        console.error('Get pending drafts error:', error);
        res.status(500).json({ error: 'Failed to get pending drafts' });
    }
});

export default router;
