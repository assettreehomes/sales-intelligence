/**
 * hCaptcha server-side verification service
 */

const HCAPTCHA_VERIFY_URL = 'https://api.hcaptcha.com/siteverify';

/**
 * Verify an hCaptcha token server-side.
 * @param {string} token - The hCaptcha response token from the client
 * @returns {Promise<boolean>} true if valid
 */
export async function verifyCaptcha(token) {
    if (!token) return false;

    const secret = process.env.HCAPTCHA_SECRET_KEY;
    if (!secret) {
        console.warn('HCAPTCHA_SECRET_KEY not set — skipping captcha verification');
        return true; // Allow in dev if key not configured
    }

    try {
        const response = await fetch(HCAPTCHA_VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                secret,
                response: token,
            }),
        });

        const data = await response.json();
        return data.success === true;
    } catch (error) {
        console.error('hCaptcha verification error:', error);
        return false;
    }
}
