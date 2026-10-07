/**
 * HR alert email for presales number requests, and the mail adapter's Hostinger calls
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildNumberRequestEmail, buildNumberRequestPush, buildNumberRequestChat, parseExcludeList, isExcludedFromChat } from '../utils/numberRequestEmail.js';
import { postSynologyChat, recentSynologyPosts } from '../services/synologyChat.js';
import { sendEmail } from '../services/mailer.js';

const sample = {
    agentName: 'Priya S',
    ticket: {
        id: '1b2c3d4e-0000-4000-8000-000000000001',
        createdat: '2026-10-06T09:15:00Z',
        durationseconds: 245,
        telecmi_lead_id: 'LD-55821',
        selldo_team_name: 'Chennai Presales',
        telecmi_direction: 'outbound'
    },
    summary: 'Prospect enquired about 2BHK villas in Guduvanchery; call back from 9876543210 requested.',
    instances: [
        { reason: "Agent asked for the prospect's WhatsApp number to send brochures.", time: '1:16', transcript_excerpt: 'சார், உங்க வாட்ஸ்அப் நம்பர் சொல்லுங்க.' },
        { reason: "Agent asked for an alternate mobile number.", time: '3:02', transcript_excerpt: 'Is 98765 43210 your only number, sir?' }
    ],
    dashboardUrl: 'https://one.assettreehomes.com/'
};

describe('buildNumberRequestEmail', () => {
    const email = buildNumberRequestEmail(sample);

    it('uses the requested subject', () => {
        assert.equal(email.subject, 'Client Phone Number asked by Priya S');
    });

    it('carries the summary, every quote with its time, date, lead and ticket', () => {
        for (const body of [email.text, email.html]) {
            assert.match(body, /Call Summary|CALL SUMMARY/);
            assert.match(body, /Proof of Speech|PROOF OF SPEECH/);
            assert.match(body, /Guduvanchery/);
            assert.match(body, /வாட்ஸ்அப் நம்பர்/);
            assert.match(body, /1:16/);
            assert.match(body, /3:02/);
            assert.match(body, /06 Oct 2026/);
            assert.match(body, /LD-55821/);
            assert.match(body, /1b2c3d4e-0000-4000-8000-000000000001/);
        }
        assert.match(email.text, /https:\/\/one\.assettreehomes\.com\/admin\/tickets\/1b2c3d4e/);
    });

    it('never shows a customer number', () => {
        for (const body of [email.subject, email.text, email.html]) {
            assert.doesNotMatch(body.replaceAll(sample.ticket.id, ''), /\d{5}\s?\d{5}/);
        }
    });

    it('escapes HTML from model output', () => {
        const e = buildNumberRequestEmail({ ...sample, summary: '<script>x</script>' });
        assert.doesNotMatch(e.html, /<script>/);
    });

    it('falls back when the agent is unknown', () => {
        assert.equal(buildNumberRequestEmail({ ...sample, agentName: null }).subject, 'Client Phone Number asked by Unknown agent');
    });
});

describe('sendEmail (hostinger)', () => {
    const realFetch = globalThis.fetch;
    const env = { ...process.env };
    let calls;

    beforeEach(() => {
        calls = [];
        process.env.MAIL_API_KEY = 'test-key';
        process.env.MAIL_FROM = 'mis@assettreehomes.com';
        delete process.env.MAIL_PROVIDER;
        delete process.env.HOSTINGER_MAILBOX_ID;
        globalThis.fetch = async (url, opts) => {
            calls.push({ url, opts });
            if (url.endsWith('/api/v1/me')) {
                return new Response(JSON.stringify({ data: { orderResourceId: 'OR1', mailboxes: [
                    { resourceId: 'ACother', address: 'sales@assettreehomes.com' },
                    { resourceId: 'ACmis', address: 'MIS@assettreehomes.com' }
                ] } }), { status: 200 });
            }
            return new Response(null, { status: 204 });
        };
    });
    afterEach(() => { globalThis.fetch = realFetch; process.env = { ...env }; });

    it('looks up the sending mailbox and posts the message with a bearer key', async () => {
        await sendEmail({ to: 'hr@assettreehomes.com', subject: 's', text: 't', html: '<p>h</p>' });
        assert.equal(calls.length, 2);
        assert.equal(calls[1].url, 'https://api.mail.hostinger.com/api/v1/mailboxes/ACmis/send');
        assert.equal(calls[1].opts.headers.Authorization, 'Bearer test-key');
        const body = JSON.parse(calls[1].opts.body);
        assert.deepEqual(body.to, ['hr@assettreehomes.com']);
        assert.equal(body.subject, 's');
    });

    it('throws a clear error when the provider rejects the message', async () => {
        process.env.HOSTINGER_MAILBOX_ID = 'ACmis';
        globalThis.fetch = async () => new Response(JSON.stringify({ code: 'ERR_UNAUTHORIZED' }), { status: 401 });
        await assert.rejects(sendEmail({ to: 'hr@assettreehomes.com', subject: 's', text: 't' }), /401 ERR_UNAUTHORIZED/);
    });
});

describe('buildNumberRequestPush', () => {
    it('gives admins the agent, time, lead and first quote, masked', () => {
        const push = buildNumberRequestPush(sample);
        assert.equal(push.title, 'Client Phone Number asked by Priya S');
        assert.match(push.body, /06 Oct 2026, 02:45 pm IST/);
        assert.match(push.body, /Lead LD-55821/);
        assert.match(push.body, /வாட்ஸ்அப் நம்பர்/);
        assert.match(push.body, /\(\+1 more\)$/);
        assert.doesNotMatch(push.body, /\d{5}\s?\d{5}/);
    });

    it('stays short enough for a phone notification', () => {
        const long = buildNumberRequestPush({ ...sample, instances: [{ transcript_excerpt: 'x'.repeat(500) }] });
        assert.ok(long.body.length <= 230);
    });
});

describe('Synology Chat alert', () => {
    it('carries the same masked content as the email', () => {
        const msg = buildNumberRequestChat(sample);
        assert.match(msg, /^🚨 Client Phone Number asked by Priya S\n/);
        assert.match(msg, /CALL SUMMARY/);
        assert.match(msg, /PROOF OF SPEECH/);
        assert.match(msg, /\[1:16\]/);
        assert.match(msg, /Lead ID: LD-55821/);
        assert.doesNotMatch(msg.replaceAll(sample.ticket.id, ''), /\d{5}\s?\d{5}/);
        assert.doesNotMatch(msg, /sent automatically/);
    });

    it('skips the Pammal team or an agent named Pammal, case-insensitively', () => {
        const excluded = parseExcludeList('pammal');
        assert.equal(isExcludedFromChat({ agentName: 'Priya S', teamName: 'PAMMAL Presales' }, excluded), true);
        assert.equal(isExcludedFromChat({ agentName: 'Pammal Ravi', teamName: null }, excluded), true);
        assert.equal(isExcludedFromChat({ agentName: 'Priya S', teamName: 'Chennai Presales' }, excluded), false);
        assert.equal(isExcludedFromChat({ agentName: 'Priya S', teamName: 'Chennai' }, parseExcludeList(' ')), false);
    });
});

describe('postSynologyChat', () => {
    const realFetch = globalThis.fetch;
    afterEach(() => { globalThis.fetch = realFetch; delete process.env.SYNOLOGY_CHAT_WEBHOOK_URL; });

    it('posts a form-encoded payload to the webhook URL', async () => {
        process.env.SYNOLOGY_CHAT_WEBHOOK_URL = 'https://nas.example:5001/webapi/entry.cgi?api=SYNO.Chat.External&method=incoming&version=2&token=%22abc%22';
        let seen;
        globalThis.fetch = async (url, opts) => { seen = { url, opts }; return new Response('{"success":true}', { status: 200 }); };
        await postSynologyChat('hello');
        assert.equal(seen.url, process.env.SYNOLOGY_CHAT_WEBHOOK_URL);
        assert.equal(JSON.parse(new URLSearchParams(seen.opts.body).get('payload')).text, 'hello');
    });

    it('keeps the %22-quoted token and undoes a copied &amp;', async () => {
        process.env.SYNOLOGY_CHAT_WEBHOOK_URL = ' https://nas.example:5001/webapi/entry.cgi?api=SYNO.Chat.External&amp;method=incoming&amp;version=2&amp;token=%22abc%22 ';
        let seenUrl;
        globalThis.fetch = async (url) => { seenUrl = url; return new Response('{"success":true}', { status: 200 }); };
        await postSynologyChat('x');
        assert.equal(seenUrl, 'https://nas.example:5001/webapi/entry.cgi?api=SYNO.Chat.External&method=incoming&version=2&token=%22abc%22');
        assert.equal(new URL(seenUrl).searchParams.get('token'), '"abc"');
    });

    it('treats success:false as a failure', async () => {
        process.env.SYNOLOGY_CHAT_WEBHOOK_URL = 'https://nas.example/webapi/entry.cgi';
        globalThis.fetch = async () => new Response('{"success":false,"error":{"code":404}}', { status: 200 });
        await assert.rejects(postSynologyChat('x'), /error 404/);
    });

    it('records each post and its outcome, newest first', async () => {
        process.env.SYNOLOGY_CHAT_WEBHOOK_URL = 'https://nas.example/webapi/entry.cgi';
        globalThis.fetch = async () => new Response('{"success":true}', { status: 200 });
        await postSynologyChat('ok', { ticketId: 't-1' });
        globalThis.fetch = async () => new Response('{"success":false,"error":{"code":117}}', { status: 200 });
        await assert.rejects(postSynologyChat('bad', { test: true }));
        const [latest, previous] = recentSynologyPosts();
        assert.equal(latest.test, true);
        assert.equal(latest.ok, false);
        assert.match(latest.error, /error 117/);
        assert.equal(previous.ticketId, 't-1');
        assert.equal(previous.ok, true);
    });
});
