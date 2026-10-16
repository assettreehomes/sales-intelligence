/**
 * India Standard Time helpers. The backend runs in UTC on Cloud Run, but every
 * "today", date filter and per-day bucket the dashboard shows means an IST day
 * (UTC+05:30, no daylight saving). Using the server's local midnight put calls
 * made between 00:00 and 05:30 IST on the previous day.
 */
const IST_OFFSET_MS = 330 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD of the IST calendar day containing this instant. */
export function istDateKey(value = new Date()) {
    const d = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(d.getTime())) return null;
    return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM of the IST month containing this instant. */
export function istMonthKey(value = new Date()) {
    const key = istDateKey(value);
    return key ? key.slice(0, 7) : null;
}

/** Instant of 00:00 IST on the given YYYY-MM-DD (or on today). Null when invalid. */
export function istDayStart(dateKey = istDateKey()) {
    const key = String(dateKey).slice(0, 10);
    if (!DATE_RE.test(key)) return null;
    const d = new Date(`${key}T00:00:00+05:30`);
    return Number.isFinite(d.getTime()) ? d : null;
}

/** Last millisecond of the given IST day. Null when invalid. */
export function istDayEnd(dateKey = istDateKey()) {
    const start = istDayStart(dateKey);
    return start ? new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) : null;
}
