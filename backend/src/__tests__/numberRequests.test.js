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
    "Agent asked the prospect to send a 'Hi' on WhatsApp so she could send details, which helps in getting the prospect's WhatsApp number.",
    "Agent told the prospect to drop a 'Hi' on WhatsApp to the same number he was calling from, implying the prospect's contact would be captured.",
    "Agent requested a WhatsApp 'Hi' from the prospect on the agent's own number, which helps in getting the prospect's WhatsApp number.",
    "Agent instructed the prospect to save her number and send a 'Hi' on WhatsApp, thereby securing the prospect's contact for follow-up.",
    "Agent requested the prospect to send a 'Hi' on WhatsApp to confirm the number they were speaking on is on WhatsApp.",
    "Agent told the prospect she would share her WhatsApp number via SMS and asked the prospect to send a 'Hi' on it.",
    "Agent asked the prospect to send a 'Hi' on WhatsApp from whichever number they use for WhatsApp, implying the number would be obtained.",
    "Agent asked the prospect to text her a 'Hi' so she could send the floor plans.",
    "Agent asked the prospect to send a 'Hi' on WhatsApp so she could share project details, implying she needs his WhatsApp number to initiate contact.",
    "Agent asked prospect to send a 'Hi' message to a provided WhatsApp number to facilitate sending property details.",
    "Agent reiterated the request for a 'Hi' message on WhatsApp to save the prospect's number."
];

const numberAsks = [
    "Agent asked for the prospect's WhatsApp number to send property details.",
    "Agent requested prospect's mobile number to share property details.",
    "Agent asked for the prospect's WhatsApp number to send a greeting message with the brochure.",
    "Agent asked the prospect to share their WhatsApp number and send a Hi there.",
    "Agent asked the prospect for his WhatsApp number so she could send a Hi message.",
    "Agent asked for an alternate number and asked the prospect to send a Hi on WhatsApp.",
    "Agent wanted the prospect's WhatsApp number to send a hello message.",
    "The prospect's WhatsApp number was requested by the agent so that a welcome message with the price list could be sent.",
    "Agent asked the prospect to message his alternate number to her on WhatsApp so the sales manager could reach him later.",
    "To share the brochure, agent said 'please tell me your WhatsApp number, I will send a Hi from my side', which helps in staying connected.",
    "Agent asked the prospect, an NRI, for his number with the country code that is active on WhatsApp, to send a hello message.",
    "Agent asked for a backup number in case the current one is switched off, mentioning she would message it on WhatsApp as well.",
    "Agent read out a partial number and asked the prospect to tell the remaining digits of his WhatsApp number so a Hi could be sent.",
    "Agent asked the prospect to send a Hi on WhatsApp so she could share details, and then asked for his WhatsApp number.",
    "Agent asked the prospect to send a Hi on WhatsApp, which she followed by asking for his alternate number.",
    "Agent asked the prospect to send a Hi from his other number.",
    "Agent asked the prospect to send a Hi from the number his son uses on WhatsApp.",
    "Agent asked the prospect to give a missed call and send a Hi on WhatsApp.",
    "Agent asked him to send a Hi if WhatsApp is on the same number, otherwise to give another one.",
    "Agent asked the prospect to send a 'Hi' on WhatsApp so she could get the husband's number to share project details.",
    "Agent asked the prospect to have their son send a 'Hi' message to a WhatsApp number for further communication.",
    "Agent reiterated the request for the prospect to send a 'Hi' message from his wife's mobile to her number."
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
