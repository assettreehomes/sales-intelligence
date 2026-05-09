import { VertexAI } from '@google-cloud/vertexai';
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
const modelName = process.env.VERTEX_MODEL    || 'gemini-2.5-pro';

const vertexAI = new VertexAI({ project: projectId, location });
const model    = vertexAI.getGenerativeModel({ model: modelName });

const mimeTypes = {
    wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4',
    ogg: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm', aac: 'audio/aac'
};

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

    const response = await model.generateContent({
        contents: [{
            role: 'user',
            parts: [
                { fileData: { mimeType, fileUri: audioUri } },
                { text: prompt }
            ]
        }],
        generationConfig: {
            temperature: 0.1,       // Lower temp for strict JSON adherence
            maxOutputTokens: 8192,
            responseMimeType: 'application/json'
        }
    });

    const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response from Vertex AI for presales analysis');

    const analysis = JSON.parse(text);
    console.log(`✅ Presales Phase 1 complete. Score: ${analysis.overall_score}/10 | Outcome: ${analysis.call_outcome}`);
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

        const ticketInfo = {
            caller_number:    ticket.client_id,
            caller_name:      ticket.clientname,
            agent_name:       ticket.agent_name || null,
            duration_seconds: ticket.durationseconds || null
        };

        const analysis = await analyzePresalesAudio(ticketId, ticketInfo);

        // Normalize scores — matches the existing analysisresults schema
        const normalizedScores = {
            ...(analysis.scores || {}),
            politeness: analysis.scores?.politeness ?? null,
            confidence: analysis.scores?.confidence ?? null,
            interest:   analysis.scores?.interest   ?? null,
            speakers:   analysis.scores?.speakers   ?? null
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
                    time: m.start_time_ms
                        ? `${Math.floor(m.start_time_ms / 60000)}:${String(Math.floor((m.start_time_ms % 60000) / 1000)).padStart(2, '0')}`
                        : null
                })),
                improvementsuggestions: analysis.recommendations || [],
                actionitems:           analysis.action_items || [],
                objections:            analysis.objections || [],
                scores:                normalizedScores,
                comparisonwithprevious: null,
                // Store presales-specific data in a dedicated column
                lead_qualification:    analysis.lead_qualification || null,
                call_outcome:          analysis.call_outcome || null,
                language_detected:     analysis.language_detected || null
            }, { onConflict: 'ticketid' });

        if (upsertError) {
            // lead_qualification/call_outcome/language_detected columns may not exist yet
            // Fall back to upsert without those columns
            console.warn('⚠️ Presales upsert with extra cols failed, retrying without:', upsertError.message);
            await supabaseAdmin
                .from('analysisresults')
                .upsert({
                    ticketid:               ticketId,
                    status:                 'completed',
                    rating:                 analysis.overall_score ?? null,
                    summary:                analysis.summary ?? null,
                    keymoments:             (analysis.key_moments || []).map(m => ({
                        ...m,
                        time: m.start_time_ms
                            ? `${Math.floor(m.start_time_ms / 60000)}:${String(Math.floor((m.start_time_ms % 60000) / 1000)).padStart(2, '0')}`
                            : null
                    })),
                    improvementsuggestions: analysis.recommendations || [],
                    actionitems:            analysis.action_items || [],
                    objections:             analysis.objections || [],
                    scores:                 normalizedScores,
                    comparisonwithprevious: null
                }, { onConflict: 'ticketid' });
        }

        // Update ticket status
        await supabaseAdmin
            .from('tickets')
            .update({
                status:              'analyzed',
                rating:              analysis.overall_score ?? null,
                analysiscompletedat: new Date().toISOString(),
                istrainingcall:      (analysis.overall_score || 0) >= 8.0  // Higher bar for phone calls
            })
            .eq('id', ticketId);

        console.log(`✅ Presales analysis complete for ticket ${ticketId}`);

    } catch (error) {
        console.error(`❌ Presales analysis failed for ticket ${ticketId}:`, error);
        await supabaseAdmin
            .from('tickets')
            .update({ status: 'analysis_failed', analysiserror: error.message })
            .eq('id', ticketId);
    }
}
