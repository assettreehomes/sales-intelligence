import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { istDateKey, istMonthKey, istDayStart, istDayEnd } from '../utils/istDate.js';

describe('IST date helpers', () => {
    it('puts 00:00-05:29 IST on the IST day, not the UTC one', () => {
        assert.equal(istDateKey('2026-10-15T19:00:00Z'), '2026-10-16'); // 00:30 IST on 16th
        assert.equal(istDateKey('2026-10-15T18:29:59Z'), '2026-10-15'); // 23:59 IST on 15th
        assert.equal(istMonthKey('2026-10-31T19:00:00Z'), '2026-11');
        assert.equal(istDateKey('garbage'), null);
    });

    it('builds IST day boundaries', () => {
        assert.equal(istDayStart('2026-10-16').toISOString(), '2026-10-15T18:30:00.000Z');
        assert.equal(istDayEnd('2026-10-16').toISOString(), '2026-10-16T18:29:59.999Z');
        assert.equal(istDayStart('2026-10-16T10:00:00').toISOString(), '2026-10-15T18:30:00.000Z');
        assert.equal(istDayStart('16/10/2026'), null);
    });
});
