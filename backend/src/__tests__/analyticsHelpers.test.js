/**
 * Task #12 — Analytics endpoint helpers: today filter + number_requests in response
 * Tests pure helper functions extracted from the analytics route logic.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Pure helpers replicated from analytics.js (not exported, so tested inline) ───

function toNumber(v) {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function roundTo(v, d = 2) { return Math.round(v * 10 ** d) / 10 ** d; }
function safePercent(part, whole) { return whole > 0 ? roundTo((part / whole) * 100) : 0; }

function getTodayFromDate(now = new Date()) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function getPeriodFromDate(periodKey, now = new Date()) {
    const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90, 'all': 365 * 5 };
    if (periodKey === 'today') return getTodayFromDate(now);
    const days = PERIOD_DAYS[periodKey] ?? 30;
    return new Date(now.getTime() - days * 86400000);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('safePercent helper', () => {
    it('returns 0 when whole is 0', () => {
        assert.equal(safePercent(5, 0), 0);
    });

    it('returns 100 when part equals whole', () => {
        assert.equal(safePercent(10, 10), 100);
    });

    it('rounds to 2 decimal places', () => {
        assert.equal(safePercent(1, 3), 33.33);
    });

    it('returns 0 when part is 0', () => {
        assert.equal(safePercent(0, 100), 0);
    });
});

describe('toNumber helper', () => {
    it('returns null for null', () => assert.equal(toNumber(null), null));
    it('returns null for undefined', () => assert.equal(toNumber(undefined), null));
    it('returns null for NaN', () => assert.equal(toNumber('abc'), null));
    it('converts string number', () => assert.equal(toNumber('42'), 42));
    it('converts numeric value', () => assert.equal(toNumber(3.14), 3.14));
});

describe('today filter: getPeriodFromDate', () => {
    it('for "today" returns midnight of current day', () => {
        const now = new Date('2026-06-10T14:30:00.000Z');
        const result = getPeriodFromDate('today', now);
        // Should be start of same calendar day
        assert.equal(result.getHours(), 0);
        assert.equal(result.getMinutes(), 0);
        assert.equal(result.getSeconds(), 0);
        assert.equal(result.getMilliseconds(), 0);
    });

    it('for "today" the fromDate is earlier than now', () => {
        const now = new Date();
        const result = getPeriodFromDate('today', now);
        assert.ok(result <= now, 'fromDate should be <= now');
    });

    it('for "7d" returns 7 days ago', () => {
        const now = new Date('2026-06-10T12:00:00.000Z');
        const result = getPeriodFromDate('7d', now);
        const diffMs = now.getTime() - result.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        assert.ok(Math.abs(diffDays - 7) < 0.01, `Expected ~7 days, got ${diffDays}`);
    });

    it('for "30d" returns 30 days ago', () => {
        const now = new Date('2026-06-10T12:00:00.000Z');
        const result = getPeriodFromDate('30d', now);
        const diffDays = (now.getTime() - result.getTime()) / 86400000;
        assert.ok(Math.abs(diffDays - 30) < 0.01);
    });
});

describe('daily bucket: number_requests tracking', () => {
    it('accumulates number_requests correctly', () => {
        const daily = new Map();

        const tickets = [
            { createdat: '2026-06-10T09:00:00Z', asked_mobile_number: true, call_authenticity: 'real', call_outcome: 'interested' },
            { createdat: '2026-06-10T10:00:00Z', asked_mobile_number: false, call_authenticity: 'fake', call_outcome: 'not_interested' },
            { createdat: '2026-06-10T11:00:00Z', asked_mobile_number: true, call_authenticity: 'real', call_outcome: 'follow_up_required' },
            { createdat: '2026-06-09T09:00:00Z', asked_mobile_number: true, call_authenticity: 'real', call_outcome: 'interested' },
        ];

        for (const ticket of tickets) {
            const date = ticket.createdat?.slice(0, 10);
            if (date) {
                const b = daily.get(date) || { count: 0, fake: 0, interested: 0, number_requests: 0 };
                b.count += 1;
                if (ticket.call_authenticity === 'fake') b.fake += 1;
                if (ticket.call_outcome === 'interested') b.interested += 1;
                if (ticket.asked_mobile_number) b.number_requests += 1;
                daily.set(date, b);
            }
        }

        const jun10 = daily.get('2026-06-10');
        const jun09 = daily.get('2026-06-09');

        assert.equal(jun10.count, 3);
        assert.equal(jun10.fake, 1);
        assert.equal(jun10.interested, 1);
        assert.equal(jun10.number_requests, 2);

        assert.equal(jun09.count, 1);
        assert.equal(jun09.number_requests, 1);
    });

    it('serialises to the expected response shape', () => {
        const daily = new Map([
            ['2026-06-10', { count: 5, fake: 1, interested: 2, number_requests: 1 }],
            ['2026-06-09', { count: 3, fake: 0, interested: 1, number_requests: 0 }],
        ]);

        const serialised = Array.from(daily.entries())
            .map(([date, b]) => ({ date, count: b.count, fake: b.fake, interested: b.interested, number_requests: b.number_requests }))
            .sort((a, b) => a.date.localeCompare(b.date));

        assert.equal(serialised.length, 2);
        assert.equal(serialised[0].date, '2026-06-09');
        assert.equal(serialised[1].number_requests, 1);
    });

    it('number_request_rate uses safePercent correctly', () => {
        assert.equal(safePercent(3, 10), 30);
        assert.equal(safePercent(0, 10), 0);
        assert.equal(safePercent(10, 0), 0);
    });
});
