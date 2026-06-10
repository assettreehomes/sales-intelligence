/**
 * Tasks #11, #14 — validatePresalesAnalysis tests
 * Covers the new number_requests instances schema and re-analyze compatibility.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePresalesAnalysis } from '../services/presalesAnalysis.js';

// Minimal valid analysis object that passes all checks
function validAnalysis(overrides = {}) {
    return {
        summary: 'Agent called the lead and discussed property options.',
        overall_score: 7,
        scores: {
            rapport_building: 7,
            needs_discovery: 6,
            objection_handling: 5,
            closing_techniques: 6,
            product_knowledge: 8,
            professionalism: 7,
            politeness: 70,
            confidence: 65,
            interest: 'medium',
            speakers: 2
        },
        lead_qualification: {
            budget_discussed: true,
            budget_range: '80-100L',
            timeline_discussed: true,
            timeline: '6 months',
            purpose: 'investment',
            location_preference_discussed: true,
            appointment_secured: false,
            appointment_details: null,
            lead_quality: 'warm'
        },
        key_moments: [
            {
                label: 'Budget confirmation',
                category: 'qualification',
                start_time_ms: 15000,
                end_time_ms: 25000,
                transcript_excerpt: 'Agent asked about budget and lead confirmed 80 lakhs.',
                importance: 'high',
                coaching_note: 'Good qualification question.'
            }
        ],
        objections: [],
        action_items: ['Send brochure by EOD'],
        recommendations: ['Follow up in 2 days'],
        call_outcome: 'interested',
        call_authenticity: 'real',
        call_duration_seconds: 90,
        speakers_detected: 2,
        language_detected: 'English',
        comparison_with_previous: null,
        number_requests: { detected: false, instances: [] },
        ...overrides
    };
}

describe('validatePresalesAnalysis: number_requests schema (Task #11)', () => {
    it('passes when number_requests has detected=false and empty instances', () => {
        const result = validatePresalesAnalysis(validAnalysis());
        assert.ok(result, 'Expected valid analysis to pass');
    });

    it('passes when number_requests has detected=true with one valid instance', () => {
        const result = validatePresalesAnalysis(validAnalysis({
            number_requests: {
                detected: true,
                instances: [
                    {
                        reason: 'Agent asked for WhatsApp number to send brochure.',
                        time: '1:15',
                        transcript_excerpt: 'Can you share your WhatsApp number sir?',
                        start_time_ms: 75000,
                        end_time_ms: 79000
                    }
                ]
            }
        }));
        assert.ok(result, 'Expected analysis with one instance to pass');
    });

    it('passes when number_requests has multiple instances', () => {
        const result = validatePresalesAnalysis(validAnalysis({
            number_requests: {
                detected: true,
                instances: [
                    {
                        reason: 'Agent asked for mobile number.',
                        time: '0:45',
                        transcript_excerpt: 'What is your mobile number?',
                        start_time_ms: 45000,
                        end_time_ms: 49000
                    },
                    {
                        reason: 'Agent asked again for WhatsApp.',
                        time: '2:10',
                        transcript_excerpt: 'Can I get your WhatsApp number?',
                        start_time_ms: 130000,
                        end_time_ms: 135000
                    }
                ]
            }
        }));
        assert.ok(result, 'Expected analysis with multiple instances to pass');
    });

    it('fails when number_requests is missing entirely', () => {
        const analysis = validAnalysis();
        delete analysis.number_requests;
        assert.throws(
            () => validatePresalesAnalysis(analysis),
            /number_requests/,
            'Expected error mentioning number_requests'
        );
    });

    it('fails when number_requests.detected is not a boolean', () => {
        assert.throws(
            () => validatePresalesAnalysis(validAnalysis({
                number_requests: { detected: 'yes', instances: [] }
            })),
            /number_requests\.detected/
        );
    });

    it('fails when number_requests.instances is not an array', () => {
        assert.throws(
            () => validatePresalesAnalysis(validAnalysis({
                number_requests: { detected: false, instances: null }
            })),
            /number_requests\.instances/
        );
    });

    it('fails when an instance is missing reason', () => {
        assert.throws(
            () => validatePresalesAnalysis(validAnalysis({
                number_requests: {
                    detected: true,
                    instances: [
                        {
                            time: '1:00',
                            transcript_excerpt: 'Can I get your number?',
                            start_time_ms: 60000,
                            end_time_ms: 64000
                            // reason missing
                        }
                    ]
                }
            })),
            /number_requests\.instances\[0\]\.reason/
        );
    });

    it('fails when an instance is missing transcript_excerpt', () => {
        assert.throws(
            () => validatePresalesAnalysis(validAnalysis({
                number_requests: {
                    detected: true,
                    instances: [
                        {
                            reason: 'Agent asked for number.',
                            time: '1:00',
                            // transcript_excerpt missing
                            start_time_ms: 60000,
                            end_time_ms: 64000
                        }
                    ]
                }
            })),
            /number_requests\.instances\[0\]\.transcript_excerpt/
        );
    });

    it('fails when an instance has invalid start_time_ms', () => {
        assert.throws(
            () => validatePresalesAnalysis(validAnalysis({
                number_requests: {
                    detected: true,
                    instances: [
                        {
                            reason: 'Agent asked for number.',
                            time: '1:00',
                            transcript_excerpt: 'Can I get your number?',
                            start_time_ms: -100,  // invalid
                            end_time_ms: 64000
                        }
                    ]
                }
            })),
            /number_requests\.instances\[0\]\.start_time_ms/
        );
    });
});

describe('validatePresalesAnalysis: general validation (Task #14 — re-analyze compatibility)', () => {
    it('normalises call_outcome to lowercase', () => {
        const result = validatePresalesAnalysis(validAnalysis({ call_outcome: 'INTERESTED' }));
        assert.equal(result.call_outcome, 'interested');
    });

    it('normalises call_authenticity to lowercase', () => {
        const result = validatePresalesAnalysis(validAnalysis({ call_authenticity: 'REAL' }));
        assert.equal(result.call_authenticity, 'real');
    });

    it('fails when summary is missing', () => {
        assert.throws(
            () => validatePresalesAnalysis(validAnalysis({ summary: '' })),
            /summary/
        );
    });

    it('fails when overall_score is out of range', () => {
        assert.throws(
            () => validatePresalesAnalysis(validAnalysis({ overall_score: 15 })),
            /overall_score/
        );
    });

    it('fails when key_moments is empty array', () => {
        assert.throws(
            () => validatePresalesAnalysis(validAnalysis({ key_moments: [] })),
            /key_moments/
        );
    });

    it('fails when call_outcome is invalid', () => {
        assert.throws(
            () => validatePresalesAnalysis(validAnalysis({ call_outcome: 'maybe' })),
            /call_outcome/
        );
    });

    it('returns the full analysis object on success', () => {
        const input = validAnalysis();
        const result = validatePresalesAnalysis(input);
        assert.ok(result.scores);
        assert.ok(result.lead_qualification);
        assert.deepEqual(result.number_requests, { detected: false, instances: [] });
    });
});
