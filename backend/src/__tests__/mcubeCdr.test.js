import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMcubeCdr, mcubeTimeToIso, hmsToSeconds, isAllowedRecordingUrl, recordingExtension } from '../utils/mcubeCdr.js';
import { mcubeWebhookAllowed } from '../utils/webhookSecret.js';

// The sample MCube sent on ticket #207698 (numbers replaced with fakes; note the
// newlines around the recording URL, exactly as in their mail)
const SAMPLE = {
    starttime: '2023-10-12 11:49:57',
    callid: '8088976729169709111',
    emp_phone: '9000000001',
    clicktocalldid: '9000000002',
    callto: '9000000003',
    dialstatus: 'ANSWER',
    filename: '\nhttps://s3.ap-south-1.amazonaws.com/app.mcube.com/recordings/2023/10/6011/867161697091597.wav\n',
    direction: 'inbound',
    endtime: '2023-10-12 11:50:28',
    disconnectedby: 'Customer',
    answeredtime: '00:00:04',
    groupname: 'Integration',
    agentname: 'Test'
};

describe('parseMcubeCdr', () => {
    it('maps the documented MCube payload', () => {
        const c = parseMcubeCdr(SAMPLE);
        assert.equal(c.callId, '8088976729169709111');
        assert.equal(c.direction, 'inbound');
        assert.equal(c.answered, true);
        assert.equal(c.talkSec, 4);
        assert.equal(c.agentPhone, '9000000001');
        assert.equal(c.agentName, 'Test');
        assert.equal(c.did, '9000000002');
        assert.equal(c.group, 'Integration');
        assert.equal(c.disconnectedBy, 'Customer');
        assert.equal(c.recordingUrl, 'https://s3.ap-south-1.amazonaws.com/app.mcube.com/recordings/2023/10/6011/867161697091597.wav');
        assert.equal(c.startIso, '2023-10-12T06:19:57.000Z'); // 11:49:57 IST
        assert.equal(c.endIso, '2023-10-12T06:20:28.000Z');
        assert.equal(c.leadId, null);
    });

    it('treats non-answered calls as not answered', () => {
        assert.equal(parseMcubeCdr({ ...SAMPLE, dialstatus: 'NOANSWER' }).answered, false);
        assert.equal(parseMcubeCdr({ ...SAMPLE, dialstatus: 'busy' }).answered, false);
    });

    it('defaults to outbound and uses callto as the customer number', () => {
        const c = parseMcubeCdr({ ...SAMPLE, direction: 'outbound' });
        assert.equal(c.direction, 'outbound');
        assert.equal(c.customerNumber, '9000000003');
        assert.equal(parseMcubeCdr({ ...SAMPLE, direction: undefined }).direction, 'outbound');
    });

    it('reads a CRM lead id passed through click-to-call', () => {
        assert.equal(parseMcubeCdr({ ...SAMPLE, lead_id: '1253549' }).leadId, '1253549');
        assert.equal(parseMcubeCdr({ ...SAMPLE, custom: '{"lead_id":1226413}' }).leadId, '1226413');
        assert.equal(parseMcubeCdr({ ...SAMPLE, custom: 'not-json' }).leadId, null);
    });

    it('falls back to start/end times when answeredtime is missing', () => {
        assert.equal(parseMcubeCdr({ ...SAMPLE, answeredtime: '' }).talkSec, 31);
    });

    it('survives an empty body', () => {
        const c = parseMcubeCdr(undefined);
        assert.equal(c.callId, null);
        assert.equal(c.answered, false);
    });
});

describe('time helpers', () => {
    it('converts IST wall time and epoch values', () => {
        assert.equal(mcubeTimeToIso('2026-11-23 18:00:00'), '2026-11-23T12:30:00.000Z');
        assert.equal(mcubeTimeToIso('2026-11-23T12:30:00Z'), '2026-11-23T12:30:00.000Z');
        assert.equal(mcubeTimeToIso('1795437000'), new Date(1795437000 * 1000).toISOString());
        assert.equal(mcubeTimeToIso('garbage'), null);
    });
    it('parses durations', () => {
        assert.equal(hmsToSeconds('00:01:04'), 64);
        assert.equal(hmsToSeconds('01:04'), 64);
        assert.equal(hmsToSeconds('64'), 64);
        assert.equal(hmsToSeconds(null), 0);
    });
});

describe('isAllowedRecordingUrl', () => {
    it('accepts MCube S3 recordings only', () => {
        assert.equal(isAllowedRecordingUrl('https://s3.ap-south-1.amazonaws.com/app.mcube.com/recordings/a.wav', ''), true);
        assert.equal(isAllowedRecordingUrl('https://s3.ap-south-1.amazonaws.com/someone-else/a.wav', ''), false);
        assert.equal(isAllowedRecordingUrl('http://s3.ap-south-1.amazonaws.com/app.mcube.com/a.wav', ''), false);
        assert.equal(isAllowedRecordingUrl('https://169.254.169.254/latest/meta-data', ''), false);
        assert.equal(isAllowedRecordingUrl('https://evilmcube.com/a.wav', ''), false);
        assert.equal(isAllowedRecordingUrl('https://rec.mcube.com/a.wav', ''), true);
        assert.equal(isAllowedRecordingUrl('not a url', ''), false);
    });
    it('accepts extra hosts from config', () => {
        assert.equal(isAllowedRecordingUrl('https://cdn.example.net/a.wav', 'cdn.example.net'), true);
    });
});

describe('recordingExtension', () => {
    it('prefers content type, then the URL', () => {
        assert.equal(recordingExtension('x.mp3', 'audio/wav'), 'wav');
        assert.equal(recordingExtension('https://h/a/b.WAV?sig=1', ''), 'wav');
        assert.equal(recordingExtension('https://h/a/b', ''), 'mp3');
    });
});

describe('mcubeWebhookAllowed', () => {
    it('rejects everything while no secret is configured', () => {
        assert.equal(mcubeWebhookAllowed({ headers: {}, query: {} }, undefined), false);
        assert.equal(mcubeWebhookAllowed({ headers: {}, query: { secret: '' } }, ''), false);
    });
    it('accepts the secret from the header or the query string', () => {
        assert.equal(mcubeWebhookAllowed({ headers: { 'x-webhook-secret': 'k' }, query: {} }, 'k'), true);
        assert.equal(mcubeWebhookAllowed({ headers: {}, query: { secret: 'k' } }, 'k'), true);
        assert.equal(mcubeWebhookAllowed({ headers: {}, query: { secret: 'x' } }, 'k'), false);
    });
});
