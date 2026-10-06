// The presales prompt tells the model not to flag "send a Hi on WhatsApp so I can share
// details" as a number request, but older prompt versions taught it the opposite and the
// model still rationalises it ("..., implying the prospect's number would be shared").
// This drops those instances unless the main clause says the agent directly asked for a number.

const WHATSAPP_GREETING = /whats\s?app|\breply\b[^.]{0,20}\bhi\b|\bhi\b[^.]{0,20}\bmessage\b/i;
const GREETING_WORD = /\b(hi+|hai|hello|greeting|message|msg|text|ping)\b/i;
// The model's justification usually follows the actual ask: "..., implying ...", "which ..."
const RATIONALE = /,?\s*\b(implying|implies|indicating|which|thereby|effectively|implicitly|suggesting|meaning|so that|in order)\b.*$/i;
const DIRECT_NUMBER_ASK = new RegExp(
    String.raw`\b(?:ask(?:ed|s)?|request(?:ed|s)?|needs|needed|wants|wanted|collected|took|noted|got|obtained)` +
    String.raw`(?:\s+(?:the\s+)?(?:prospect|customer|lead|caller|client|him|her|them))?` +
    String.raw`(?:\s+(?:for|to\s+(?:share|give|tell|say|provide|confirm|send|repeat)))?` +
    String.raw`\s+(?:the\s+|a\s+|an\s+|his\s+|her\s+|their\s+|your\s+)?` +
    String.raw`(?:(?:prospect|customer|lead|caller|client)(?:'s)?\s+)?(?:\w+'s\s+)?` +
    String.raw`(?:(?:whats\s?app|mobile|phone|contact|alternate|alternative|personal|other|another|cell)\s+)*(?:number|no\.)`,
    'i'
);

export function isWhatsAppGreetingOnly(instance) {
    const reason = String(instance?.reason || '');
    if (!WHATSAPP_GREETING.test(reason) || !GREETING_WORD.test(reason)) return false;
    return !DIRECT_NUMBER_ASK.test(reason.replace(RATIONALE, ''));
}

export function dropWhatsAppGreetings(numberRequests) {
    const instances = Array.isArray(numberRequests?.instances) ? numberRequests.instances : [];
    const kept = instances.filter(inst => !isWhatsAppGreetingOnly(inst));
    return { ...numberRequests, detected: kept.length > 0, instances: kept };
}
