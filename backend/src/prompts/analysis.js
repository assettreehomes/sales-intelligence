/**
 * System prompt for Vertex AI Gemini to analyze sales conversations
 * @param {object} context - Additional context about the call
 * @returns {string} The analysis prompt
 */
export function getAnalysisPrompt(context = {}) {
  const { customer_name, property_name } = context;

  return `You are an expert sales conversation analyst. Analyze this real estate sales call audio and provide a comprehensive analysis.

${customer_name ? `Customer: ${customer_name}` : ''}
${property_name ? `Property: ${property_name}` : ''}

Analyze the conversation and return ONLY a valid JSON object (no markdown, no code blocks) with the following structure:

{
  "summary": "A 2-3 paragraph executive summary of the sales call, including key discussion points, customer interests, and outcome",
  
  "politeness_score": <number 0-100>,
  "politeness_notes": "Brief explanation of politeness assessment",
  
  "confidence_score": <number 0-100>,
  "confidence_notes": "Brief explanation of salesperson confidence assessment",
  
  "customer_interest_level": "<low|medium|high>",
  "customer_interest_notes": "Assessment of customer's buying interest",
  
  "objections": [
    {
      "objection": "The specific objection raised",
      "response": "How the salesperson addressed it",
      "resolved": <true|false>
    }
  ],
  
  "key_moments": [
    {
      "label": "Brief description of the moment",
      "category": "<positive|negative|neutral|objection|commitment>",
      "start_time_ms": <timestamp in milliseconds>,
      "end_time_ms": <timestamp in milliseconds>,
      "transcript_excerpt": "Relevant quote from the conversation",
      "importance": "<high|medium|low>"
    }
  ],
  
  "action_items": [
    "Follow-up actions identified from the call"
  ],
  
  "recommendations": [
    "Suggestions for improving future calls"
  ],

  "comparison_with_previous": {
    "overall_narrative": "For repeat visits: A 2-3 sentence summary comparing this visit to the previous one",
    "score_changes": {
      "rapport_building": {"previous": 7, "current": 8, "change": +1},
      "needs_discovery": {"previous": 5, "current": 7, "change": +2},
      "objection_handling": {"previous": 6, "current": 6, "change": 0},
      "closing_techniques": {"previous": 4, "current": 5, "change": +1},
      "product_knowledge": {"previous": 8, "current": 9, "change": +1},
      "professionalism": {"previous": 9, "current": 9, "change": 0}
    },
    "improvements": ["Specific areas that improved since last visit, with concrete examples"],
    "regressions": ["Specific areas that got worse since last visit, with concrete examples"],
    "unchanged": ["Specific areas that remained consistent"],
    "delta_score": 0.5,
    "key_differences": ["Major behavioral or tactical changes between visits"]
  },

  "call_duration_seconds": <estimated call duration>,
  "speakers_detected": <number of distinct speakers>
}

IMPORTANT:
- Return ONLY valid JSON, no additional text
- All timestamps must be in milliseconds from the start of the audio
- Include at least 5-10 key moments if the call is long
- Be specific in transcript excerpts
- Scores should reflect genuine assessment, not just high numbers
- The comparison_with_previous section should ONLY be included for repeat visits (visit_number > 1)`;
}
