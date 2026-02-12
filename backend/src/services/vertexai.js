import { VertexAI } from '@google-cloud/vertexai';
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

// Map extensions to MIME types
const mimeTypes = {
  'wav': 'audio/wav',
  'mp3': 'audio/mpeg',
  'm4a': 'audio/mp4',
  'ogg': 'audio/ogg',
  'flac': 'audio/flac',
  'webm': 'audio/webm'
};

/**
 * Build the analysis prompt based on visit context
 */
function buildAnalysisPrompt(ticketInfo) {
  const { client_id, client_name, visit_number, previous_analysis } = ticketInfo;

  let prompt = `You are an expert sales call analyst for a real estate company. 
Analyze this audio recording and provide a comprehensive assessment.

## Context
- Client ID: ${client_id || 'Unknown'}
- Client Name: ${client_name || 'Not Provided'}
- Visit Number: ${visit_number || 1}
`;

  // Add previous visit context if available
  if (previous_analysis && visit_number > 1) {
    prompt += `
## Previous Visit Analysis (Visit #${visit_number - 1})
- Previous Rating: ${previous_analysis.rating || 'N/A'}/10
- Previous Summary: ${previous_analysis.summary || 'N/A'}
- Previous Improvement Suggestions: ${JSON.stringify(previous_analysis.improvement_suggestions || [])}
- Previous Objections: ${JSON.stringify(previous_analysis.objections || [])}

## Important: Compare Against Previous Visit
Since this is a repeat visit, you MUST:
1. Compare the current call against the previous visit
2. Note improvements or regressions in:
   - Objection handling
   - Rapport building
   - Sales techniques
   - Customer engagement
3. Provide a delta summary of what changed
`;
  }

  prompt += `
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
  ]`;

  // Add comparison section for repeat visits
  if (previous_analysis && visit_number > 1) {
    prompt += `,
  "comparison_with_previous": {
    "overall_narrative": "A 2-3 sentence summary comparing this visit to the previous one, highlighting overall trajectory (improved, declined, or same)",
    "score_changes": {
      "rapport_building": {"previous": ${previous_analysis.scores?.rapport_building || 0}, "current": <current score>, "change": <+/- number>},
      "needs_discovery": {"previous": ${previous_analysis.scores?.needs_discovery || 0}, "current": <current score>, "change": <+/- number>},
      "objection_handling": {"previous": ${previous_analysis.scores?.objection_handling || 0}, "current": <current score>, "change": <+/- number>},
      "closing_techniques": {"previous": ${previous_analysis.scores?.closing_techniques || 0}, "current": <current score>, "change": <+/- number>},
      "product_knowledge": {"previous": ${previous_analysis.scores?.product_knowledge || 0}, "current": <current score>, "change": <+/- number>},
      "professionalism": {"previous": ${previous_analysis.scores?.professionalism || 0}, "current": <current score>, "change": <+/- number>}
    },
    "improvements": ["Specific areas that improved since last visit, with concrete examples"],
    "regressions": ["Specific areas that got worse since last visit, with concrete examples"],
    "unchanged": ["Specific areas that remained consistent"],
    "delta_score": <positive number if better, negative if worse, 0 if same>,
    "key_differences": ["Major behavioral or tactical changes between visits"]
  }`;
  }

  prompt += `
}

IMPORTANT: Return ONLY valid JSON. No markdown, no explanations, just the JSON object.`;

  return prompt;
}

/**
 * Analyze audio using Vertex AI Gemini
 */
export async function analyzeAudio(ticketId, ticketInfo = {}) {
  // Check if audio exists
  const { exists, extension } = await checkAudioExists(ticketId);
  if (!exists) {
    throw new Error(`Audio not found for ticket ${ticketId}. Upload may have failed.`);
  }

  const audioUri = getAudioUri(ticketId, extension);
  const mimeType = mimeTypes[extension] || 'audio/mpeg';
  const prompt = buildAnalysisPrompt(ticketInfo);

  console.log(`🎯 Analyzing audio: ${audioUri} (${mimeType})`);
  if (ticketInfo.previous_analysis) {
    console.log(`📊 Comparing with previous visit (Score: ${ticketInfo.previous_analysis.rating})`);
  }

  try {
    const response = await model.generateContent({
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
        responseMimeType: 'application/json'
      }
    });

    const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response text from Vertex AI');
    }

    // Parse and validate JSON
    const analysis = JSON.parse(text);

    console.log(`✅ Analysis complete. Score: ${analysis.overall_score}/10`);

    return analysis;

  } catch (error) {
    console.error('❌ Vertex AI error:', error);
    throw new Error(`Failed to analyze audio: ${error.message}`);
  }
}

export default { analyzeAudio };
