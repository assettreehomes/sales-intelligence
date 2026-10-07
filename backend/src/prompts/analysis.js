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
{"summary":"Agent struggled to convert sqft to local units, losing prospect trust mid-call.","overall_score":5.3,"scores":{"politeness":80,"confidence":60,"interest":"medium","speakers":2},"key_moments":[{"label":"Prospect wants land not villa or apartment","category":"objection","start_time_ms":26000},...],"objections":[{"objection":"Agent could not give land size in cents or grounds.","response":"Agent said she would check with a senior.","effectiveness":"poor","resolved":false},...],"action_items":["Send villa photos on WhatsApp and confirm land size."],"call_outcome":"follow_up_required","call_authenticity":"real","speakers_detected":2,"number_requests":{"detected":true,"instances":[{"reason":"Agent asked the prospect for their WhatsApp number.","time":"1:16","transcript_excerpt":"சார், உங்க வாட்ஸ்அப் நம்பர் சொல்லுங்க.","start_time_ms":76000}]}}

## NUMBER REQUEST DETECTION
Be extremely strict. A number request is the agent asking the prospect to say, type, spell, repeat, confirm or give the digits of a phone number: mobile, WhatsApp, personal, alternate, office, or anyone else's number (husband, wife, son, father, friend, the decision maker). Flag EVERY instance, direct and indirect, even softly worded ("tell me your WhatsApp number", "what is your mobile number?", "which number is on WhatsApp?", "best number to reach you", "any other number?", "send me your contact", "give me a missed call").
DO NOT FLAG: the agent asking the prospect to send a "Hi" (or any message) on WhatsApp so property details can be sent; the agent saying they will send details on WhatsApp; the agent asking only whether the number the prospect is calling from is on WhatsApp; the agent saying or repeating their OWN number, or telling the prospect which number to message or call; the agent asking the prospect to call back, save the agent's number or share their location. These are never number requests, even if the prospect's reply would let the agent see their number. Never infer a request from what the prospect's action would reveal. A missed call request IS flagged and a WhatsApp "Hi" is NOT: this is a business rule, do not reason from one to the other.
If the same call also has a real number ask, flag only that ask, not the WhatsApp "Hi". If one sentence has both, flag it and describe only the number ask.
reason: one plain sentence naming whose number and which type the agent asked for, e.g. "Agent asked for the prospect's WhatsApp number to send brochures." Never add "implying", "which helps get" or any other inference; if a flag only holds up with such an inference, leave it out. transcript_excerpt: the agent's own number-ask words, not the "Hi" line.
Not flagged: "மேடம், வாட்ஸ்அப்ல ஒரு Hi அனுப்புங்க, டீடெயில்ஸ் அனுப்புறேன்." ("Madam, send a Hi on WhatsApp, I'll send the details.") -> {"detected":false,"instances":[]}.
If none detected: {"detected":false,"instances":[]}.
Never write out a full phone number anywhere in the output. Replace every digit with X (e.g. XXXXXXXXXX).

## Rules
1. JSON only. No markdown fences.
2. key_moments: min 3 for calls >2min, min 1 otherwise. Never empty.
3. start_time_ms: realistic ms. Fake calls use 0.
4. objections=[]: if none raised.
5. call_outcome + call_authenticity: top-level, never null, never inside scores.
6. action_items: max 2.
7. number_requests: always present at top level.`;
}
