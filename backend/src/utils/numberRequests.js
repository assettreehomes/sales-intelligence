// The presales prompt tells the model not to flag "send a Hi on WhatsApp so I can share
// details" as a number request, but older prompt versions taught it the opposite and the
// model still rationalises it ("..., implying the prospect's number would be shared").
// This drops an instance only when its reason describes a greeting ask and, once the model's
// justification is removed, mentions no number other than the agent's own. Anything unclear
// is kept: a false flag is cheaper than hiding a real number request.

const GREETING_WORD = /\b(hi+|hai|hello|greeting|message|msg|text|ping)\b/i;
const HI_WORD = /\b(hi+|hai|hello)\b/i;
const WHATSAPP = /whats\s?app/i;

// The model's justification for the flag: "..., implying ...", "..., which helps get ...",
// "so she could save the prospect's number". Removed up to the end of the sentence, but never
// past a later "and asked ...", "then requested ...", "followed by asking ..." so a second, real ask survives.
const ASK_VERB = String.raw`(?:ask(?:ed|ing)|request(?:ed|ing)|told|collected|took|noted|sought|enquired|inquired|demanded|insisted|pressed)`;
const NEXT_ASK = String.raw`\b(?:and|but|then|also|later|before|after|followed by)\b[^.;]{0,20}\b${ASK_VERB}\b`;
const RATIONALE = new RegExp(
    String.raw`(?:,\s*which\b|\b(?:implying|implies|indicating|thereby|effectively|implicitly|suggesting|meaning|so that|in order to|mentioning that)\b|\bso\s+(?:she|he|they|the agent|agent|we|i)\s+(?:could|can|would|will|may|might)\b)` +
    String.raw`[^.;]*?(?=${NEXT_ASK}|[.;]|$)`,
    'gi'
);

const NUMBER_WORD = String.raw`(?:number|no\.|digits)`;
// A number that is the agent's own, or where the Hi is sent to, is not the prospect's number.
// "other/alternate/backup/..." always marks the prospect's second number, so never safe.
const NOT_SECOND = String.raw`(?!(?:[\w']+\s+){0,3}?(?:other|another|alternate|alternative|backup|second|different|personal|extra)\b)`;
// "the number his wife uses", "the number of her son" is someone else's number, never safe.
const NOT_THIRD_PARTY = String.raw`(?!\s+(?:of|his|her|their|your|my)\b|\s+(?:(?:the|a)\s+)?(?:wife|husband|son|daughter|father|mother|friend|brother|sister|family|relative)\b)`;
const SAFE_NUMBER = [
    // "to/on/from the same number", "to her WhatsApp number", "on the agent's own number", "to this number"
    new RegExp(
        String.raw`\b(?:to|on|from|onto|via|at)\s+${NOT_SECOND}` +
        String.raw`(?:(?:the\s+)?(?:same|this|that|her|his|my|our|their|its|whichever|agent's)\s+|the\s+)?(?:own\s+|same\s+)?` +
        String.raw`(?:(?:official|office|company|calling|current|displayed|registered|whats\s?app|mobile|phone|contact)\s+){0,2}` +
        String.raw`${NUMBER_WORD}${NOT_THIRD_PARTY}`,
        'gi'
    ),
    // "send a Hi to a provided/different WhatsApp number" — the agent's other line
    new RegExp(String.raw`\bto\s+(?:a|an|another)\s+(?:(?:provided|given|different|separate|new|official|office|company)\s+)?(?:whats\s?app\s+)?${NUMBER_WORD}${NOT_THIRD_PARTY}`, 'gi'),
    // "save/note down her number" — saving a number is not asking for it
    new RegExp(String.raw`\b(?:save|saving|note down|noting down)\s+(?:her|his|my|their|the agent's|agent's|the prospect's|the customer's|the)?\s*(?:own\s+)?(?:whats\s?app\s+|mobile\s+|phone\s+|contact\s+)?${NUMBER_WORD}`, 'gi'),
    // "the agent's number", "the calling number", "the number she called from", "the number displayed"
    new RegExp(String.raw`\bagent's\s+(?:own\s+)?(?:whats\s?app\s+|mobile\s+|phone\s+)?${NUMBER_WORD}`, 'gi'),
    new RegExp(String.raw`\b(?:calling|same)\s+${NUMBER_WORD}`, 'gi'),
    new RegExp(String.raw`\b${NUMBER_WORD}\s+(?:(?:she|he|they|the agent)\s+(?:was\s+|is\s+)?(?:calling|called|rang)\s+from|displayed)`, 'gi'),
    // "she would share her WhatsApp number" — the agent offering her own number
    new RegExp(String.raw`\b(?:would|will)\s+(?:share|send|give|sms|text)\s+(?:her|his|my)\s+(?:own\s+)?(?:whats\s?app\s+|mobile\s+|phone\s+)?${NUMBER_WORD}`, 'gi'),
    // Yes/no about the line already in use: "confirm the number is on WhatsApp", "whether this number is on WhatsApp"
    new RegExp(String.raw`\b(?:confirm(?:ing)?|check(?:ing)?|verify(?:ing)?|whether|if)\s+(?:that\s+|whether\s+|if\s+)?(?:the|this|that|her|his|their)\s+(?:same\s+|current\s+)?${NUMBER_WORD}(?=\s+(?:is|was|they|he|she|works|has)\b)`, 'gi'),
];
const ANY_NUMBER = new RegExp(String.raw`\b${NUMBER_WORD}`, 'i');
// A Hi from (or a number of) a son, wife, friend... gets someone else's number: always keep
const THIRD_PARTY = /\b(?:son|daughter|wife|husband|spouse|father|mother|brother|sister|friend|relative|colleague|family member)(?:'s)?\b/i;
// Asks that capture the number without saying "number": a missed call, "send your contact", "give another one"
const INDIRECT_ASK = /missed\s*call|\b(?:share|send|give|drop|forward|tell)\s+(?:me\s+)?(?:your|his|her|their|the prospect's|the customer's)\s+contact\b|\b(?:another|other|alternate|alternative|backup|different|second)\s+(?:one|line|contact)\b/i;

export function isWhatsAppGreetingOnly(instance) {
    const reason = String(instance?.reason || '');
    const isGreetingAsk = HI_WORD.test(reason) || (WHATSAPP.test(reason) && GREETING_WORD.test(reason));
    if (!isGreetingAsk || THIRD_PARTY.test(reason)) return false;
    let ask = reason.replace(RATIONALE, ' ');
    for (const re of SAFE_NUMBER) ask = ask.replace(re, ' ');
    return !ANY_NUMBER.test(ask) && !INDIRECT_ASK.test(ask);
}

export function dropWhatsAppGreetings(numberRequests) {
    const instances = Array.isArray(numberRequests?.instances) ? numberRequests.instances : [];
    const kept = instances.filter(inst => !isWhatsAppGreetingOnly(inst));
    return { ...numberRequests, detected: kept.length > 0, instances: kept };
}
