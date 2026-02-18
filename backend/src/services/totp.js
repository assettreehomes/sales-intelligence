/**
 * TOTP (Time-based One-Time Password) service
 * Handles secret generation, QR code creation, code verification,
 * and AES-256-GCM encryption for secrets at rest.
 */

import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'crypto';

const ISSUER = 'TicketIntel';
const ALGORITHM = 'aes-256-gcm';

/**
 * Get the encryption key from env (must be exactly 32 bytes).
 */
function getEncryptionKey() {
    const key = process.env.TOTP_ENCRYPTION_KEY;
    if (!key) throw new Error('TOTP_ENCRYPTION_KEY not set');
    // Hash the key to ensure exactly 32 bytes for AES-256
    return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns: iv:authTag:ciphertext (all hex-encoded, colon-separated)
 */
export function encryptSecret(plaintext) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Input format: iv:authTag:ciphertext (all hex-encoded)
 */
export function decryptSecret(ciphertext) {
    const key = getEncryptionKey();
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Generate a new TOTP secret for a user.
 * @param {string} email - User's email (shown in authenticator app)
 * @returns {{ secret: OTPAuth.TOTP, base32Secret: string }}
 */
export function generateTOTPSecret(email) {
    const secret = new OTPAuth.Secret({ size: 20 });

    const totp = new OTPAuth.TOTP({
        issuer: ISSUER,
        label: email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret,
    });

    return {
        totp,
        base32Secret: secret.base32,
    };
}

/**
 * Verify a TOTP code against a base32 secret.
 * Allows a window of ±1 period (±30 seconds) for clock drift.
 * @param {string} base32Secret - The base32-encoded secret
 * @param {string} code - The 6-digit code from the authenticator app
 * @returns {boolean}
 */
export function verifyTOTPCode(base32Secret, code) {
    const totp = new OTPAuth.TOTP({
        issuer: ISSUER,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(base32Secret),
    });

    // validate returns the delta (null if invalid, number if valid)
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
}

/**
 * Generate the otpauth:// URI for QR code scanning.
 * @param {string} email
 * @param {string} base32Secret
 * @returns {string}
 */
export function getTOTPUri(email, base32Secret) {
    const totp = new OTPAuth.TOTP({
        issuer: ISSUER,
        label: email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(base32Secret),
    });

    return totp.toString();
}

/**
 * Generate a QR code as a data URI (base64 PNG).
 * @param {string} otpauthUri - The otpauth:// URI
 * @returns {Promise<string>} data:image/png;base64,...
 */
export async function generateQRCodeDataUri(otpauthUri) {
    return QRCode.toDataURL(otpauthUri, {
        width: 256,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff',
        },
    });
}
