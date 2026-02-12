import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { supabaseAdmin } from '../config/supabase.js';
import { buckets, checkAudioExists, getAudioUri, generatePlaybackUrl, promoteToTraining } from '../config/gcs.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin, requireEmployee } from '../middleware/rbac.js';
import { getVisitSequence, getPreviousAnalysis, getVisitChain } from '../services/visitSequencing.js';
import { analyzeAudio } from '../services/vertexai.js';

const router = Router();

// Configure multer for memory storage (files stored in RAM temporarily)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB max
    }
});

// MIME type mappings
const mimeTypes = {
    'wav': 'audio/wav',
    'mp3': 'audio/mpeg',
    'm4a': 'audio/mp4',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    'webm': 'audio/webm',
    'aac': 'audio/aac'
};

function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function formatMetricLabel(key) {
    return key
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractNumericScores(analysisRow) {
    const result = {};
    const scores = analysisRow?.scores && typeof analysisRow.scores === 'object'
        ? analysisRow.scores
        : {};

    for (const [key, raw] of Object.entries(scores)) {
        const n = toNumber(raw);
        if (n !== null) result[key] = n;
    }

    const fallbackPairs = [
        ['politeness', analysisRow?.politeness_score],
        ['confidence', analysisRow?.confidence_score],
        ['speakers', analysisRow?.speakers_detected]
    ];

    for (const [key, raw] of fallbackPairs) {
        if (result[key] !== undefined) continue;
        const n = toNumber(raw);
        if (n !== null) result[key] = n;
    }

    return result;
}

function buildComparison(currentAnalysis, previousAnalysis) {
    if (!currentAnalysis) return null;

    const currentScores = extractNumericScores(currentAnalysis);
    const previousScores = extractNumericScores(previousAnalysis);

    const preferredOrder = [
        'politeness',
        'confidence',
        'interest',
        'rapport_building',
        'needs_discovery',
        'objection_handling',
        'closing_techniques',
        'product_knowledge',
        'professionalism'
    ];

    const allKeysSet = new Set([
        ...Object.keys(currentScores),
        ...Object.keys(previousScores)
    ]);

    const orderedKeys = [
        ...preferredOrder.filter((k) => allKeysSet.has(k)),
        ...[...allKeysSet].filter((k) => !preferredOrder.includes(k)).sort()
    ].slice(0, 6);

    if (orderedKeys.length === 0) return null;

    return {
        keys: orderedKeys,
        labels: orderedKeys.map(formatMetricLabel),
        current: orderedKeys.map((k) => currentScores[k] ?? 0),
        previous: orderedKeys.map((k) => previousScores[k] ?? 0),
        delta_score: currentAnalysis.comparisonwithprevious?.delta_score ?? null
    };
}

function extractGcsObjectPath(ticket) {
    if (!ticket) return null;

    const rawPath = ticket.gcs_path || ticket.gcspath || null;
    if (!rawPath || typeof rawPath !== 'string') return null;

    if (rawPath.startsWith('gs://')) {
        const parts = rawPath.replace('gs://', '').split('/');
        if (parts.length < 2) return null;
        parts.shift(); // remove bucket name
        return parts.join('/');
    }

    return rawPath;
}

async function generateTicketAudioUrl(ticketId, ticket = null) {
    const objectPath = extractGcsObjectPath(ticket);

    if (objectPath) {
        const [exists] = await buckets.uploads.file(objectPath).exists();
        if (exists) {
            return await generatePlaybackUrl('uploads', objectPath);
        }
    }

    const { exists, extension } = await checkAudioExists(ticketId);
    if (!exists || !extension) return null;

    return await generatePlaybackUrl('uploads', `${ticketId}.${extension}`);
}

// ============================================
// EMPLOYEE ROUTES (Upload Only)
// ============================================

/**
 * POST /tickets/upload
 * Upload audio file directly (bypasses signed URLs)
 * Role: employee, admin
 */
router.post('/upload', authMiddleware, requireEmployee, upload.single('audio'), async (req, res) => {
    try {
        const { client_id, client_name, visit_type, ticket_id } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({
                error: 'Audio file is required'
            });
        }

        const now = new Date().toISOString();
        const requestedTicketId = typeof ticket_id === 'string' ? ticket_id.trim() : '';
        const isDraftUpload = Boolean(requestedTicketId);
        const ticketId = isDraftUpload ? requestedTicketId : uuidv4();
        const extension = file.originalname.split('.').pop()?.toLowerCase() || 'mp3';
        const gcsPath = `${ticketId}.${extension}`;
        const contentType = mimeTypes[extension] || 'audio/mpeg';

        let ticket = null;
        let visitNumber = 1;
        let previousTicketId = null;
        let resolvedClientId = client_id?.trim() || null;
        let resolvedClientName = client_name?.trim() || null;
        let resolvedVisitType = visit_type || 'site_visit';

        if (isDraftUpload) {
            const { data: draftTicket, error: draftError } = await supabaseAdmin
                .from('tickets')
                .select('*')
                .eq('id', ticketId)
                .single();

            if (draftError || !draftTicket) {
                return res.status(404).json({ error: 'Draft ticket not found' });
            }

            const draftOwnerId = draftTicket.created_by || draftTicket.createdby;
            if (req.user.role === 'employee' && draftOwnerId !== req.user.id) {
                return res.status(403).json({ error: 'Not authorized to upload for this draft' });
            }

            if (!['draft', 'pending', 'uploading'].includes(draftTicket.status)) {
                return res.status(400).json({
                    error: `Ticket is not uploadable. Current status: ${draftTicket.status}`
                });
            }

            resolvedClientName = draftTicket.client_name || draftTicket.clientname || resolvedClientName;
            resolvedClientId = draftTicket.client_id || resolvedClientId || resolvedClientName || `draft-${ticketId.slice(0, 8)}`;
            resolvedVisitType = draftTicket.visit_type || draftTicket.visittype || resolvedVisitType;
            visitNumber = draftTicket.visit_number || draftTicket.visitnumber || 1;
            previousTicketId = draftTicket.previous_visit_ticket_id || draftTicket.previousvisitticketid || null;

            const { error: draftUpdateError } = await supabaseAdmin
                .from('tickets')
                .update({
                    status: 'uploading',
                    client_id: resolvedClientId,
                    clientname: resolvedClientName,
                    visittype: resolvedVisitType,
                    uploadstartedat: now,
                    gcspath: `gs://${buckets.uploads.name}/${gcsPath}`
                })
                .eq('id', ticketId);

            if (draftUpdateError) {
                console.error('Draft update error:', draftUpdateError);
                return res.status(500).json({
                    error: 'Failed to prepare draft upload',
                    details: draftUpdateError.message
                });
            }

            ticket = {
                ...draftTicket,
                id: ticketId,
                client_id: resolvedClientId,
                client_name: resolvedClientName,
                visit_number: visitNumber,
                previous_visit_ticket_id: previousTicketId
            };
        } else {
            if (!resolvedClientId) {
                return res.status(400).json({
                    error: 'client_id and audio file are required for direct uploads'
                });
            }

            // Get visit sequence using client_id
            const visitSequence = await getVisitSequence(resolvedClientId);
            visitNumber = visitSequence.visitNumber;
            previousTicketId = visitSequence.previousTicketId;

            // Create ticket in database (use actual column names from schema)
            const { data: createdTicket, error: ticketError } = await supabaseAdmin
                .from('tickets')
                .insert({
                    id: ticketId,
                    client_id: resolvedClientId,
                    clientname: resolvedClientName,
                    visittype: resolvedVisitType,
                    visitnumber: visitNumber,
                    previousvisitticketid: previousTicketId,
                    createdby: req.user.id,
                    status: 'uploading',
                    gcspath: `gs://${buckets.uploads.name}/${gcsPath}`,
                    uploadstartedat: now
                })
                .select()
                .single();

            if (ticketError) {
                console.error('Ticket creation error:', ticketError);
                return res.status(500).json({
                    error: 'Failed to create ticket',
                    details: ticketError.message
                });
            }

            ticket = createdTicket;
        }

        // Upload file to GCS
        const gcsFile = buckets.uploads.file(gcsPath);
        await gcsFile.save(file.buffer, {
            contentType: contentType,
            metadata: {
                ticketId: ticketId,
                clientId: resolvedClientId || '',
                clientName: resolvedClientName || '',
                uploadedBy: req.user.id
            }
        });

        // Update ticket status to pending (upload complete)
        await supabaseAdmin
            .from('tickets')
            .update({
                status: 'pending',
                uploadcompletedat: now
            })
            .eq('id', ticketId);

        console.log(`✅ Uploaded ticket: ${ticketId} (Visit #${visitNumber} for Client ID: ${resolvedClientId})`);

        // Trigger analysis in background
        triggerAnalysis(ticketId, ticket).catch(err => {
            console.error(`Analysis trigger failed for ${ticketId}:`, err);
        });

        res.json({
            success: true,
            ticket_id: ticketId,
            visit_number: visitNumber,
            previous_ticket_id: previousTicketId,
            message: isDraftUpload
                ? 'Draft upload complete, analysis started'
                : 'Upload complete, analysis started'
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});


// Background analysis trigger
async function triggerAnalysis(ticketId, ticket) {
    try {
        // Update status to processing
        await supabaseAdmin
            .from('tickets')
            .update({
                status: 'processing',
                analysis_started_at: new Date().toISOString()
            })
            .eq('id', ticketId);

        console.log(`🔍 Starting analysis for ticket: ${ticketId} (Client ID: ${ticket.client_id})`);

        // Get previous analysis for comparison if previous ticket exists
        let previousAnalysis = null;
        const previousTicketId = ticket.previous_visit_ticket_id || ticket.previousvisitticketid || null;
        if (previousTicketId) {
            previousAnalysis = await getPreviousAnalysis(previousTicketId);
            const visitNumber = ticket.visit_number || ticket.visitnumber || 1;
            console.log(`📊 Found previous analysis for comparison (Visit #${visitNumber - 1})`);
        }

        // Run AI analysis
        // analyzeAudio expects (ticketId, ticketInfo)
        const analysis = await analyzeAudio(ticketId, {
            client_id: ticket.client_id,
            client_name: ticket.client_name || ticket.clientname,
            visit_number: ticket.visit_number || ticket.visitnumber,
            previous_analysis: previousAnalysis
        });

        // Normalize scores: merge top-level Gemini fields into scores object
        const normalizedScores = {
            ...(analysis.scores || {}),
            politeness: analysis.politeness_score ?? analysis.scores?.politeness ?? null,
            confidence: analysis.confidence_score ?? analysis.scores?.confidence ?? null,
            interest: analysis.customer_interest_level ?? analysis.scores?.interest ?? null,
            speakers: analysis.speakers_detected ?? analysis.scores?.speakers ?? null
        };

        // Store analysis results in analysisresults table (using actual column names)
        const { error: analysisError } = await supabaseAdmin
            .from('analysisresults')
            .upsert({
                ticketid: ticketId,
                status: 'completed',
                rating: analysis.overall_score || null,
                summary: analysis.summary || null,
                keymoments: analysis.key_moments ? analysis.key_moments.map(m => ({
                    ...m,
                    time: m.timestamp || m.start_time_ms // Map timestamp to time for frontend compatibility
                })) : [],
                improvementsuggestions: analysis.recommendations || analysis.improvement_suggestions || [],
                actionitems: analysis.action_items || [],
                objections: analysis.objections || [],
                scores: normalizedScores,
                comparisonwithprevious: analysis.comparison_with_previous || null
            }, { onConflict: 'ticketid' });

        if (analysisError) {
            console.error('Failed to store analysis results:', analysisError);
        }

        // Update ticket status and cache key metrics + comparison data
        const ticketUpdate = {
            status: 'analyzed',
            rating: analysis.overall_score || null,
            analysiscompletedat: new Date().toISOString(),
            istrainingcall: (analysis.overall_score || 0) >= 4.0
        };

        // Store comparison results if available
        if (analysis.comparison_with_previous) {
            ticketUpdate.improveconntsvsprevious = analysis.comparison_with_previous;
            console.log(`📈 Comparison: Delta score ${analysis.comparison_with_previous.delta_score}`);
        }

        await supabaseAdmin
            .from('tickets')
            .update(ticketUpdate)
            .eq('id', ticketId);

        console.log(`✅ Analysis complete for ticket: ${ticketId} (Score: ${analysis.overall_score})`);

        // Auto-promote to training if rating >= 4.0
        if ((analysis.overall_score || 0) >= 4.0) {
            try {
                // Check if audio exists first (needed for promotion)
                const { exists, extension } = await checkAudioExists(ticketId);
                if (exists) {
                    await promoteToTraining(ticketId, extension);
                    console.log(`🎓 Auto-promoted ticket ${ticketId} to training library`);

                    // Add record to trainingtickets
                    await supabaseAdmin
                        .from('trainingtickets')
                        .insert({
                            ticketid: ticketId,
                            promotedby: null,
                            promotedat: new Date().toISOString()
                        });
                }
            } catch (promoteError) {
                console.error(`⚠️ Auto-promotion failed for ${ticketId}:`, promoteError);
                // Don't fail the whole analysis job for promotion failure
            }
        }

    } catch (error) {
        console.error(`❌ Analysis failed for ticket ${ticketId}:`, error);
        await supabaseAdmin
            .from('tickets')
            .update({
                status: 'analysis_failed',
                analysis_error: error.message,
                analysiserror: error.message // Save in both formats if needed
            })
            .eq('id', ticketId);
    }
}

/**
 * POST /tickets/init
 * Initialize a new ticket and get upload URL (uses IAM-based signing)
 * Role: employee, admin
 */
router.post('/init', authMiddleware, requireEmployee, async (req, res) => {
    try {
        const { client_name, visit_type, filename } = req.body;

        if (!client_name || !filename) {
            return res.status(400).json({
                error: 'client_name and filename are required'
            });
        }

        const ticketId = uuidv4();

        // Get visit sequence
        const { visitNumber, previousTicketId } = await getVisitSequence(client_name);

        // Import generateUploadUrl
        const { generateUploadUrl } = await import('../config/gcs.js');

        // Create ticket in database
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .insert({
                id: ticketId,
                clientname: client_name.trim(),
                client_name: client_name.trim(),
                visittype: visit_type || 'site_visit',
                visit_type: visit_type || 'site_visit',
                visitnumber: visitNumber,
                visit_number: visitNumber,
                previousvisitticketid: previousTicketId,
                previous_visit_ticket_id: previousTicketId,
                createdby: req.user.id,
                created_by: req.user.id,
                status: 'pending',
                uploadstartedat: new Date().toISOString(),
                upload_started_at: new Date().toISOString()
            })
            .select()
            .single();

        if (ticketError) {
            console.error('Ticket creation error:', ticketError);
            return res.status(500).json({
                error: 'Failed to create ticket',
                details: ticketError.message,
                code: ticketError.code
            });
        }

        // Generate signed upload URL
        const { uploadUrl, gcsPath, contentType } = await generateUploadUrl(ticketId, filename);

        console.log(`📋 Created ticket: ${ticketId} (Visit #${visitNumber} for ${client_name})`);

        res.json({
            ticket_id: ticketId,
            visit_number: visitNumber,
            previous_ticket_id: previousTicketId,
            upload_url: uploadUrl,
            gcs_path: gcsPath,
            content_type: contentType
        });

    } catch (error) {
        console.error('Init ticket error:', error);
        res.status(500).json({ error: 'Failed to initialize ticket', details: error.message });
    }
});

/**
 * POST /tickets/:id/upload-complete
 * Mark upload as complete and trigger analysis
 * Role: employee, admin
 */
router.post('/:id/upload-complete', authMiddleware, requireEmployee, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify audio exists in GCS
        const { exists, extension, path } = await checkAudioExists(id);

        if (!exists) {
            return res.status(400).json({
                error: 'Audio file not found. Upload may have failed.'
            });
        }

        // Update ticket status
        const { data: ticket, error: updateError } = await supabaseAdmin
            .from('tickets')
            .update({
                status: 'uploaded',
                gcs_path: getAudioUri(id, extension),
                upload_completed_at: new Date().toISOString()
            })
            .eq('id', id)
            .select('*, previous_visit_ticket_id')
            .single();

        if (updateError) {
            console.error('Update error:', updateError);
            return res.status(500).json({ error: 'Failed to update ticket' });
        }

        console.log(`✅ Upload complete for ticket: ${id}`);

        // Trigger analysis asynchronously
        triggerAnalysis(id, ticket);

        res.json({
            success: true,
            ticket_id: id,
            status: 'uploaded',
            message: 'Upload complete. Analysis started.'
        });

    } catch (error) {
        console.error('Upload complete error:', error);
        res.status(500).json({ error: 'Failed to complete upload' });
    }
});

// ============================================
// ADMIN ROUTES (Full Access)
// ============================================

/**
 * GET /tickets
 * List all tickets with filters
 * Role: admin
 */
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const {
            status,
            dateRange,
            createdBy,
            liveOnly,
            search,
            page = 1,
            limit = 12
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        let query = supabaseAdmin
            .from('tickets')
            .select('*', { count: 'exact' })
            .is('deletedat', null)
            .order('createdat', { ascending: false })
            .range(offset, offset + limitNum - 1);

        // Status filter
        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        // Live only filter (pending or processing)
        if (liveOnly === 'true') {
            query = query.in('status', ['pending', 'processing', 'uploading']);
        }

        // Created by filter
        if (createdBy && createdBy !== 'all') {
            query = query.eq('createdby', createdBy);
        }

        // Search filter (client name or client ID)
        if (search) {
            query = query.or(`clientname.ilike.%${search}%,client_id.ilike.%${search}%`);
        }

        // Date range filter
        if (dateRange && dateRange !== 'all') {
            const now = new Date();
            let fromDate;

            switch (dateRange) {
                case 'today':
                    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case '7days':
                    fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30days':
                    fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    fromDate = null;
            }

            if (fromDate) {
                query = query.gte('createdat', fromDate.toISOString());
            }
        }

        const { data: tickets, error, count } = await query;

        if (error) {
            console.error('List tickets error:', error);
            return res.status(500).json({ error: 'Failed to fetch tickets' });
        }

        res.json({
            tickets,
            total: count || 0,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil((count || 0) / limitNum)
        });

    } catch (error) {
        console.error('List error:', error);
        res.status(500).json({ error: 'Failed to list tickets' });
    }
});

/**
 * GET /tickets/:id/audio-url
 * Generate a fresh signed URL for audio playback
 * Role: admin
 */
router.get('/:id/audio-url', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .select('id, gcs_path, gcspath')
            .eq('id', id)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const audioUrl = await generateTicketAudioUrl(id, ticket);
        if (!audioUrl) {
            return res.status(404).json({ error: 'Audio file not found for this ticket' });
        }

        res.json({
            audio_url: audioUrl,
            expires_in_seconds: 86400
        });
    } catch (error) {
        console.error('Audio URL generation error:', error);
        res.status(500).json({ error: 'Failed to generate audio playback URL' });
    }
});

/**
 * GET /tickets/:id
 * Get single ticket with full details
 * Role: admin
 */
router.get('/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Get ticket with creator info
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .select('*')
            .eq('id', id)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Get analysis results
        const { data: analysis } = await supabaseAdmin
            .from('analysisresults')
            .select('*')
            .eq('ticketid', id)
            .single();

        // Get previous analysis row for comparisons
        const previousTicketId = ticket.previous_visit_ticket_id || ticket.previousvisitticketid || null;
        let previousAnalysis = null;
        if (previousTicketId) {
            const { data: prev } = await supabaseAdmin
                .from('analysisresults')
                .select('*')
                .eq('ticketid', previousTicketId)
                .maybeSingle();
            previousAnalysis = prev || null;
        }

        // Get action items from actionitems table
        let actionItemsDb = [];
        const { data: actionRows, error: actionError } = await supabaseAdmin
            .from('actionitems')
            .select('id, ticketid, assignedto, title, description, duedate, completed, completedat, completedby, createdby, createdat')
            .eq('ticketid', id)
            .order('createdat', { ascending: false });

        if (actionError) {
            console.error('Fetch actionitems error:', actionError);
        } else {
            actionItemsDb = (actionRows || []).map((row) => ({
                id: row.id,
                ticket_id: row.ticketid,
                assigned_to: row.assignedto,
                title: row.title,
                description: row.description,
                due_date: row.duedate,
                completed: row.completed,
                completed_at: row.completedat,
                completed_by: row.completedby,
                created_by: row.createdby,
                created_at: row.createdat
            }));
        }

        // Get excuses linked to this ticket
        let excuses = [];
        const { data: excuseRows, error: excusesError } = await supabaseAdmin
            .from('employeeexcuses')
            .select('id, ticketid, employeeid, reason, reasondetails, estimatedtimeminutes, estimatedstarttime, status, submittedat, reviewedat, adminnotes, users!employeeid(fullname, email)')
            .eq('ticketid', id)
            .order('submittedat', { ascending: false });

        if (excusesError) {
            console.error('Fetch ticket excuses error:', excusesError);
        } else {
            excuses = (excuseRows || []).map((row) => ({
                id: row.id,
                ticket_id: row.ticketid,
                employee_id: row.employeeid,
                reason: row.reason,
                reason_details: row.reasondetails || null,
                estimated_time_minutes: row.estimatedtimeminutes,
                estimated_start_time: row.estimatedstarttime,
                status: row.status,
                submitted_at: row.submittedat,
                reviewed_at: row.reviewedat,
                admin_notes: row.adminnotes,
                employee: row.users ? {
                    fullname: row.users.fullname || 'Unknown',
                    email: row.users.email || ''
                } : null
            }));
        }

        // Get visit chain
        const visitChain = await getVisitChain(id);

        // Generate playback URL if audio exists
        let audioUrl = null;
        try {
            audioUrl = await generateTicketAudioUrl(id, ticket);
        } catch (audioError) {
            console.error('Error generating audio URL:', audioError.message);
            // Continue without audio URL
        }

        res.json({
            ticket,
            analysis,
            previous_analysis: previousAnalysis,
            comparison: buildComparison(analysis, previousAnalysis),
            action_items_db: actionItemsDb,
            excuses,
            visit_chain: visitChain,
            audio_url: audioUrl
        });

    } catch (error) {
        console.error('Get ticket error:', error);
        res.status(500).json({ error: 'Failed to fetch ticket' });
    }
});

/**
 * POST /tickets/:id/promote
 * Promote ticket to training library
 * Role: admin
 */
router.post('/:id/promote', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check ticket exists and has good rating
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .select('id, rating, istrainingcall')
            .eq('id', id)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (ticket.istrainingcall) {
            return res.status(400).json({ error: 'Ticket is already in training library' });
        }

        // Get audio file info
        const { exists, extension } = await checkAudioExists(id);
        if (!exists) {
            return res.status(400).json({ error: 'Audio file not found' });
        }

        // Copy audio to training bucket
        await promoteToTraining(id, extension);

        // Update ticket
        await supabaseAdmin
            .from('tickets')
            .update({ istrainingcall: true })
            .eq('id', id);

        // Add to trainingtickets table
        await supabaseAdmin
            .from('trainingtickets')
            .insert({
                ticketid: id,
                promotedby: req.user.id,
                promotedat: new Date().toISOString()
            });

        console.log(`🎓 Ticket ${id} promoted to training library`);

        res.json({
            success: true,
            message: 'Ticket promoted to training library'
        });

    } catch (error) {
        console.error('Promote error:', error);
        res.status(500).json({ error: 'Failed to promote ticket' });
    }
});

/**
 * POST /tickets/:id/analyze
 * Manually trigger re-analysis of a ticket (synchronous - waits for completion)
 * Role: admin
 */
router.post('/:id/analyze', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch ticket details
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .select('*')
            .eq('id', id)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Check if audio exists
        const { exists } = await checkAudioExists(id);
        if (!exists) {
            return res.status(400).json({ error: 'Audio file not found for this ticket' });
        }



        // Helper to get visit number (handle inconsistent DB naming)
        let visitNumber = ticket.visit_number || ticket.visitnumber || 1;
        console.log(`🔍 DEBUG: Derived Visit Number: ${visitNumber} (Raw: visit_number=${ticket.visit_number}, visitnumber=${ticket.visitnumber})`);

        // EMERGENCY FIX: If visit is 1 but previous ticket exists, FORCE it to 2 to enable comparison
        const prevTicketIdRaw = ticket.previous_visit_ticket_id || ticket.previousvisitticketid;
        if (visitNumber === 1 && prevTicketIdRaw) {
            console.log("ℹ️ Auto-correcting visit number to 2 based on previous ticket existence.");
            visitNumber = 2;
        }

        // Get previous analysis for comparison if available
        let previousAnalysis = null;
        const prevTicketId = ticket.previous_visit_ticket_id || ticket.previousvisitticketid;
        if (prevTicketId) {
            previousAnalysis = await getPreviousAnalysis(prevTicketId);
            console.log(`📊 Found previous analysis for comparison (Visit #${visitNumber - 1})`);
            console.log('🔍 DEBUG: Previous analysis object:', JSON.stringify(previousAnalysis, null, 2));
            console.log('🔍 DEBUG: Previous scores:', previousAnalysis?.scores);
        }

        // Run analysis
        const analysis = await analyzeAudio(id, {
            client_id: ticket.client_id,
            client_name: ticket.clientname,
            visit_number: visitNumber,
            previous_analysis: previousAnalysis
        });

        // Normalize scores: merge top-level Gemini fields into scores object
        const normalizedScores = {
            ...(analysis.scores || {}),
            politeness: analysis.politeness_score ?? analysis.scores?.politeness ?? null,
            confidence: analysis.confidence_score ?? analysis.scores?.confidence ?? null,
            interest: analysis.customer_interest_level ?? analysis.scores?.interest ?? null,
            speakers: analysis.speakers_detected ?? analysis.scores?.speakers ?? null
        };

        // Update database with new results
        const { error: analysisError } = await supabaseAdmin
            .from('analysisresults')
            .upsert({
                ticketid: id,
                status: 'completed',
                rating: analysis.overall_score || null,
                summary: analysis.summary || null,
                keymoments: analysis.key_moments ? analysis.key_moments.map(m => ({
                    ...m,
                    time: m.timestamp || m.start_time_ms
                })) : [],
                improvementsuggestions: analysis.recommendations || analysis.improvement_suggestions || [],
                actionitems: analysis.action_items || [],
                objections: analysis.objections || [],
                scores: normalizedScores,
                comparisonwithprevious: analysis.comparison_with_previous || null
            }, { onConflict: 'ticketid' });

        if (analysisError) {
            throw new Error(`Failed to save analysis: ${analysisError.message}`);
        }

        // Update ticket status
        const ticketUpdate = {
            status: 'analyzed',
            rating: analysis.overall_score || null,
            analysiscompletedat: new Date().toISOString(),
            istrainingcall: (analysis.overall_score || 0) >= 4.0
        };

        if (analysis.comparison_with_previous) {
            ticketUpdate.improveconntsvsprevious = analysis.comparison_with_previous;
        }

        await supabaseAdmin
            .from('tickets')
            .update(ticketUpdate)
            .eq('id', id);

        // Fetch final updated data to return
        const { data: updatedTicket } = await supabaseAdmin
            .from('tickets')
            .select('*')
            .eq('id', id)
            .single();

        const { data: updatedAnalysis } = await supabaseAdmin
            .from('analysisresults')
            .select('*')
            .eq('ticketid', id)
            .single();

        res.json({
            message: 'Re-analysis complete',
            ticket: updatedTicket,
            analysis: updatedAnalysis
        });

    } catch (error) {
        console.error('Re-analysis failed:', error);
        res.status(500).json({ error: 'Analysis failed: ' + error.message });
    }
});

export default router;
