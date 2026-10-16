import crypto from 'crypto';

/**
 * Constant-time comparison of a webhook secret. False when either side is
 * missing or empty, so an unset secret never matches.
 */
export function secretMatches(provided, expected) {
    if (typeof provided !== 'string' || typeof expected !== 'string') return false;
    if (!provided || !expected) return false;
    const a = crypto.createHash('sha256').update(provided).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(a, b);
}

/**
 * TeleCMI webhook check. Opt-in: with TELECMI_WEBHOOK_SECRET unset every call
 * is accepted (current behaviour). Once set, the secret must arrive either as
 * the x-webhook-secret header or as ?secret=... on the webhook URL configured
 * in TeleCMI (TeleCMI cannot add custom headers, the query string works).
 */
export function telecmiWebhookAllowed(req, expected = process.env.TELECMI_WEBHOOK_SECRET) {
    if (!expected) return true;
    const provided = req.headers?.['x-webhook-secret'] ?? req.query?.secret;
    return secretMatches(Array.isArray(provided) ? provided[0] : provided, expected);
}
