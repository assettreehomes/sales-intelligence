import { SchemaType, VertexAI } from '@google-cloud/vertexai';
import { is429 } from './vertexQueue.js';
import { flashQueue } from './queues.js';
import { checkAudioExists, getAudioUri, buckets } from '../config/gcs.js';
import { getPresalesAnalysisPrompt } from '../prompts/analysis.js';
import { supabaseAdmin } from '../config/supabase.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const projectId = process.env.VERTEX_PROJECT || process.env.GCS_PROJECT_ID || 'mystical-melody-486113-p0';
const location  = process.env.VERTEX_LOCATION || 'us-central1';
const modelName = process.env.VERTEX_MODEL_PRESALES || process.env.VERTEX_MODEL || 'gemini-2.5-flash';

const vertexAI = new VertexAI({ project: projectId, location });
const model    = vertexAI.getGenerativeModel({ model: modelName });

const mimeTypes = {
    wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4',
    ogg: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm', aac: 'audio/aac'
};

const VALID_OUTCOMES = new Set(['interested', 'not_interested', 'follow_up_required']);
const VALID_AUTHENTICITY = new Set(['real', 'fake']);
const VALID_INTEREST = new Set(['low', 'medium', 'high']);
const VALID_LEAD_QUALITY = new Set(['hot', 'warm', 'cold', 'unknown']);
const REQUIRED_SCORE_KEYS = [
    'politeness',
    'confidence',
    'interest',
    'speakers'
];
const REQUIRED_LEAD_KEYS = ['lead_quality'];

const presalesResponseSchema = {
    type: SchemaType.OBJECT,
    required: [
        'summary',
        'overall_score',
        'scores',
        'lead_qualification',
        'key_moments',
        'objections',
        'action_items',
        'call_outcome',
        'call_authenticity',
        'speakers_detected',
        'number_requests'
    ],
    properties: {
        summary: { type: SchemaType.STRING },
        overall_score: { type: SchemaType.NUMBER },
        scores: {
            type: SchemaType.OBJECT,
            required: REQUIRED_SCORE_KEYS,
            properties: {
                politeness: { type: SchemaType.INTEGER },
                confidence: { type: SchemaType.INTEGER },
                interest: { type: SchemaType.STRING, enum: ['low', 'medium', 'high'] },
                speakers: { type: SchemaType.INTEGER }
            }
        },
        lead_qualification: {
            type: SchemaType.OBJECT,
            required: REQUIRED_LEAD_KEYS,
            properties: {
                lead_quality: { type: SchemaType.STRING, enum: ['hot', 'warm', 'cold', 'unknown'] }
            }
        },
        key_moments: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                required: ['label', 'category', 'start_time_ms', 'importance'],
                properties: {
                    label: { type: SchemaType.STRING },
                    category: { type: SchemaType.STRING, enum: ['positive', 'negative', 'neutral', 'objection', 'commitment', 'qualification'] },
                    start_time_ms: { type: SchemaType.INTEGER },
                    importance: { type: SchemaType.STRING, enum: ['high', 'medium', 'low'] }
                }
            }
        },
        objections: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                required: ['objection', 'response', 'effectiveness', 'resolved'],
                properties: {
                    objection: { type: SchemaType.STRING },
                    response: { type: SchemaType.STRING, nullable: true },
                    effectiveness: { type: SchemaType.STRING, enum: ['excellent', 'good', 'fair', 'poor'] },
                    resolved: { type: SchemaType.BOOLEAN }
                }
            }
        },
        action_items: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        call_outcome: {
            type: SchemaType.STRING,
            enum: ['interested', 'not_interested', 'follow_up_required']
        },
        call_authenticity: {
            type: SchemaType.STRING,
            enum: ['real', 'fake']
        },
        speakers_detected: { type: SchemaType.INTEGER },
        number_requests: {
            type: SchemaType.OBJECT,
            required: ['detected', 'instances'],
            properties: {
                detected: { type: SchemaType.BOOLEAN },
                instances: {
                    type: SchemaType.ARRAY,
                    items: {
                        type: SchemaType.OBJECT,
                        required: ['reason', 'time', 'transcript_excerpt', 'start_time_ms'],
                        properties: {
                            reason: { type: SchemaType.STRING },
                            time: { type: SchemaType.STRING },
                            transcript_excerpt: { type: SchemaType.STRING },
                            start_time_ms: { type: SchemaType.INTEGER }
                        }
                    }
                }
            }
        }
    }
};

function normalizeCallOutcome(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (VALID_OUTCOMES.has(raw)) return raw;
    if (raw === 'not interested') return 'not_interested';
    if (raw === 'follow up required') return 'follow_up_required';
    return '';
}

function normalizeCallAuthenticity(value) {
    const raw = String(value || '').trim().toLowerCase();
    return VALID_AUTHENTICITY.has(raw) ? raw : '';
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasMeaningfulText(value) {
    const text = String(value ?? '').trim();
    return Boolean(text) && text !== '""' && text !== '-' && text.toLowerCase() !== 'key moment';
}

function validateNumber(value, label, min, max, missing) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) {
        missing.push(label);
    }
}

export function validatePresalesAnalysis(analysis) {
    const callOutcome = normalizeCallOutcome(analysis?.call_outcome ?? analysis?.scores?.call_outcome);
    const callAuthenticity = normalizeCallAuthenticity(analysis?.call_authenticity ?? analysis?.scores?.call_authenticity);
    const missing = [];

    if (!hasMeaningfulText(analysis?.summary)) missing.push('summary');
    validateNumber(analysis?.overall_score, 'overall_score', 1, 10, missing);

    if (!isObject(analysis?.scores)) {
        missing.push('scores');
    } else {
        validateNumber(analysis.scores.politeness, 'scores.politeness', 0, 100, missing);
        validateNumber(analysis.scores.confidence, 'scores.confidence', 0, 100, missing);
        if (!VALID_INTEREST.has(String(analysis.scores.interest || '').toLowerCase())) missing.push('scores.interest');
        validateNumber(analysis.scores.speakers, 'scores.speakers', 1, 20, missing);
    }

    if (!isObject(analysis?.lead_qualification)) {
        missing.push('lead_qualification');
    } else {
        if (!VALID_LEAD_QUALITY.has(String(analysis.lead_qualification.lead_quality || '').toLowerCase())) {
            missing.push('lead_qualification.lead_quality');
        }
    }

    if (!Array.isArray(analysis?.key_moments) || analysis.key_moments.length === 0) {
        missing.push('key_moments');
    } else {
        analysis.key_moments.forEach((moment, index) => {
            if (!hasMeaningfulText(moment?.label)) missing.push(`key_moments[${index}].label`);
            validateNumber(moment?.start_time_ms, `key_moments[${index}].start_time_ms`, 0, 86400000, missing);
        });
    }

    if (!Array.isArray(analysis?.objections)) missing.push('objections');
    if (!Array.isArray(analysis?.action_items)) missing.push('action_items');
    if (!callOutcome) missing.push('call_outcome');
    if (!callAuthenticity) missing.push('call_authenticity');
    validateNumber(analysis?.speakers_detected, 'speakers_detected', 1, 20, missing);

    if (!isObject(analysis?.number_requests)) {
        missing.push('number_requests');
    } else {
        if (typeof analysis.number_requests.detected !== 'boolean') {
            missing.push('number_requests.detected');
        }
        if (!Array.isArray(analysis.number_requests.instances)) {
            missing.push('number_requests.instances');
        } else {
            analysis.number_requests.instances.forEach((inst, idx) => {
                if (!hasMeaningfulText(inst?.reason)) missing.push(`number_requests.instances[${idx}].reason`);
                if (!hasMeaningfulText(inst?.transcript_excerpt)) missing.push(`number_requests.instances[${idx}].transcript_excerpt`);
                validateNumber(inst?.start_time_ms, `number_requests.instances[${idx}].start_time_ms`, 0, 86400000, missing);
            });
        }
    }

    if (missing.length > 0) {
        throw new Error(`Gemini returned invalid presales JSON: missing/invalid ${missing.join(', ')}`);
    }

    return {
        ...analysis,
        call_outcome: callOutcome,
        call_authenticity: callAuthenticity
    };
}

async function generatePresalesAnalysis(audioUri, mimeType, prompt) {
    const response = await flashQueue.callVertex(() => model.generateContent({
        contents: [{
            role: 'user',
            parts: [
                { fileData: { mimeType, fileUri: audioUri } },
                { text: prompt }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
            responseSchema: presalesResponseSchema
        }
    }), 'presales-phase1');

    const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response from Vertex AI for presales analysis');

    return validatePresalesAnalysis(JSON.parse(text));
}

/**
 * Analyze a TeleCMI phone call recording using the presales-specific prompt.
 * Reads audio from GCS (same bucket as phone recordings).
 */
export async function analyzePresalesAudio(ticketId, ticketInfo = {}) {
    const { exists, extension } = await checkAudioExists(ticketId);
    if (!exists) {
        throw new Error(`Audio not found in GCS for ticket ${ticketId}`);
    }

    const audioUri  = getAudioUri(ticketId, extension);
    const mimeType  = mimeTypes[extension] || 'audio/mpeg';
    const prompt    = getPresalesAnalysisPrompt(ticketInfo);

    console.log(`📞 Presales Phase 1: Analyzing ${audioUri} (${mimeType})`);

    let analysis;
    try {
        analysis = await generatePresalesAnalysis(audioUri, mimeType, prompt);
    } catch (error) {
        if (is429(error)) throw error; // queue already retried with backoff — don't re-attempt
        console.warn(`⚠️ Presales Phase 1 validation failed for ${ticketId}; retrying. Reason: ${error.message}`);
        analysis = await generatePresalesAnalysis(audioUri, mimeType, `${prompt}

## MANDATORY FIELD REPAIR — YOUR PREVIOUS RESPONSE WAS INVALID
Validation failed with: ${error.message}

You MUST return a fully populated JSON object. Every field is required. Here is what you must fix:

FIELD COMPLETENESS:
- summary: must be a non-empty string (2 sentences max describing what happened)
- overall_score: must be a number between 1 and 10
- scores: must include politeness (0-100), confidence (0-100), interest (low/medium/high), speakers (integer >= 1).
  For fake/unanalysable calls use 0 for politeness and confidence, "low" for interest, 1 for speakers.
- lead_qualification: must include lead_quality (hot/warm/cold/unknown). For fake calls use "unknown".
- key_moments: must be a non-empty array with at least 1 entry. Each entry must have a
  non-empty label and a valid start_time_ms integer.
- objections: must be an array (empty [] is fine if no objections occurred)
- action_items: must be a non-empty array with at least 1 string
- speakers_detected: must be a positive integer (minimum 1)

MANDATORY TOP-LEVEL ENUM FIELDS (never null, never inside scores):
- call_outcome: exactly one of: interested, not_interested, follow_up_required
- call_authenticity: exactly one of: real, fake

- number_requests: must always be present. Minimum: { "detected": false, "instances": [] }. Never omit.

If this was a fake or silent call, follow the FAKE / INVALID CALL HANDLING section above
and return minimum valid values — do not return null for any required field.`);
    }

    console.log(`✅ Presales Phase 1 complete. Score: ${analysis.overall_score}/10 | Outcome: ${analysis.call_outcome} | Authenticity: ${analysis.call_authenticity}`);
    return analysis;
}

/**
 * Full analysis pipeline for a TeleCMI call ticket.
 * Mirrors triggerAnalysis() in tickets.js but:
 *   1. Uses presales-specific Vertex AI prompt
 *   2. Stores lead_qualification in analysisresults
 *   3. No Phase 2 comparison (each phone call is independent)
 */
export async function triggerPresalesAnalysis(ticketId, ticket) {
    try {
        await supabaseAdmin
            .from('tickets')
            .update({ status: 'processing', analysis_started_at: new Date().toISOString() })
            .eq('id', ticketId);

        let enrichedTicket = ticket;
        try {
            const { data: freshTicket, error: freshTicketError } = await supabaseAdmin
                .from('tickets')
                .select('*')
                .eq('id', ticketId)
                .maybeSingle();

            if (freshTicketError) {
                console.warn(`⚠️ Presales analysis: fresh ticket fetch skipped for ${ticketId}:`, freshTicketError.message);
            } else if (freshTicket) {
                enrichedTicket = { ...ticket, ...freshTicket };
            }
        } catch (freshTicketError) {
            console.warn(`⚠️ Presales analysis: fresh ticket fetch skipped for ${ticketId}:`, freshTicketError.message);
        }

        const ticketInfo = {
            caller_number:    enrichedTicket.client_id,
            caller_name:      enrichedTicket.clientname,
            agent_name:       enrichedTicket.selldo_agent_name || enrichedTicket.agent_name || null,
            agent_email:      enrichedTicket.selldo_agent_email || null,
            duration_seconds: enrichedTicket.durationseconds || null,
            lead_id:          enrichedTicket.telecmi_lead_id || null,
            team_name:        enrichedTicket.selldo_team_name || null
        };

        const analysis = await analyzePresalesAudio(ticketId, ticketInfo);

        // Normalize scores — matches the existing analysisresults schema
        const numberRequests = analysis.number_requests || { detected: false, instances: [] };
        const normalizedScores = {
            politeness: analysis.scores?.politeness ?? null,
            confidence: analysis.scores?.confidence ?? null,
            interest:   analysis.scores?.interest   ?? null,
            speakers:   analysis.scores?.speakers   ?? null,
            lead_qualification: analysis.lead_qualification || null,
            number_requests: numberRequests
        };

        // Upsert into analysisresults — same table, same columns as site visit analysis
        const { error: upsertError } = await supabaseAdmin
            .from('analysisresults')
            .upsert({
                ticketid:              ticketId,
                status:                'completed',
                rating:                analysis.overall_score ?? null,
                summary:               analysis.summary ?? null,
                keymoments:            (analysis.key_moments || []).map(m => ({
                    ...m,
                    sentiment: m.category || null,
                    time: typeof m.start_time_ms === 'number'
                        ? `${Math.floor(m.start_time_ms / 60000)}:${String(Math.floor((m.start_time_ms % 60000) / 1000)).padStart(2, '0')}`
                        : null
                })),
                improvementsuggestions: [],
                actionitems:           analysis.action_items || [],
                objections:            analysis.objections || [],
                scores:                normalizedScores,
                comparisonwithprevious: null,
                call_outcome:          analysis.call_outcome || null,
                call_authenticity:     analysis.call_authenticity || null
            }, { onConflict: 'ticketid' });

        if (upsertError) {
            throw new Error(`Failed to save presales analysis: ${upsertError.message}`);
        }

        // Update ticket status + denormalize outcome fields for fast analytics
        await supabaseAdmin
            .from('tickets')
            .update({
                status:               'analyzed',
                rating:               analysis.overall_score ?? null,
                analysiscompletedat:  new Date().toISOString(),
                istrainingcall:       (analysis.overall_score || 0) >= 8.0,
                call_outcome:         analysis.call_outcome || null,
                call_authenticity:    analysis.call_authenticity || null,
                asked_mobile_number:  numberRequests.instances.length > 0,
                mobile_number_count:  numberRequests.instances.length,
                mobile_number_reason: numberRequests.instances[0]?.reason ?? null
            })
            .eq('id', ticketId);

        // Delete the GCS file — it was only needed for Vertex AI analysis.
        // Audio playback is served via TeleCMI proxy using telecmi_filename.
        try {
            await buckets.uploads.file(`${ticketId}.mp3`).delete();
            console.log(`🗑️  GCS temp file deleted for ticket ${ticketId}`);
        } catch (deleteErr) {
            // Non-fatal: file may already be gone or never uploaded (edge case)
            console.warn(`⚠️  GCS delete warning for ${ticketId}:`, deleteErr.message);
        }

        console.log(`✅ Presales analysis complete for ticket ${ticketId}`);

    } catch (error) {
        console.error(`❌ Presales analysis failed for ticket ${ticketId}:`, error);
        try {
            await buckets.uploads.file(`${ticketId}.mp3`).delete();
            console.log(`🗑️  GCS temp file deleted after presales analysis failure for ticket ${ticketId}`);
        } catch (deleteErr) {
            console.warn(`⚠️  GCS delete warning after presales analysis failure for ${ticketId}:`, deleteErr.message);
        }
        await supabaseAdmin
            .from('tickets')
            .update({ status: 'analysis_failed', analysiserror: error.message })
            .eq('id', ticketId);
    }
}
