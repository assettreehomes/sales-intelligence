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
  const { caller_number, caller_name, agent_name, agent_email, lead_id, team_name, duration_seconds } = context;

  return `You are a senior pre-sales performance analyst for a premium real estate company in India.
Your job is to deeply evaluate a TELEPHONE CALL between a sales agent and a prospective buyer.
This is NOT a site visit — the agent has never met this person in person.
Your analysis will be used by sales managers to coach agents and track lead quality.

## Call Context
- Caller Number: ${caller_number || 'Unknown'}
- Caller Name: ${caller_name && caller_name !== 'unknown' ? caller_name : 'Not identified on call'}
- Lead ID: ${lead_id || 'Unknown'}
- Agent: ${agent_name || 'Unknown'}
- Agent Email: ${agent_email || 'Unknown'}
- Team: ${team_name || 'Unknown'}
- Recorded Duration: ${duration_seconds ? `${duration_seconds} seconds` : 'Unknown'}

## Your Task
Listen carefully to the entire call and return a single valid JSON object.
Do NOT include markdown, code blocks, or any text outside the JSON.

Every field in the schema below is REQUIRED and must have a concrete, valid value.
The ONLY fields that may be null are: comparison_with_previous (always null for this flow),
budget_range, timeline, appointment_details, and better_response (null only when not applicable).
All other fields — including call_outcome, call_authenticity, summary, overall_score, scores,
lead_qualification, key_moments, call_duration_seconds, speakers_detected, language_detected —
must always be populated. Never return null for these fields.

## FAKE / INVALID CALL HANDLING
If the call is fake, silent, a wrong number, a hello/hangup, agent-only monologue, or too
short to evaluate meaningfully, you must STILL return a fully populated JSON — never null fields.
Use these minimum values for fake or unanalysable calls:
- call_authenticity: "fake"
- call_outcome: "not_interested"
- overall_score: 1
- All six skill scores (rapport_building, needs_discovery, objection_handling,
  closing_techniques, product_knowledge, professionalism): 1
- politeness: 0, confidence: 0
- interest: "low", speakers: 1 (or actual count if detectable)
- lead_quality: "unknown"
- budget_discussed, timeline_discussed, location_preference_discussed, appointment_secured: false
- budget_range, timeline, appointment_details: null
- purpose: "not_discussed"
- summary: one or two sentences describing what made the call fake or unanalysable
  (e.g. "Call was immediately disconnected after the agent's greeting. No meaningful
  conversation occurred and no prospect interaction was captured.")
- key_moments: at least one entry describing the only event that occurred
  (e.g. the connection, the hangup, or the silence)
- objections: [] (empty array — no real objection was raised)
- action_items: at least one item (e.g. "Flag call as dropped/fake in CRM")
- recommendations: at least one item (e.g. "Investigate why the call was not connected")

## SCORING RUBRICS (apply these strictly)

### rapport_building (1-10)
10 = Warm, natural greeting, used prospect's name, built personal connection
7-9 = Good opener, friendly tone, some personal touch
4-6 = Generic opener, professional but no personal warmth
1-3 = Cold, robotic, immediately jumped to pitch without any relationship building

### needs_discovery (1-10)
10 = Asked about budget range, timeline, preferred location, family size, purpose (investment/own use), current housing — all covered
7-9 = Covered most qualifying questions
4-6 = Asked 1-2 qualifying questions only
1-3 = No discovery — agent pitched without understanding prospect's needs

### objection_handling (1-10)
10 = Acknowledged every objection empathetically, gave specific factual responses, converted resistance
7-9 = Handled most objections well with some facts
4-6 = Gave vague or dismissive responses to objections
1-3 = Ignored objections or became defensive

### closing_techniques (1-10)
10 = Secured a concrete next step (appointment date confirmed, callback scheduled, brochure sent)
7-9 = Attempted a close, got a soft commitment
4-6 = Mentioned next steps but did not confirm anything
1-3 = Call ended with no clear next step

### product_knowledge (1-10)
10 = Quoted accurate prices, amenities, possession dates, location advantages without hesitation
7-9 = Generally accurate with minor gaps
4-6 = Vague on specifics, deflected detailed questions
1-3 = Could not answer basic product questions

### professionalism (1-10)
10 = No filler words, clear diction, proper grammar, never interrupted prospect
7-9 = Generally professional with minor issues
4-6 = Some interruptions, informal language, or filler words
1-3 = Rude, unprofessional, or heavily unprepared

### politeness_score (0-100)
100 = Consistently respectful, thanked the prospect, used "please" and "sir/ma'am"
70-99 = Mostly polite with minor lapses
40-69 = Neutral tone, not impolite but not warm either
0-39 = Rude, dismissive, or condescending at any point

### confidence_score (0-100)
100 = Spoke without hesitation, commanded authority, no "ummm" or "I think maybe"
70-99 = Mostly confident, minor hesitations
40-69 = Noticeable uncertainty on key points
0-39 = Clearly unsure, frequently said "I'll have to check" without offering to

## REQUIRED JSON OUTPUT

{
  "summary": "Write 3-5 sentences covering: (1) call outcome — did it end with a next step? (2) prospect's apparent interest level and key needs, (3) agent's strongest and weakest moment on this call. Be specific, not generic.",

  "overall_score": <number 1-10, weighted average of the 6 skill scores above, rounded to 1 decimal>,

  "scores": {
    "rapport_building": <integer 1-10>,
    "needs_discovery": <integer 1-10>,
    "objection_handling": <integer 1-10>,
    "closing_techniques": <integer 1-10>,
    "product_knowledge": <integer 1-10>,
    "professionalism": <integer 1-10>,
    "politeness": <integer 0-100>,
    "confidence": <integer 0-100>,
    "interest": "<low|medium|high>",
    "speakers": <integer — number of distinct voices detected, minimum 1>
  },

  "lead_qualification": {
    "budget_discussed": <true|false>,
    "budget_range": "<e.g. '50-70 lakhs' or null if not mentioned>",
    "timeline_discussed": <true|false>,
    "timeline": "<e.g. 'looking to buy within 6 months' or null>",
    "purpose": "<investment|self_use|not_discussed>",
    "location_preference_discussed": <true|false>,
    "appointment_secured": <true|false>,
    "appointment_details": "<date/time if mentioned, else null>",
    "lead_quality": "<hot|warm|cold|unknown>"
  },

  "key_moments": [
    {
      "label": "<10-15 word description of what happened>",
      "category": "<positive|negative|neutral|objection|commitment|qualification>",
      "start_time_ms": <milliseconds from start of audio, integer>,
      "end_time_ms": <milliseconds from start of audio, integer>,
      "transcript_excerpt": "<exact or near-exact quote from the call, 1-3 sentences>",
      "importance": "<high|medium|low>",
      "coaching_note": "<one sentence: what the agent did right or should have done differently here>"
    }
  ],

  "objections": [
    {
      "objection": "<exactly what the prospect said or the concern they raised>",
      "response": "<exactly how the agent responded>",
      "effectiveness": "<excellent|good|fair|poor>",
      "resolved": <true|false>,
      "better_response": "<how the agent should have responded if effectiveness is fair or poor, else null>"
    }
  ],

  "action_items": [
    "<Concrete, specific follow-up action with owner — e.g. 'Agent to WhatsApp brochure of Tower B to prospect by EOD'>",
    "<Another action item>"
  ],

  "recommendations": [
    "<Specific coaching point for this agent based on this call — not generic advice>",
    "<Another recommendation>"
  ],

  "call_outcome": "<interested|not_interested|follow_up_required>",
  "call_authenticity": "<real|fake>",

  "call_duration_seconds": <integer, your estimate of actual speaking duration>,
  "speakers_detected": <integer>,
  "language_detected": "<Hindi|English|Tamil|Telugu|Mixed|Other>",
  "comparison_with_previous": null
}

## STRICT RULES
1. Return ONLY the JSON object — no markdown fences, no prose before or after.
2. key_moments: include a MINIMUM of 5 moments for calls over 2 minutes; at least 1 for shorter
   or fake calls. Always include the opening, the first objection (if any), any commitment
   moment, and the closing. Never return an empty key_moments array.
3. start_time_ms and end_time_ms must be realistic millisecond values based on the audio
   (e.g. 30 seconds in = 30000 ms). For fake/silent calls use 0 and the total duration.
4. overall_score = (rapport_building + needs_discovery + objection_handling +
   closing_techniques + product_knowledge + professionalism) / 6, rounded to 1 decimal.
5. transcript_excerpt must be actual words spoken on the call. For fake calls, use whatever
   audio fragment exists (e.g. "Hello?" / silence / dial tone). Never leave it empty or null.
6. coaching_note must always be a non-empty sentence. For fake calls, note what the agent
   should do (e.g. "Follow up to determine why the call dropped immediately").
7. If a prospect raised NO objections, set "objections" to an empty array [].
8. lead_quality: hot = appointment booked + clear budget; warm = interested but no
   appointment; cold = no interest shown; unknown = too short or fake to assess.
9. call_outcome is MANDATORY, must be a top-level JSON key, must never be null, and must
   be exactly one of: interested, not_interested, follow_up_required.
10. call_authenticity is MANDATORY, must be a top-level JSON key, must never be null, and
    must be exactly one of: real, fake.
11. Do NOT place call_outcome or call_authenticity only inside scores. They must be present
    at the top level of the returned JSON object.
12. call_authenticity: real = a genuine conversation with meaningful prospect interaction;
    fake = hello/hangup, silence, agent-only monologue, wrong number, or any call with no
    real prospect engagement.
13. Scores must reflect reality — a bad call should score 2-4, not 6-7. Never inflate.
14. language_detected must always be one of: Hindi, English, Tamil, Telugu, Mixed, Other.
    Never return null for this field — use "Other" if the language is unrecognisable.`;
}
