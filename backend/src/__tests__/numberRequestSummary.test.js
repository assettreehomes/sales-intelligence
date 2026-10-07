/**
 * Daily number-request summary email (operations + HR, 9 pm IST)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildNumberRequestSummary, latestRunAt } from '../utils/numberRequestSummary.js';

const to = new Date('2026-10-06T15:30:00Z'); // 9:00 pm IST
const from = new Date(to.getTime() - 86400000);
const call = (over) => ({
    ticket: { id: 'tk-' + Math.random().toString(36).slice(2, 8), createdat: '2026-10-06T09:15:00Z', durationseconds: 245, telecmi_lead_id: '1194221' },
    agentName: 'Priya S', teamName: 'Chennai Presales', summary: 'Prospect wants a 2BHK; agent offered a site visit.',
    instances: [{ time: '1:16', transcript_excerpt: 'Sir, unga WhatsApp number sollunga', reason: "Agent asked for the prospect's WhatsApp number." }],
    emailSentAt: '2026-10-06T09:20:00Z',
    ...over
});

describe('latestRunAt', () => {
    it('is 9 pm IST today after 9 pm, yesterday before it', () => {
        assert.equal(latestRunAt(new Date('2026-10-06T16:00:00Z'), { h: 21, min: 0 }).toISOString(), '2026-10-06T15:30:00.000Z');
        assert.equal(latestRunAt(new Date('2026-10-06T15:00:00Z'), { h: 21, min: 0 }).toISOString(), '2026-10-05T15:30:00.000Z');
        assert.equal(latestRunAt(new Date('2026-10-06T15:30:00Z'), { h: 21, min: 0 }).toISOString(), '2026-10-06T15:30:00.000Z');
    });
});

describe('buildNumberRequestSummary', () => {
    it('sends a short "no number requests today" email when nothing was flagged', () => {
        const e = buildNumberRequestSummary({ calls: [], from, to });
        assert.equal(e.subject, 'Number Request Summary – 06 Oct 2026: no number requests today');
        assert.match(e.text, /No presales agent asked/);
        assert.match(e.html, /No number requests today/);
    });

    it('gives totals, per-team and per-agent counts, then every call in detail', () => {
        const calls = [
            call({}),
            call({ ticket: { id: 'tk-b', createdat: '2026-10-06T11:40:00Z', durationseconds: 90 }, emailSentAt: null,
                instances: [{ time: '0:40', transcript_excerpt: 'Unga phone number 98765 43210 thaane?' }, { time: '2:05', transcript_excerpt: 'Vera number irukka?' }] }),
            call({ agentName: 'Pammal Ravi', teamName: 'Pammal', ticket: { id: 'tk-c', createdat: '2026-10-06T12:00:00Z' } })
        ];
        const e = buildNumberRequestSummary({ calls, from, to, chatExcluded: ['pammal'], dashboardUrl: 'https://one.assettreehomes.com' });
        assert.equal(e.subject, 'Number Request Summary – 06 Oct 2026: 3 calls by 2 agents');
        for (const body of [e.text, e.html]) {
            assert.match(body, /Pammal/);                       // Pammal is included in the summary
            assert.match(body, /Chennai Presales/);
            assert.match(body, /Prospect wants a 2BHK/);
            assert.match(body, /Vera number irukka/);
            assert.match(body, /HR email sent/);
            assert.match(body, /HR email not recorded/);
            assert.match(body, /Synology Chat skipped/);
            assert.doesNotMatch(body.replace(/tk-[a-z0-9]+/g, ''), /\d{5}\s?\d{5}/);
        }
        assert.match(e.text, /Flagged calls: 3/);
        assert.match(e.text, /Number requests \(instances\): 4/);
        assert.match(e.text, /- Chennai Presales: 2 call\(s\), 3 request\(s\), 1 agent\(s\)/);
        assert.match(e.text, /- Priya S \(Chennai Presales\): 2 call\(s\), 3 request\(s\)/);
        assert.match(e.text, /https:\/\/one\.assettreehomes\.com\/admin\/tickets\/tk-b/);
    });
});
