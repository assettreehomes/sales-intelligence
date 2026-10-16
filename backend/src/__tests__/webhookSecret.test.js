import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { secretMatches, telecmiWebhookAllowed } from '../utils/webhookSecret.js';

describe('secretMatches', () => {
    it('matches only the exact secret', () => {
        assert.equal(secretMatches('abc123', 'abc123'), true);
        assert.equal(secretMatches('abc124', 'abc123'), false);
        assert.equal(secretMatches('abc', 'abc123'), false);
    });

    it('never matches when either side is missing', () => {
        assert.equal(secretMatches(undefined, 'abc'), false);
        assert.equal(secretMatches('abc', undefined), false);
        assert.equal(secretMatches('', ''), false);
        assert.equal(secretMatches(undefined, undefined), false);
    });
});

describe('telecmiWebhookAllowed', () => {
    it('accepts everything while no secret is configured', () => {
        assert.equal(telecmiWebhookAllowed({ headers: {}, query: {} }, undefined), true);
        assert.equal(telecmiWebhookAllowed({ headers: {}, query: {} }, ''), true);
    });

    it('accepts the secret from the header or the query string', () => {
        assert.equal(telecmiWebhookAllowed({ headers: { 'x-webhook-secret': 's3' }, query: {} }, 's3'), true);
        assert.equal(telecmiWebhookAllowed({ headers: {}, query: { secret: 's3' } }, 's3'), true);
    });

    it('rejects a wrong or missing secret once configured', () => {
        assert.equal(telecmiWebhookAllowed({ headers: {}, query: {} }, 's3'), false);
        assert.equal(telecmiWebhookAllowed({ headers: { 'x-webhook-secret': 'nope' }, query: {} }, 's3'), false);
        assert.equal(telecmiWebhookAllowed({ headers: {}, query: { secret: ['s3', 'x'] } }, 's3'), true);
    });
});
