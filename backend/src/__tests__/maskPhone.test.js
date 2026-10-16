/**
 * Phone number masking — every digit of a customer number becomes X
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maskPhone, maskNumbersInText, maskNumbersDeep } from '../utils/maskPhone.js';

describe('maskPhone', () => {
    it('masks every digit', () => {
        assert.equal(maskPhone('919840912567'), 'XXXXXXXXXXXX');
        assert.equal(maskPhone('9876543210'), 'XXXXXXXXXX');
    });
    it('keeps the unknown placeholder', () => {
        assert.equal(maskPhone('unknown'), 'unknown');
    });
});

describe('maskNumbersInText', () => {
    it('masks Indian mobiles inside text', () => {
        assert.equal(
            maskNumbersInText('call back 9876543210 or +91 98765 43210 or 09876543210'),
            'call back XXXXXXXXXX or +91 XXXXX XXXXX or XXXXXXXXXXX'
        );
    });
    it('masks a value that is only a number, any country', () => {
        assert.equal(maskNumbersInText('971501234567'), 'XXXXXXXXXXXX');
    });
    it('leaves ids, timestamps and short numbers alone', () => {
        assert.equal(maskNumbersInText('ticket 3f2a9876543210ab at 76000 ms'), 'ticket 3f2a9876543210ab at 76000 ms');
    });
});

describe('maskNumbersDeep', () => {
    it('masks strings nested in objects and arrays, keeps other values', () => {
        assert.deepEqual(
            maskNumbersDeep({ summary: 'Lead 9876543210', items: ['Phone 9123456789'], score: 7 }),
            { summary: 'Lead XXXXXXXXXX', items: ['Phone XXXXXXXXXX'], score: 7 }
        );
    });
});

describe('maskNumbersInText: spoken groupings', () => {
    it('masks mobiles written in 3-3-4, 5-3-2 and 2-2-2-2-2 groups', () => {
        for (const n of ['984 001 2345', '98400-123-45', '9840 012345', '98 40 01 23 45', '+91 984 001 2345']) {
            const out = maskNumbersInText(`call me on ${n} today`);
            assert.ok(!/\d/.test(out), `${n} -> ${out}`);
        }
    });

    it('leaves prices, timestamps and short numbers alone', () => {
        assert.equal(maskNumbersInText('Budget is 75,00,000 for 1200 sq ft'), 'Budget is 75,00,000 for 1200 sq ft');
        assert.equal(maskNumbersInText('At 76000 ms on 2026-10-16'), 'At 76000 ms on 2026-10-16');
        assert.equal(maskNumbersInText('Plot 45 in phase 2'), 'Plot 45 in phase 2');
    });
});
