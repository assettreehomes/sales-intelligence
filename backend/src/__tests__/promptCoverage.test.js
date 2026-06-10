/**
 * Task #10 — Prompt detection coverage tests
 * Verifies the presales analysis prompt contains all required NUMBER REQUEST DETECTION patterns.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPresalesAnalysisPrompt } from '../prompts/analysis.js';

const prompt = getPresalesAnalysisPrompt({
    caller_number: '+919999000000',
    caller_name: 'Test Lead',
    agent_name: 'Test Agent',
    duration_seconds: 90
});

describe('Presales prompt: NUMBER REQUEST DETECTION section', () => {
    it('contains the NUMBER REQUEST DETECTION section header', () => {
        assert.ok(prompt.includes('NUMBER REQUEST DETECTION'), 'Missing NUMBER REQUEST DETECTION header');
    });

    it('mentions mobile number detection', () => {
        const lower = prompt.toLowerCase();
        assert.ok(lower.includes('mobile'), 'Missing "mobile" keyword');
    });

    it('mentions WhatsApp detection', () => {
        assert.ok(prompt.includes('WhatsApp'), 'Missing "WhatsApp" keyword');
    });

    it('mentions indirect contact request detection', () => {
        const lower = prompt.toLowerCase();
        assert.ok(
            lower.includes('how can i reach you') || lower.includes('indirect'),
            'Missing indirect contact request examples'
        );
    });

    it('mentions alternate number detection', () => {
        const lower = prompt.toLowerCase();
        assert.ok(
            lower.includes('alternate') || lower.includes('another number') || lower.includes('personal number'),
            'Missing alternate number detection'
        );
    });

    it('has DO NOT FLAG exemptions for legitimate callback language', () => {
        assert.ok(
            prompt.includes('DO NOT FLAG') || prompt.includes("call you back on this number"),
            'Missing DO NOT FLAG exemptions'
        );
    });

    it('outputs number_requests with detected boolean and instances array', () => {
        assert.ok(prompt.includes('"number_requests"'), 'Missing number_requests in output schema');
        assert.ok(prompt.includes('"detected"'), 'Missing detected field in number_requests');
        assert.ok(prompt.includes('"instances"'), 'Missing instances array in number_requests');
    });

    it('each instance includes reason, time, transcript_excerpt, start_time_ms, end_time_ms', () => {
        assert.ok(prompt.includes('"reason"'), 'Missing reason field in instance');
        assert.ok(prompt.includes('"time"'), 'Missing time field in instance');
        assert.ok(prompt.includes('"transcript_excerpt"'), 'Missing transcript_excerpt in instance');
        assert.ok(prompt.includes('"start_time_ms"'), 'Missing start_time_ms in instance');
        assert.ok(prompt.includes('"end_time_ms"'), 'Missing end_time_ms in instance');
    });

    it('instructs EXTREMELY strict detection', () => {
        const lower = prompt.toLowerCase();
        assert.ok(
            lower.includes('extremely strict') || lower.includes('very strict') || lower.includes('no exceptions'),
            'Missing strictness instruction'
        );
    });
});
