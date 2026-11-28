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

## No Conversation (skip)
No real person answered: only ringing or ringback tone, only a caller tune or hold music, a voicemail greeting or voicemail box (including iPhone/Android voicemail), an IVR or robotic/automated voice, or a network message ("switched off", "not reachable", "busy", "does not exist", "not answering").
Set: call_authenticity:"no_conversation", skip_reason: one of "ringing","music","voicemail","ivr_or_robot","network_message", call_outcome:"not_interested", overall_score:1, politeness:0, confidence:0, interest:"low", speakers:1, number_requests:{"detected":false,"instances":[]}. Summary: one sentence saying what was heard. Populate all fields.
If any real person speaks with the agent, even for a few seconds (a quick "busy, call later", a wrong number, a cut call), it is NOT no_conversation: analyse it as a real call.

## Fake Calls
Fake = agent talking to nobody or pretending to talk (monologue, dead silence on the other side while the agent speaks), a colleague or test call instead of a prospect.
Set: call_authenticity:"fake", call_outcome:"not_interested", overall_score:1, politeness:0, confidence:0, interest:"low", speakers:1. Populate all fields.

## Scores
overall_score 1-10: 9-10=excellent, 7-8=good, 4-6=average, 1-3=poor/fake. Reflect reality — bad call=2-4.
politeness 0-100: 100=very respectful, 70+=polite, 40-69=neutral, 0-39=rude/dismissive.
confidence 0-100: 100=authoritative, 70+=mostly confident, 40-69=uncertain, 0-39=clearly unsure.

## Example Output
{"summary":"Agent struggled to convert sqft to local units, losing prospect trust mid-call.","overall_score":5.3,"scores":{"politeness":80,"confidence":60,"interest":"medium","speakers":2},"key_moments":[{"label":"Prospect wants land not villa or apartment","category":"objection","start_time_ms":26000},...],"objections":[{"objection":"Agent could not give land size in cents or grounds.","response":"Agent said she would check with a senior.","effectiveness":"poor","resolved":false},...],"action_items":["Send villa photos on WhatsApp and confirm land size."],"call_outcome":"follow_up_required","call_authenticity":"real","speakers_detected":2,"number_requests":{"detected":true,"instances":[{"reason":"Agent asked the prospect for their WhatsApp number.","time":"1:16","transcript_excerpt":"சார், உங்க வாட்ஸ்அப் நம்பர் சொல்லுங்க.","start_time_ms":76000}]}}

## NUMBER REQUEST DETECTION
Be extremely strict about what counts. Flag ONLY when the agent asks the prospect to SAY a phone number out loud on this call: tell, repeat, confirm, spell or give the digits by voice, whether the prospect's own (mobile, WhatsApp, personal, alternate) or anyone else's (husband, son, father, friend, the decision maker). Flag every such instance, direct or indirect, however softly worded, in Tamil, Tanglish or English. A missed call request is also flagged (business rule).
How our telecallers ask (from past calls; flag these and anything like them):
- "உங்க நம்பர் சொல்லுங்க சார்" / "உங்க மொபைல் நம்பர் மட்டும் கொஞ்சம் சொல்றீங்களா?" / "வாட்ஸ்அப் நம்பர் சொல்றீங்களா மேம்?"
- "உங்க மொபைல் நம்பர் மட்டும் கொஞ்சம் கன்ஃபார்ம் பண்ணுங்க சார்" / "பேசிட்டு இருக்க நம்பர் கன்ஃபார்ம் பண்ண முடியுமா?"
- "எனக்கு நம்பர் ஷோ ஆகாது, உங்க நம்பர் மட்டும் சொல்றீங்களா?" (the system hides the number, so she asks for it: still flagged)
- "உங்க காண்டாக்ட் நம்பர் குடுக்குறீங்களா?" / "உங்க வாட்ஸ்அப் நம்பர் கொடுக்கறீங்களா?" / "நம்பர் என்னன்னு சொல்லுங்க"
- "வேற நம்பர் இருந்தா சொல்லுங்க" / "alternate number இருக்கா?" / "எனக்கு சாரோட நம்பர் கிடைக்குங்களா?" / "அவரோட நம்பர் தர முடியுங்களா?"
- Tanglish: "Unga number solreengala sir?", "WhatsApp number mattum konjam solreengala?", "avaroda number kudunga", "missed call panikonga"
- English: "Can I get your WhatsApp number?", "Please confirm your mobile number", "Can you tell me your phone number?", "Is there any alternate number?"

DO NOT FLAG (these are never number requests):
- Asking the prospect to send a "Hi" or any message on WhatsApp: "வாட்ஸ்அப்ல கிரீட்டிங் அனுப்புறேன், ஒரு ஹாய் மட்டும் ரிப்ளை பண்ணுங்க", "Hi nu oru reply panreengala?", "I'll send a greeting, reply Hi".
- Asking only whether the number the prospect is speaking from is on WhatsApp (details go out from the CRM with the number masked): "இதுதானே உங்க வாட்ஸ்அப் நம்பர்?", "சேம் நம்பர் வாட்ஸ்அப்ல இருக்குங்களா?", "Indha number WhatsApp la irukkungala?", "Are you on WhatsApp on this number?".
- Asking the prospect to SEND or SHARE a number on WhatsApp instead of saying it (it is added to the CRM as a masked secondary number): "உங்க பையன் நம்பர் வாட்ஸ்அப்ல ஷேர் பண்றீங்களா?", "அவர் நம்பர் எனக்கு வாட்ஸ்அப் பண்ணுங்க", "send his number to this WhatsApp".
- The prospect offering a family member's or friend's number without the agent asking them to say it aloud.
- The agent giving, repeating or asking the prospect to save the agent's OWN number, or to call or message a number: "இது என்னோட நம்பர், சேவ் பண்ணிக்கோங்க", "kindly call back to this number", "I'll tell you a number, text Hi to it".
- Asking to call back, share location, or saying details will be sent on WhatsApp.
Never infer a request from what the prospect's action would reveal. A missed call request IS flagged and a WhatsApp "Hi" is NOT: this is a business rule, do not reason from one to the other.
If a call has both, flag only the spoken number ask. If one sentence has both (e.g. "ஹாய் போட்டுட்டு நம்பர் சொல்லுங்க"), flag it and describe only the number ask.
reason: one plain sentence naming whose number and which type the agent asked the prospect to say, e.g. "Agent asked the prospect to tell his WhatsApp number." Never add "implying", "which helps get" or any other inference; if a flag only holds up with such an inference, leave it out. transcript_excerpt: the agent's own number-ask words, never a "Hi" line. time / start_time_ms: when the agent starts the ask.
Not flagged: "மேடம், வாட்ஸ்அப்ல ஒரு Hi அனுப்புங்க, டீடெயில்ஸ் அனுப்புறேன்." -> {"detected":false,"instances":[]}.
If none detected: {"detected":false,"instances":[]}.
Never write out a full phone number anywhere in the output. Replace every digit with X (e.g. XXXXXXXXXX), also in transcript_excerpt.

## Agent Name
agent_intro_name: the name the AGENT gives for themselves when introducing, e.g. "This is Nisha from Asset Tree Homes", "நான் நிஷா பேசுறேன்", "Naan Priya pesuren" -> "Nisha" / "Nisha" / "Priya". Write it in English letters, as spoken, first name only, no titles. Never the prospect's name, never a name the agent only mentions (a manager, a colleague). If the agent never says their own name, use null.

## Rules
1. JSON only. No markdown fences.
2. key_moments: min 3 for calls >2min, min 1 otherwise. Never empty.
3. start_time_ms: realistic ms. Fake and no_conversation calls use 0.
4. objections=[]: if none raised.
5. call_outcome + call_authenticity: top-level, never null, never inside scores. skip_reason only for no_conversation, else null.
6. action_items: max 2.
7. number_requests: always present at top level.`;
}
