// Mask phone numbers — every digit becomes X
// e.g. 919840912567 → XXXXXXXXXXXX, 9876543210 → XXXXXXXXXX
export function maskPhone(number) {
    const s = String(number);
    if (s === 'unknown') return s;
    return s.replace(/\d/g, 'X');
}

const PHONE_PATTERNS = [
    // 12-digit Indian with 91 country code (optional +, space or hyphen after 91)
    /(?<![0-9A-Za-z])\+?91[ -]?[6-9]\d{9}(?![0-9A-Za-z])/g,
    // 10-digit Indian mobile (optional leading 0, optional space/hyphen in the middle)
    /(?<![0-9A-Za-z])0?[6-9]\d{4}[ -]?\d{5}(?![0-9A-Za-z])/g
];

// Mask phone numbers anywhere inside free text (AI summaries, notes, quotes).
// A value that is only a phone number (any country, 8-15 digits) is masked whole.
export function maskNumbersInText(text) {
    if (typeof text !== 'string') return text;
    if (/^\+?\d{8,15}$/.test(text)) return maskPhone(text);
    return PHONE_PATTERNS.reduce((out, re) => out.replace(re, maskPhone), text);
}

// Apply maskNumbersInText to every string inside an object/array.
export function maskNumbersDeep(value) {
    if (typeof value === 'string') return maskNumbersInText(value);
    if (Array.isArray(value)) return value.map(maskNumbersDeep);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskNumbersDeep(v)]));
    }
    return value;
}
