import { describe, it, expect } from 'vitest';
import {
    derivePresalesAgentName,
    derivePresalesTeamName,
    maskPhone,
    momentClock,
    normalizeActionItem,
    formatMsToClock,
    buildOpportunity,
    buildAiNarrative,
    deriveRiskLevel,
    severityFromMoment,
    skillBarTone,
} from './ticket-detail-utils';

// ── derivePresalesAgentName ───────────────────────────────────────────────────

describe('derivePresalesAgentName', () => {
    it('returns presales_agent.full_name when available', () => {
        expect(derivePresalesAgentName({
            presales_agent: { full_name: 'Sharmila Ath' },
            selldo_agent_name: 'Fallback Name',
        })).toBe('Sharmila Ath');
    });

    it('falls back to selldo_agent_name when presales_agent is null', () => {
        expect(derivePresalesAgentName({
            presales_agent: null,
            selldo_agent_name: 'Sharmila Ath',
        })).toBe('Sharmila Ath');
    });

    it('falls back to selldo_agent_name when presales_agent.full_name is whitespace', () => {
        expect(derivePresalesAgentName({
            presales_agent: { full_name: '  ' },
            selldo_agent_name: 'Sharmila Ath',
        })).toBe('Sharmila Ath');
    });

    it('falls back to selldo_agent_name when presales_agent has no full_name', () => {
        expect(derivePresalesAgentName({
            presales_agent: {},
            selldo_agent_name: 'Sharmila Ath',
        })).toBe('Sharmila Ath');
    });

    it('returns null when both are missing', () => {
        expect(derivePresalesAgentName({})).toBeNull();
    });

    it('returns null when both are null', () => {
        expect(derivePresalesAgentName({
            presales_agent: null,
            selldo_agent_name: null,
        })).toBeNull();
    });

    it('trims whitespace from presales_agent.full_name', () => {
        expect(derivePresalesAgentName({
            presales_agent: { full_name: '  Kanagalakshmi ATH  ' },
        })).toBe('Kanagalakshmi ATH');
    });

    it('trims whitespace from selldo_agent_name fallback', () => {
        expect(derivePresalesAgentName({
            selldo_agent_name: '  Suganya  ',
        })).toBe('Suganya');
    });
});

// ── derivePresalesTeamName ────────────────────────────────────────────────────

describe('derivePresalesTeamName', () => {
    it('returns presales_team.name when available', () => {
        expect(derivePresalesTeamName({
            presales_team: { name: 'Kaviya Team' },
            selldo_team_name: 'suganya',
        })).toBe('Kaviya Team');
    });

    it('falls back to selldo_team_name when presales_team is null', () => {
        expect(derivePresalesTeamName({
            presales_team: null,
            selldo_team_name: 'suganya',
        })).toBe('suganya');
    });

    it('falls back to selldo_team_name when presales_team.name is empty', () => {
        expect(derivePresalesTeamName({
            presales_team: { name: '' },
            selldo_team_name: 'suganya',
        })).toBe('suganya');
    });

    it('returns null when both are missing', () => {
        expect(derivePresalesTeamName({})).toBeNull();
    });

    it('returns null when both are null', () => {
        expect(derivePresalesTeamName({
            presales_team: null,
            selldo_team_name: null,
        })).toBeNull();
    });

    it('trims whitespace from presales_team.name', () => {
        expect(derivePresalesTeamName({
            presales_team: { name: '  Kaviya Team  ' },
        })).toBe('Kaviya Team');
    });
});

// ── maskPhone ─────────────────────────────────────────────────────────────────

describe('maskPhone', () => {
    it('masks a 12-digit number starting with 91', () => {
        expect(maskPhone('919840912567')).toBe('+91 98409 XXXXX');
    });

    it('masks a 10-digit number', () => {
        expect(maskPhone('9840912567')).toBe('98409 XXXXX');
    });

    it('returns Unknown for null', () => {
        expect(maskPhone(null)).toBe('Unknown');
    });

    it('returns Unknown for undefined', () => {
        expect(maskPhone(undefined)).toBe('Unknown');
    });

    it('returns Unknown for empty string', () => {
        expect(maskPhone('')).toBe('Unknown');
    });
});

// ── formatMsToClock ───────────────────────────────────────────────────────────

describe('formatMsToClock', () => {
    it('formats 0ms as 0:00', () => {
        expect(formatMsToClock(0)).toBe('0:00');
    });

    it('formats 90000ms as 1:30', () => {
        expect(formatMsToClock(90000)).toBe('1:30');
    });

    it('formats 65000ms as 1:05 with leading zero on seconds', () => {
        expect(formatMsToClock(65000)).toBe('1:05');
    });

    it('returns null for null', () => {
        expect(formatMsToClock(null)).toBeNull();
    });

    it('returns null for undefined', () => {
        expect(formatMsToClock(undefined)).toBeNull();
    });

    it('returns null for negative values', () => {
        expect(formatMsToClock(-1000)).toBeNull();
    });
});

// ── momentClock ───────────────────────────────────────────────────────────────

describe('momentClock', () => {
    it('returns 00:00 for null', () => {
        expect(momentClock(null)).toBe('00:00');
    });

    it('uses start_time_ms when available', () => {
        expect(momentClock({ start_time_ms: 90000 })).toBe('1:30');
    });

    it('falls back to time string when no start_time_ms', () => {
        expect(momentClock({ time: '2:15' })).toBe('2:15');
    });

    it('falls back to timestamp when no time or start_time_ms', () => {
        expect(momentClock({ timestamp: '3:45' })).toBe('3:45');
    });

    it('returns 00:00 when all fields are missing', () => {
        expect(momentClock({})).toBe('00:00');
    });
});

// ── normalizeActionItem ───────────────────────────────────────────────────────

describe('normalizeActionItem', () => {
    it('returns string items as-is', () => {
        expect(normalizeActionItem('Follow up tomorrow')).toBe('Follow up tomorrow');
    });

    it('extracts .item from object', () => {
        expect(normalizeActionItem({ item: 'Call back client' })).toBe('Call back client');
    });

    it('extracts .action from object', () => {
        expect(normalizeActionItem({ action: 'Send brochure' })).toBe('Send brochure');
    });

    it('extracts .title from object', () => {
        expect(normalizeActionItem({ title: 'Schedule visit' })).toBe('Schedule visit');
    });

    it('returns null for null', () => {
        expect(normalizeActionItem(null)).toBeNull();
    });

    it('returns null for empty object', () => {
        expect(normalizeActionItem({})).toBeNull();
    });
});

// ── deriveRiskLevel ───────────────────────────────────────────────────────────

describe('deriveRiskLevel', () => {
    it('returns high tone for fake call', () => {
        expect(deriveRiskLevel({ call_authenticity: 'fake' })).toMatchObject({ tone: 'high' });
    });

    it('returns high tone for not_interested outcome', () => {
        expect(deriveRiskLevel({ call_outcome: 'not_interested' })).toMatchObject({ tone: 'high' });
    });

    it('returns medium tone for follow_up_required', () => {
        expect(deriveRiskLevel({ call_outcome: 'follow_up_required' })).toMatchObject({ tone: 'medium' });
    });

    it('returns low tone for interested outcome', () => {
        expect(deriveRiskLevel({ call_outcome: 'interested' })).toMatchObject({ tone: 'low' });
    });

    it('returns medium tone for null analysis', () => {
        expect(deriveRiskLevel(null)).toMatchObject({ tone: 'medium' });
    });
});

// ── buildOpportunity ──────────────────────────────────────────────────────────

describe('buildOpportunity', () => {
    it('returns nurture message for interested outcome', () => {
        expect(buildOpportunity({ call_outcome: 'interested' })).toContain('nurture');
    });

    it('returns low likelihood message for not_interested', () => {
        expect(buildOpportunity({ call_outcome: 'not_interested' })).toContain('Low conversion');
    });

    it('returns moderate message for follow_up_required', () => {
        expect(buildOpportunity({ call_outcome: 'follow_up_required' })).toContain('Moderate');
    });

    it('returns inconclusive message for null analysis', () => {
        expect(buildOpportunity(null)).toContain('not yet conclusive');
    });
});

// ── buildAiNarrative ──────────────────────────────────────────────────────────

describe('buildAiNarrative', () => {
    it('returns analysing message for null analysis', () => {
        expect(buildAiNarrative(null)).toContain('analysing');
    });

    it('returns disengagement message for not_interested', () => {
        expect(buildAiNarrative({ call_outcome: 'not_interested' })).toContain('disengagement');
    });

    it('returns objection count message when multiple objections', () => {
        const result = buildAiNarrative({
            objections: ['price too high', 'bad location', 'no budget'],
        });
        expect(result).toContain('3 objections');
    });
});

// ── severityFromMoment ────────────────────────────────────────────────────────

describe('severityFromMoment', () => {
    it('returns buying signal for commitment category', () => {
        expect(severityFromMoment({ category: 'commitment' })).toMatchObject({ label: 'Buying signal' });
    });

    it('returns positive tone for positive category', () => {
        expect(severityFromMoment({ category: 'positive' })).toMatchObject({ tone: 'positive' });
    });

    it('returns strong tone for objection with high importance', () => {
        expect(severityFromMoment({ category: 'objection', importance: 'high' })).toMatchObject({ tone: 'strong' });
    });

    it('returns mild tone for objection with low importance', () => {
        expect(severityFromMoment({ category: 'objection', importance: 'low' })).toMatchObject({ tone: 'mild' });
    });

    it('returns neutral tone for unknown category', () => {
        expect(severityFromMoment({ category: 'unknown' })).toMatchObject({ tone: 'neutral' });
    });
});

// ── skillBarTone ──────────────────────────────────────────────────────────────

describe('skillBarTone', () => {
    it('returns zero for 0', () => expect(skillBarTone(0)).toBe('zero'));
    it('returns weak for 30', () => expect(skillBarTone(30)).toBe('weak'));
    it('returns mid for 50', () => expect(skillBarTone(50)).toBe('mid'));
    it('returns good for 70', () => expect(skillBarTone(70)).toBe('good'));
    it('returns strong for 90', () => expect(skillBarTone(90)).toBe('strong'));
});
