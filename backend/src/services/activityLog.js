import { supabaseAdmin } from '../config/supabase.js';

/**
 * Parse a User-Agent string into a readable device/OS/browser summary.
 */
function parseUserAgent(ua) {
    if (!ua) return { device: 'Unknown', os: 'Unknown', browser: 'Unknown' };

    // OS detection
    let os = 'Unknown';
    if (/Windows NT 10/.test(ua)) os = 'Windows 10';
    else if (/Windows NT 11|Windows NT 10.*rv:/.test(ua) && /Win64/.test(ua)) os = 'Windows 11';
    else if (/Windows/.test(ua)) os = 'Windows';
    else if (/Mac OS X 10[._]15/.test(ua)) os = 'macOS Catalina';
    else if (/Mac OS X 11/.test(ua) || /Mac OS X 10[._]16/.test(ua)) os = 'macOS Big Sur';
    else if (/Mac OS X 12/.test(ua)) os = 'macOS Monterey';
    else if (/Mac OS X 13/.test(ua)) os = 'macOS Ventura';
    else if (/Mac OS X 14/.test(ua)) os = 'macOS Sonoma';
    else if (/Mac OS X 15/.test(ua)) os = 'macOS Sequoia';
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/Android (\d+)/.test(ua)) os = `Android ${ua.match(/Android (\d+)/)[1]}`;
    else if (/iPhone OS (\d+)/.test(ua)) os = `iOS ${ua.match(/iPhone OS (\d+)/)[1]}`;
    else if (/iPad/.test(ua)) os = 'iPadOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    else if (/CrOS/.test(ua)) os = 'Chrome OS';

    // Browser detection
    let browser = 'Unknown';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
    else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Browser';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';

    // Device type
    let device = 'Desktop';
    if (/Mobile|Android/.test(ua) && !/Tablet/.test(ua)) device = 'Mobile';
    else if (/iPad|Tablet/.test(ua)) device = 'Tablet';

    return { device, os, browser };
}

/**
 * Look up approximate location from IP address using free ip-api.
 * Returns city + country or null. Non-blocking — failures are silently ignored.
 */
async function geoLookup(ip) {
    try {
        // Skip private/localhost IPs
        if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
            return 'Local Network';
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000); // 2s timeout

        const resp = await fetch(`http://ip-api.com/json/${ip}?fields=city,country,status`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!resp.ok) return null;
        const data = await resp.json();

        if (data.status === 'success' && data.city) {
            return `${data.city}, ${data.country}`;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Log an admin activity to the activity_logs table.
 *
 * @param {import('express').Request} req - Express request (must have req.user)
 * @param {string} action - Action identifier (e.g. 'ticket.delete', 'excuse.accept')
 * @param {object} details - Additional context (ticket_id, excuse_id, etc.)
 */
export async function logActivity(req, action, details = {}) {
    try {
        const userId = req.user?.id || null;
        const userName = req.user?.fullname || req.user?.email || 'Unknown';
        const ipAddress =
            req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.socket?.remoteAddress ||
            null;

        // Parse device info from User-Agent
        const rawUA = req.headers['user-agent'] || '';
        const { device, os, browser } = parseUserAgent(rawUA);

        // Geo lookup (async, non-blocking on failure)
        const location = await geoLookup(ipAddress);

        await supabaseAdmin.from('activity_logs').insert({
            user_id: userId,
            user_name: userName,
            action,
            details: {
                ...details,
                device,
                os,
                browser,
            },
            ip_address: ipAddress,
            location: location,
        });
    } catch (error) {
        // Log but don't fail the request — activity logging is non-critical
        console.error('⚠️ Activity log write failed:', error.message);
    }
}
