import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { logActivity } from '../services/activityLog.js';
import { getVisitSequence } from '../services/visitSequencing.js';

const router = Router();

// ============================================
// SELL.DO WEBHOOK - Lead Assignment
// ============================================

/**
 * POST /webhooks/selldo/lead
 * Called by sell.do CRM when a lead is assigned or reassigned.
 * Creates or reassigns a draft ticket for the matched employee.
 *
 * Security: x-webhook-secret header (no JWT — sell.do can't send one)
 * Idempotency: duplicate payloads for the same lead don't create duplicate drafts
 */
router.post('/selldo/lead', async (req, res) => {
    try {
        // 1. Verify webhook secret
        const secret = req.headers['x-webhook-secret'];
        const expectedSecret = process.env.SELLDO_WEBHOOK_SECRET;

        if (!expectedSecret || secret !== expectedSecret) {
            console.warn('⚠️ Sell.do webhook: invalid or missing secret');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // 2. Extract fields from sell.do payload
        const { lead_id, lead = {}, payload = {}, event } = req.body;

        const clientName = [lead.first_name, lead.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() || 'Unknown Lead';

        const clientId = lead_id?.toString()?.trim();
        const salesEmail = payload.sales_email?.trim();
        const salesName = payload.sales_name?.trim();
        const stageName = payload.stage_name?.trim() || 'site_visit';

        // Build notes from lead contact info
        const notesParts = [];
        if (lead.phone) notesParts.push(`Phone: ${lead.phone}`);
        if (lead.email) notesParts.push(`Email: ${lead.email}`);
        if (payload.team_name) notesParts.push(`Team: ${payload.team_name}`);
        notesParts.push(`Source: sell.do (${event || 'unknown'})`);
        const notes = notesParts.join(' | ');

        console.log(`📥 Sell.do webhook: event=${event}, lead_id=${clientId}, sales=${salesEmail || salesName}`);

        if (!clientId) {
            console.warn('⚠️ Sell.do webhook: missing lead_id');
            // Return 200 to prevent sell.do retry storms
            return res.status(200).json({ success: false, reason: 'missing lead_id' });
        }

        // 3. Find the employee in our users table
        let employee = null;

        // Try by email first (preferred)
        if (salesEmail) {
            const { data, error } = await supabaseAdmin
                .from('users')
                .select('id, fullname, email, role')
                .eq('email', salesEmail)
                .eq('role', 'employee')
                .single();

            if (!error && data) employee = data;
        }

        // Fallback: match by fullname
        if (!employee && salesName) {
            const { data, error } = await supabaseAdmin
                .from('users')
                .select('id, fullname, email, role')
                .ilike('fullname', salesName)
                .eq('role', 'employee')
                .single();

            if (!error && data) employee = data;
        }

        if (!employee) {
            console.warn(`⚠️ Sell.do webhook: no employee found for email="${salesEmail}" name="${salesName}"`);
            // Return 200 — we don't want sell.do retrying for an employee mismatch
            return res.status(200).json({ success: false, reason: 'employee_not_found' });
        }

        console.log(`👤 Matched employee: ${employee.fullname} (${employee.id})`);

        // 4. Check for existing draft for this lead_id (idempotency + reassignment)
        const { data: existingDrafts, error: draftQueryError } = await supabaseAdmin
            .from('tickets')
            .select('id, createdby')
            .eq('client_id', clientId)
            .eq('status', 'draft');

        if (draftQueryError) {
            console.error('❌ Sell.do webhook: draft query error:', draftQueryError);
            return res.status(200).json({ success: false, reason: 'db_error' });
        }

        const existingDraft = existingDrafts?.[0] || null;

        // 4a. Same employee already has a draft → idempotent skip
        if (existingDraft && existingDraft.createdby === employee.id) {
            console.log(`⏭️ Sell.do webhook: draft already exists for lead=${clientId}, employee=${employee.fullname} — skipping`);
            return res.status(200).json({
                success: true,
                action: 'skipped',
                reason: 'draft_already_exists',
                ticket_id: existingDraft.id
            });
        }

        // 4b. Different employee (reassignment) → update createdby
        if (existingDraft && existingDraft.createdby !== employee.id) {
            const { error: updateError } = await supabaseAdmin
                .from('tickets')
                .update({ createdby: employee.id })
                .eq('id', existingDraft.id);

            if (updateError) {
                console.error('❌ Sell.do webhook: reassignment update error:', updateError);
                return res.status(200).json({ success: false, reason: 'reassign_failed' });
            }

            console.log(`🔄 Sell.do webhook: reassigned draft ${existingDraft.id} to ${employee.fullname}`);

            // Log the reassignment
            await logActivity(req, 'webhook.selldo.lead_reassigned', {
                ticket_id: existingDraft.id,
                employee_name: employee.fullname,
                client_name: clientName,
                lead_id: clientId
            });

            return res.status(200).json({
                success: true,
                action: 'reassigned',
                ticket_id: existingDraft.id,
                assigned_to: employee.fullname
            });
        }

        // 4c. No existing draft → create new one
        const ticketId = uuidv4();
        const { visitNumber, previousTicketId } = await getVisitSequence(clientId);

        // Mirror the exact insert pattern from drafts.js (both column formats)
        const { data: draft, error: insertError } = await supabaseAdmin
            .from('tickets')
            .insert({
                id: ticketId,
                client_id: clientId,
                clientname: clientName,
                visittype: stageName,
                visitnumber: visitNumber,
                previousvisitticketid: previousTicketId,
                createdby: employee.id,
                status: 'draft',
                notes: notes
            })
            .select()
            .single();

        if (insertError) {
            console.error('❌ Sell.do webhook: draft insert error:', insertError);
            return res.status(200).json({ success: false, reason: 'insert_failed' });
        }

        console.log(`✅ Sell.do webhook: created draft ${ticketId} for ${employee.fullname} (lead: ${clientName})`);

        // Log the creation
        await logActivity(req, 'webhook.selldo.lead_assigned', {
            ticket_id: ticketId,
            employee_name: employee.fullname,
            client_name: clientName,
            lead_id: clientId,
            visit_number: visitNumber
        });

        return res.status(200).json({
            success: true,
            action: 'created',
            ticket_id: ticketId,
            assigned_to: employee.fullname,
            visit_number: visitNumber
        });

    } catch (error) {
        console.error('❌ Sell.do webhook error:', error);
        // Always 200 — don't trigger sell.do retries for server errors
        return res.status(200).json({ success: false, reason: 'internal_error' });
    }
});

export default router;
