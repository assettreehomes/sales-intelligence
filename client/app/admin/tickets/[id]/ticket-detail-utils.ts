export type TicketKeyMoment = {
    time?: string;
    timestamp?: string;
    label?: string;
    description?: string;
    category?: string;
    start_time_ms?: number;
};

export type TicketObjection = string | {
    objection?: string;
    response?: string;
    effectiveness?: string;
    resolved?: boolean;
};

export type TicketAnalysis = {
    summary?: string;
    rating?: number;
    scores?: { politeness?: number; confidence?: number; interest?: string; speakers?: number;[key: string]: unknown };
    customer_interest_level?: string;
    call_outcome?: string | null;
    call_authenticity?: string | null;
    objections?: TicketObjection[];
    actionitems?: unknown[];
    keymoments?: TicketKeyMoment[];
    comparisonwithprevious?: Record<string, unknown> | null;
};

export function derivePresalesAgentName(ticket: {
    presales_agent?: { full_name?: string } | null;
    selldo_agent_name?: string | null;
}): string | null {
    return ticket.presales_agent?.full_name?.trim() || ticket.selldo_agent_name?.trim() || null;
}

export function derivePresalesTeamName(ticket: {
    presales_team?: { name?: string } | null;
    selldo_team_name?: string | null;
}): string | null {
    return ticket.presales_team?.name?.trim() || ticket.selldo_team_name?.trim() || null;
}

export function maskPhone(num: string | null | undefined): string {
    if (!num) return 'Unknown';
    const str = String(num).replace(/\D/g, '');
    if (str.length === 12 && str.startsWith('91')) return `+91 ${str.slice(2, 7)} XXXXX`;
    if (str.length === 10) return `${str.slice(0, 5)} XXXXX`;
    return str.slice(0, -5) + 'XXXXX';
}

export function normalizeActionItem(item: unknown): string | null {
    if (!item) return null;
    if (typeof item === 'string') return item;
    if (typeof item === 'object' && item !== null) {
        const row = item as Record<string, unknown>;
        if (typeof row.item === 'string') return row.item;
        if (typeof row.action === 'string') return row.action;
        if (typeof row.title === 'string') return row.title;
    }
    return null;
}

export function deriveRiskLevel(analysis: TicketAnalysis | null): { label: string; tone: 'low' | 'medium' | 'high' } {
    const outcome = analysis?.call_outcome;
    const interest = String(analysis?.scores?.interest ?? analysis?.customer_interest_level ?? '').toLowerCase();
    const auth = analysis?.call_authenticity;

    if (auth === 'fake' || outcome === 'not_interested') return { label: 'High', tone: 'high' };
    if (outcome === 'follow_up_required' || interest === 'medium') return { label: 'Medium', tone: 'medium' };
    if (outcome === 'interested' || interest === 'high') return { label: 'Low', tone: 'low' };
    return { label: 'Medium', tone: 'medium' };
}

export function deriveSentimentLabel(analysis: TicketAnalysis | null): { label: string; trend?: string; tone: 'positive' | 'neutral' | 'negative' } {
    const interest = String(analysis?.scores?.interest ?? analysis?.customer_interest_level ?? 'N/A').toLowerCase();
    if (interest === 'high') return { label: 'Positive momentum', trend: 'Client engaged', tone: 'positive' };
    if (interest === 'low') return { label: 'Declining interest', trend: 'Re-engage required', tone: 'negative' };
    if (interest === 'medium') return { label: 'Cautious', trend: 'Needs nurturing', tone: 'neutral' };
    return { label: 'Not assessed', tone: 'neutral' };
}

export function buildExecutiveFields(analysis: TicketAnalysis | null) {
    const summary = (analysis?.summary || '').trim();
    const sentences = summary.split(/(?<=[.!?])\s+/).filter(Boolean);
    const mainObjectionRaw = analysis?.objections?.[0];
    const mainObjection =
        typeof mainObjectionRaw === 'string'
            ? mainObjectionRaw
            : mainObjectionRaw?.objection || null;

    const recommendedAction =
        analysis?.actionitems
            ?.map(normalizeActionItem)
            .find((item): item is string => Boolean(item)) ||
        'Schedule a focused follow-up to confirm next steps.';

    return {
        situation: sentences[0] || summary || 'No situation summary available yet.',
        context: sentences.slice(1, 3).join(' ') || null,
        mainObjection: mainObjection || 'No major objection captured in this call.',
        risk: deriveRiskLevel(analysis),
        recommendedAction,
    };
}

export function getScoreDelta(
    comparison: TicketAnalysis['comparisonwithprevious'] | null | undefined,
    key: string
): number | null {
    if (!comparison || typeof comparison !== 'object') return null;
    const raw = comparison as Record<string, unknown>;
    const changes = raw.score_changes as Record<string, { change?: number }> | undefined;
    const row = changes?.[key];
    return typeof row?.change === 'number' ? row.change : null;
}

export function getOverallDelta(
    comparison: TicketAnalysis['comparisonwithprevious'] | null | undefined
): number | null {
    if (!comparison || typeof comparison !== 'object') return null;
    const raw = comparison as Record<string, unknown>;
    if (typeof raw.delta_score === 'number') return raw.delta_score;
    return null;
}

const POSITIVE_CATS = new Set(['positive', 'commitment', 'qualification']);
const NEGATIVE_CATS = new Set(['negative', 'objection']);

export function deriveMomentCategory(m: TicketKeyMoment | null | undefined): string {
    if (!m) return 'neutral';
    const cat = String(m.category || '').toLowerCase();
    return cat || 'neutral';
}

export function severityFromMoment(m: TicketKeyMoment): { tone: 'strong' | 'mild' | 'positive' | 'neutral'; label: string } {
    const cat = deriveMomentCategory(m);
    const imp = String(m.importance || '').toLowerCase();
    if (POSITIVE_CATS.has(cat)) {
        if (cat === 'commitment') return { tone: 'positive', label: 'Buying signal' };
        if (cat === 'qualification') return { tone: 'positive', label: 'Qualification' };
        return { tone: 'positive', label: 'Positive moment' };
    }
    if (NEGATIVE_CATS.has(cat)) {
        if (cat === 'objection') {
            return imp === 'low'
                ? { tone: 'mild', label: 'Mild concern' }
                : { tone: 'strong', label: 'Strong objection' };
        }
        return { tone: 'strong', label: 'Negative moment' };
    }
    return { tone: 'neutral', label: 'Neutral moment' };
}

export function formatMsToClock(ms: number | undefined | null): string | null {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function momentClock(m: TicketKeyMoment | null | undefined): string {
    if (!m) return '00:00';
    return (
        formatMsToClock(m.start_time_ms) ||
        (m.time && /\d/.test(m.time) ? m.time : null) ||
        (m.timestamp && /\d/.test(m.timestamp) ? m.timestamp : null) ||
        '00:00'
    );
}

export function buildSentimentBar(analysis: TicketAnalysis | null): { positive: number; neutral: number; negative: number } {
    const moments = analysis?.keymoments || [];
    let pos = 0, neu = 0, neg = 0;
    moments.forEach((m) => {
        const cat = deriveMomentCategory(m);
        if (POSITIVE_CATS.has(cat)) pos += 1;
        else if (NEGATIVE_CATS.has(cat)) neg += 1;
        else neu += 1;
    });
    const total = pos + neu + neg;
    if (total === 0) {
        const interest = String(analysis?.scores?.interest ?? analysis?.customer_interest_level ?? '').toLowerCase();
        if (interest === 'high') return { positive: 65, neutral: 25, negative: 10 };
        if (interest === 'low') return { positive: 15, neutral: 30, negative: 55 };
        if (interest === 'medium') return { positive: 40, neutral: 40, negative: 20 };
        return { positive: 33, neutral: 34, negative: 33 };
    }
    return {
        positive: Math.round((pos / total) * 100),
        neutral: Math.round((neu / total) * 100),
        negative: Math.round((neg / total) * 100),
    };
}

export function buildOpportunity(analysis: TicketAnalysis | null): string {
    const interest = String(analysis?.scores?.interest ?? analysis?.customer_interest_level ?? '').toLowerCase();
    const outcome = analysis?.call_outcome;
    if (interest === 'high' || outcome === 'interested') return 'Warm engagement detected — nurture with timely follow-up.';
    if (interest === 'low' || outcome === 'not_interested') return 'Low conversion likelihood — qualify or deprioritise.';
    if (interest === 'medium' || outcome === 'follow_up_required') return 'Moderate interest — clarify needs before committing further effort.';
    return 'Opportunity not yet conclusive — extract more discovery on next contact.';
}

export function buildAiNarrative(analysis: TicketAnalysis | null): string {
    if (!analysis) return 'AI is still analysing this conversation.';
    const outcome = analysis.call_outcome;
    const interest = String(analysis.scores?.interest ?? analysis.customer_interest_level ?? '').toLowerCase();
    const objCount = analysis.objections?.length || 0;
    const positiveMoments = (analysis.keymoments || []).filter((m) => POSITIVE_CATS.has(deriveMomentCategory(m))).length;

    if (outcome === 'interested' && positiveMoments) return 'AI detected a strong purchase signal during the conversation.';
    if (outcome === 'not_interested') return 'AI flagged disengagement — prospect did not respond to value framing.';
    if (objCount > 1) return `AI detected ${objCount} objections — handling needs reinforcement.`;
    if (interest === 'high') return 'AI sees positive momentum — keep the conversation moving toward a commitment.';
    if (interest === 'low') return 'AI senses cooling interest — re-engagement requires a fresh angle.';
    return 'AI summary ready — review recommended actions to convert this conversation.';
}

export type NextStepCta = {
    type: 'whatsapp' | 'phone' | 'copy' | 'schedule' | 'mail' | 'none';
    label: string;
    href?: string;
    text?: string;
};

const PHONE_REGEX = /(\+?\d[\d\s\-()]{7,}\d)/;

export function inferActionCta(action: string): NextStepCta {
    const text = action.toLowerCase();
    const phoneMatch = action.match(PHONE_REGEX);
    const phone = phoneMatch ? phoneMatch[1].replace(/[^\d+]/g, '') : null;

    if (/whatsapp/.test(text) && phone) {
        return { type: 'whatsapp', label: 'Open WhatsApp', href: `https://wa.me/${phone.replace(/^\+/, '')}` };
    }
    if (/whatsapp/.test(text)) {
        return { type: 'whatsapp', label: 'Open WhatsApp', href: 'https://wa.me/' };
    }
    if (/(call|phone|dial|ring)/.test(text) && phone) {
        return { type: 'phone', label: 'Call', href: `tel:${phone}` };
    }
    if (/(maps|location|address|directions|share location|google maps)/.test(text)) {
        return { type: 'copy', label: 'Copy link', text: action };
    }
    if (/(visit|schedule|appointment|book|reminder|meeting|site visit|coordinate)/.test(text)) {
        return { type: 'schedule', label: 'Schedule' };
    }
    if (/(email|mail|send.*brochure)/.test(text)) {
        return { type: 'mail', label: 'Compose' };
    }
    if (/(share|send|forward)/.test(text)) {
        return { type: 'copy', label: 'Copy text', text: action };
    }
    return { type: 'none', label: '' };
}

export function skillBarTone(value: number): 'strong' | 'good' | 'mid' | 'weak' | 'zero' {
    if (value <= 0) return 'zero';
    if (value >= 80) return 'strong';
    if (value >= 60) return 'good';
    if (value >= 40) return 'mid';
    return 'weak';
}
