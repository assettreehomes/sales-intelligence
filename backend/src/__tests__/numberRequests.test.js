/**
 * Number request filter — a WhatsApp "Hi" ask is not a number request; asking for a number is
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isWhatsAppGreetingOnly, dropWhatsAppGreetings } from '../utils/numberRequests.js';

const hiOnly = [
    "Agent asked the prospect to send a 'Hi' on WhatsApp so she could share property details.",
    "Agent asked prospect to text 'Hi' on WhatsApp to enable sharing of property details.",
    "Agent asked the prospect to reply 'Hi' to a greeting message to facilitate sharing property details.",
    "Agent asked the prospect to send a 'Hi' message so she could send the location, implying the use of the prospect's number for WhatsApp.",
    "Agent asked the prospect to send a 'Hi' on WhatsApp to the number she called from, so she could share property details.",
    "Agent asked the prospect to send a 'Hi' on WhatsApp so she could send details, which helps in getting the prospect's WhatsApp number."
];

const numberAsks = [
    "Agent asked for the prospect's WhatsApp number to send property details.",
    "Agent requested prospect's mobile number to share property details.",
    "Agent asked for the prospect's WhatsApp number to send a greeting message with the brochure.",
    "Agent asked the prospect to share their WhatsApp number and send a Hi there.",
    "Agent asked the prospect for his WhatsApp number so she could send a Hi message.",
    "Agent asked for an alternate number and asked the prospect to send a Hi on WhatsApp.",
    "Agent wanted the prospect's WhatsApp number to send a hello message."
];

describe('isWhatsAppGreetingOnly', () => {
    for (const reason of hiOnly) {
        it(`drops: ${reason.slice(0, 60)}`, () => assert.equal(isWhatsAppGreetingOnly({ reason }), true));
    }
    for (const reason of numberAsks) {
        it(`keeps: ${reason.slice(0, 60)}`, () => assert.equal(isWhatsAppGreetingOnly({ reason }), false));
    }
    it('keeps number asks that do not mention WhatsApp at all', () => {
        assert.equal(isWhatsAppGreetingOnly({ reason: 'Agent asked for any other number to reach the prospect.' }), false);
    });
});

describe('dropWhatsAppGreetings', () => {
    it('clears the flag when only WhatsApp greeting asks were found', () => {
        const out = dropWhatsAppGreetings({ detected: true, instances: [{ reason: hiOnly[0] }] });
        assert.deepEqual(out, { detected: false, instances: [] });
    });
    it('keeps real asks and drops the greeting ones in a mixed call', () => {
        const out = dropWhatsAppGreetings({ detected: true, instances: [{ reason: hiOnly[1] }, { reason: numberAsks[0] }] });
        assert.equal(out.detected, true);
        assert.deepEqual(out.instances, [{ reason: numberAsks[0] }]);
    });
    it('handles a missing or empty result', () => {
        assert.deepEqual(dropWhatsAppGreetings(undefined), { detected: false, instances: [] });
    });
});
