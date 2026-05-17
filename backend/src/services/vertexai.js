import { SchemaType, VertexAI } from '@google-cloud/vertexai';
import { callVertex, is429 } from './vertexQueue.js';
import { checkAudioExists, getAudioUri } from '../config/gcs.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const projectId = process.env.VERTEX_PROJECT || process.env.GCS_PROJECT_ID || 'sales-audio-intelligence';
const location = process.env.VERTEX_LOCATION || 'us-central1';
const modelName = process.env.VERTEX_MODEL || 'gemini-2.5-pro';

const vertexAI = new VertexAI({ project: projectId, location });
const model = vertexAI.getGenerativeModel({ model: modelName });

const VALID_OUTCOMES = new Set(['interested', 'not_interested', 'follow_up_required']);

const analysisResponseSchema = {
  type: SchemaType.OBJECT,
  required: [
    'summary',
    'overall_score',
    'scores',
    'key_moments',
    'objections',
    'action_items',
    'recommendations',
    'call_outcome',
    'comparison_with_previous'
  ],
  properties: {
    summary: { type: SchemaType.STRING },
    overall_score: { type: SchemaType.NUMBER },
    scores: { type: SchemaType.OBJECT },
    key_moments: { type: SchemaType.ARRAY, items: { type: SchemaType.OBJECT } },
    objections: { type: SchemaType.ARRAY, items: { type: SchemaType.OBJECT } },
    action_items: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    recommendations: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    call_outcome: {
      type: SchemaType.STRING,
      enum: ['interested', 'not_interested', 'follow_up_required']
    },
    comparison_with_previous: { type: SchemaType.OBJECT, nullable: true },
    call_duration_seconds: { type: SchemaType.INTEGER },
    speakers_detected: { type: SchemaType.INTEGER }
  }
};

// Map extensions to MIME types
const mimeTypes = {
  'wav': 'audio/wav',
  'mp3': 'audio/mpeg',
  'm4a': 'audio/mp4',
  'ogg': 'audio/ogg',
  'flac': 'audio/flac',
  'webm': 'audio/webm'
};

function normalizeCallOutcome(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (VALID_OUTCOMES.has(raw)) return raw;
  if (raw === 'not interested') return 'not_interested';
  if (raw === 'follow up required') return 'follow_up_required';
  return '';
}

function validateAnalysis(analysis) {
  const callOutcome = normalizeCallOutcome(analysis?.call_outcome ?? analysis?.scores?.call_outcome);
  if (!callOutcome) {
    throw new Error('Gemini returned invalid analysis JSON: missing/invalid call_outcome');
  }

  return {
    ...analysis,
    call_outcome: callOutcome
  };
}

async function generateAnalysis(audioUri, mimeType, prompt) {
  const response = await callVertex(() => model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { fileData: { mimeType, fileUri: audioUri } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: analysisResponseSchema
    }
  }), 'site-visit-phase1');

  const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response text from Vertex AI');

  return validateAnalysis(JSON.parse(text));
}

/**
 * Phase 1: Build the core analysis prompt (NO comparison data)
 */
function buildAnalysisPrompt(ticketInfo) {
  const { client_id, client_name, visit_number } = ticketInfo;

  return `You are an expert sales call analyst for a real estate company. 
Analyze this audio recording and provide a comprehensive assessment.

## Context
- Client ID: ${client_id || 'Unknown'}
- Client Name: ${client_name || 'Not Provided'}
- Visit Number: ${visit_number || 1}

## Required Output (JSON format)
Return a valid JSON object with this exact structure:

{
  "summary": "2-3 sentence executive summary of the call",
  "overall_score": <number 1-10>,
  "scores": {
    "rapport_building": <1-10>,
    "needs_discovery": <1-10>,
    "objection_handling": <1-10>,
    "closing_techniques": <1-10>,
    "product_knowledge": <1-10>,
    "professionalism": <1-10>,
    "politeness": <number 0-100>,
    "confidence": <number 0-100>,
    "interest": "<low|medium|high>",
    "speakers": <number of distinct speakers detected>
  },
  "key_moments": [
    {
      "timestamp": "MM:SS",
      "description": "Brief description of the moment",
      "sentiment": "positive|negative|neutral",
      "importance": "high|medium|low"
    }
  ],
  "objections": [
    {
      "objection": "What the customer said",
      "response": "How the agent responded",
      "effectiveness": "excellent|good|fair|poor"
    }
  ],
  "action_items": [
    "Specific follow-up action required"
  ],
  "recommendations": [
    "Specific improvement suggestion for future calls"
  ],
  "call_outcome": "<interested|not_interested|follow_up_required>",
  "comparison_with_previous": null
}

IMPORTANT: Return ONLY valid JSON. No markdown, no explanations, just the JSON object.
Set call_outcome to interested only when the customer shows buying intent or agrees to a meaningful next step; not_interested when they clearly decline or disengage; follow_up_required when interest is uncertain but a callback, brochure, site visit, or next action is needed.
The comparison_with_previous field must always be null — comparison is handled separately.`;
}

/**
 * Phase 2: Build the comparison prompt (text-only, no audio)
 */
function buildComparisonPrompt(currentAnalysis, previousAnalysis, visitNumber) {
  return `You are an expert sales performance analyst. Compare two visit analyses for the same client and produce a detailed comparison.

## Current Visit (#${visitNumber}) Analysis
${JSON.stringify(currentAnalysis, null, 2)}

## Previous Visit (#${visitNumber - 1}) Analysis
${JSON.stringify(previousAnalysis, null, 2)}

## Required Output (JSON format)
Return a valid JSON object with this exact structure:

{
  "overall_narrative": "A 2-3 sentence summary comparing this visit to the previous one, highlighting overall trajectory",
  "score_changes": {
    "rapport_building": {"previous": <number>, "current": <number>, "change": <+/- number>},
    "needs_discovery": {"previous": <number>, "current": <number>, "change": <+/- number>},
    "objection_handling": {"previous": <number>, "current": <number>, "change": <+/- number>},
    "closing_techniques": {"previous": <number>, "current": <number>, "change": <+/- number>},
    "product_knowledge": {"previous": <number>, "current": <number>, "change": <+/- number>},
    "professionalism": {"previous": <number>, "current": <number>, "change": <+/- number>}
  },
  "improvements": ["Specific areas that improved since last visit, with concrete examples"],
  "regressions": ["Specific areas that got worse since last visit, with concrete examples"],
  "unchanged": ["Specific areas that remained consistent"],
  "delta_score": <positive number if better, negative if worse, 0 if same>,
  "key_differences": ["Major behavioral or tactical changes between visits"]
}

IMPORTANT: Return ONLY valid JSON. No markdown, no explanations, just the JSON object.`;
}

/**
 * Phase 1: Analyze audio using Vertex AI Gemini (core analysis only)
 */
export async function analyzeAudio(ticketId, ticketInfo = {}) {
  const { exists, extension } = await checkAudioExists(ticketId);
  if (!exists) {
    throw new Error(`Audio not found for ticket ${ticketId}. Upload may have failed.`);
  }

  const audioUri = getAudioUri(ticketId, extension);
  const mimeType = mimeTypes[extension] || 'audio/mpeg';
  const prompt = buildAnalysisPrompt(ticketInfo);

  console.log(`🎯 Phase 1: Analyzing audio: ${audioUri} (${mimeType})`);

  try {
    let analysis;
    try {
      analysis = await generateAnalysis(audioUri, mimeType, prompt);
    } catch (validationError) {
      if (is429(validationError)) throw validationError; // queue already retried with backoff — don't re-attempt
      console.warn(`⚠️ Phase 1 validation failed for ${ticketId}; retrying with mandatory-field repair:`, validationError.message);
      analysis = await generateAnalysis(audioUri, mimeType, `${prompt}

## MANDATORY FIELD REPAIR
Your previous response was invalid because call_outcome was missing or invalid.
You MUST return call_outcome as a top-level JSON key with exactly one of these values:
- interested
- not_interested
- follow_up_required
Never return null, an empty string, an alternate label, or omit this field.`);
    }

    console.log(`✅ Phase 1 complete. Score: ${analysis.overall_score}/10 | Outcome: ${analysis.call_outcome}`);
    return analysis;

  } catch (error) {
    console.error('❌ Phase 1 Vertex AI error:', error);
    throw new Error(`Failed to analyze audio: ${error.message}`);
  }
}

/**
 * Phase 2: Run comparison analysis (text-only, no audio processing)
 */
export async function runComparisonAnalysis(currentAnalysis, previousAnalysis, visitNumber) {
  const prompt = buildComparisonPrompt(currentAnalysis, previousAnalysis, visitNumber);

  console.log(`📊 Phase 2: Running comparison (Visit #${visitNumber} vs Visit #${visitNumber - 1})`);

  try {
    const response = await callVertex(() => model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json'
      }
    }), 'site-visit-phase2');

    const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response from Vertex AI for comparison');

    const comparison = JSON.parse(text);
    console.log(`✅ Phase 2 complete. Delta score: ${comparison.delta_score}`);
    return comparison;

  } catch (error) {
    console.error('❌ Phase 2 comparison error:', error);
    return null;
  }
}

export default { analyzeAudio, runComparisonAnalysis };
