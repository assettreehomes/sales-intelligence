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

  "call_outcome": "<interested|not_interested|follow_up_required>",

  "call_duration_seconds": <estimated call duration>,
  "speakers_detected": <number of distinct speakers>
}

IMPORTANT:
- Return ONLY valid JSON, no additional text
- All timestamps must be in milliseconds from the start of the audio
- Include at least 5-10 key moments if the call is long
- Be specific in transcript excerpts
- Scores should reflect genuine assessment, not just high numbers
- call_outcome must be one of exactly: interested, not_interested, follow_up_required
- call_outcome is mandatory, must be a top-level JSON key, must never be null, and must not be placed only inside scores
- The comparison_with_previous section should ONLY be included for repeat visits (visit_number > 1)`;
}

/**
 * System prompt for TeleCMI pre-sales PHONE CALL analysis.
 * Focused on inbound/outbound telephone calls — NOT site visits.
 * @param {object} context - { caller_number, caller_name, agent_name, duration_seconds }
 * @returns {string}
 */
export function getPresalesAnalysisPrompt(context = {}) {
  const { agent_name } = context;

  return `Pre-sales call analyst, real estate.${agent_name ? ` Agent: ${agent_name}.` : ''} Return one JSON object — no markdown, no text outside JSON.

## Fake/Silent Calls
Fake = hangup, silence, wrong number, agent monologue, no real prospect interaction.
Set: call_authenticity:"fake", call_outcome:"not_interested", overall_score:1, politeness:0, confidence:0, interest:"low", speakers:1. Populate all fields.

## Scores
overall_score 1-10: 9-10=excellent, 7-8=good, 4-6=average, 1-3=poor/fake. Reflect reality — bad call=2-4.
politeness 0-100: 100=very respectful, 70+=polite, 40-69=neutral, 0-39=rude/dismissive.
confidence 0-100: 100=authoritative, 70+=mostly confident, 40-69=uncertain, 0-39=clearly unsure.

## Example Output
{"summary":"Agent struggled to convert sqft to local units, losing prospect trust mid-call.","overall_score":5.3,"scores":{"politeness":80,"confidence":60,"interest":"medium","speakers":2},"key_moments":[{"label":"Prospect wants land not villa or apartment","category":"objection","start_time_ms":26000},...],"objections":[{"objection":"Agent could not give land size in cents or grounds.","response":"Agent said she would check with a senior.","effectiveness":"poor","resolved":false},...],"action_items":["Send villa photos on WhatsApp and confirm land size."],"call_outcome":"follow_up_required","call_authenticity":"real","speakers_detected":2,"number_requests":{"detected":true,"instances":[{"reason":"Agent asked prospect to send a Hi on WhatsApp so she could send property details.","time":"1:16","transcript_excerpt":"நான் வாட்ஸ்அப்ல உங்களுக்கு கிரீட்டிங் ஒன்னு அனுப்புறேன் சார். எனக்கு ஒரு ஹாய்னு மெசேஜ் பண்ணுங்க.","start_time_ms":76000}]}}

## Number Request Detection
Flag EVERY instance the agent asks for any contact number — mobile, WhatsApp, personal, alternate. Flag direct and indirect asks, even softly worded ("give me a missed call", "drop your contact", "any other number?").
If none detected: {"detected":false,"instances":[]}.

## Rules
1. JSON only. No markdown fences.
2. key_moments: min 3 for calls >2min, min 1 otherwise. Never empty.
3. start_time_ms: realistic ms. Fake calls use 0.
4. objections=[]: if none raised.
5. call_outcome + call_authenticity: top-level, never null, never inside scores.
6. action_items: max 2.
7. number_requests: always present at top level.`;
}
