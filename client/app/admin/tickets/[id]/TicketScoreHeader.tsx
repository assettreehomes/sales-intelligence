'use client';

import { Clock, Minus, TrendingDown, TrendingUp, Users } from 'lucide-react';
import {
    buildAiNarrative,
    buildSentimentBar,
    getOverallDelta,
    getScoreDelta,
    type TicketAnalysis,
} from './ticket-detail-utils';

export interface TicketScoreHeaderProps {
    analysis: TicketAnalysis | null;
    metricCards: {
        politeness: number;
        confidence: number;
        speakers: number;
        interestRaw: string;
        interestScore: number;
        ratingOutOf100: number;
    };
    clientLabel: string;
    agentLabel: string;
    callDuration?: number;
}

function formatDurationSeconds(seconds: number | undefined | null): string {
    if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '—';
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatInterest(raw: string): string {
    if (!raw) return '—';
    const v = raw.trim();
    if (!v || v.toLowerCase() === 'n/a') return 'N/A';
    return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

function interestTone(raw: string): 'high' | 'medium' | 'low' | 'na' {
    const v = (raw || '').trim().toLowerCase();
    if (v === 'high') return 'high';
    if (v === 'medium') return 'medium';
    if (v === 'low') return 'low';
    return 'na';
}

function TrendChip({ delta }: { delta: number | null }) {
    if (delta === null || delta === undefined) return null;
    const variant = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
    return (
        <span className={`ci-trend-chip ci-trend-chip--${variant}`}>
            <Icon className="h-3 w-3" />
            {delta > 0 ? `+${delta}` : delta}
        </span>
    );
}

function scoreRingColor(score: number): string {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#8b5cf6';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
}

export function TicketScoreHeader({ analysis, metricCards, clientLabel, agentLabel, callDuration }: TicketScoreHeaderProps) {
    const score = Math.max(0, Math.min(100, metricCards.ratingOutOf100));
    const ringColor = scoreRingColor(score);

    const radius = 44;
    const stroke = 8;
    const center = radius + stroke / 2;
    const size = (radius + stroke / 2) * 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - score / 100);

    const overallDelta = getOverallDelta(analysis?.comparisonwithprevious);
    const politenessDelta = getScoreDelta(analysis?.comparisonwithprevious, 'politeness');
    const confidenceDelta = getScoreDelta(analysis?.comparisonwithprevious, 'confidence');

    const sentiment = buildSentimentBar(analysis);
    const narrative = buildAiNarrative(analysis);

    const outcome = analysis?.call_outcome;
    const authenticity = analysis?.call_authenticity;
    const speakers = metricCards.speakers;

    return (
        <section className="ci-scorehead" aria-label="AI score overview">
            <div className="ci-scorehead__ring">
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    <defs>
                        <linearGradient id="ci-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={ringColor} stopOpacity="0.95" />
                            <stop offset="100%" stopColor={ringColor} stopOpacity="0.65" />
                        </linearGradient>
                    </defs>
                    <circle cx={center} cy={center} r={radius} stroke="rgba(148,163,184,0.18)" strokeWidth={stroke} fill="none" />
                    <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        stroke="url(#ci-ring-grad)"
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        fill="none"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        transform={`rotate(-90 ${center} ${center})`}
                        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }}
                    />
                    <text x={center} y={center - 2} textAnchor="middle" fontSize="26" fontWeight="700" fill="currentColor">
                        {score}
                    </text>
                    <text x={center} y={center + 18} textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="600" letterSpacing="0.08em">
                        AI SCORE
                    </text>
                </svg>
            </div>

            <div className="ci-scorehead__center">
                <div className="ci-scorehead__chips">
                    {outcome && (
                        <span className={`ci-pill ci-pill--${outcome === 'interested' ? 'success' : outcome === 'not_interested' ? 'danger' : 'warn'}`}>
                            {outcome.replaceAll('_', ' ')}
                        </span>
                    )}
                    {authenticity && (
                        <span className={`ci-pill ${authenticity === 'fake' ? 'ci-pill--danger' : 'ci-pill--neutral'}`}>
                            {authenticity === 'fake' ? 'Low authenticity' : 'Real call'}
                        </span>
                    )}
                    <span className="ci-pill ci-pill--neutral inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {speakers} speakers
                    </span>
                    {typeof callDuration === 'number' && callDuration > 0 && (
                        <span className="ci-pill ci-pill--neutral inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {formatDurationSeconds(callDuration)}
                        </span>
                    )}
                    <TrendChip delta={overallDelta} />
                </div>

                <div>
                    <div className="ci-scorehead__client">{clientLabel}</div>
                    <div className="ci-scorehead__client-meta">Agent · {agentLabel}</div>
                </div>

                <div>
                    <div className="ci-sentimentbar">
                        <div className="ci-sentimentbar__seg--pos" style={{ width: `${sentiment.positive}%` }} />
                        <div className="ci-sentimentbar__seg--neu" style={{ width: `${sentiment.neutral}%` }} />
                        <div className="ci-sentimentbar__seg--neg" style={{ width: `${sentiment.negative}%` }} />
                    </div>
                    <div className="ci-sentimentbar__legend">
                        <span>Positive {sentiment.positive}%</span>
                        <span>Neutral {sentiment.neutral}%</span>
                        <span>Negative {sentiment.negative}%</span>
                    </div>
                </div>
            </div>

            <div className="ci-scorehead__side">
                <div className="ci-scorehead__metric">
                    <div className="ci-scorehead__metric-value">{metricCards.politeness}%</div>
                    <div className="ci-scorehead__metric-label">Politeness</div>
                    {politenessDelta !== null && (
                        <div className="mt-1 flex justify-end"><TrendChip delta={politenessDelta} /></div>
                    )}
                </div>
                <div className="ci-scorehead__metric">
                    <div className="ci-scorehead__metric-value">{metricCards.confidence}%</div>
                    <div className="ci-scorehead__metric-label">Confidence</div>
                    {confidenceDelta !== null && (
                        <div className="mt-1 flex justify-end"><TrendChip delta={confidenceDelta} /></div>
                    )}
                </div>
                <div className={`ci-scorehead__metric ci-scorehead__metric--interest ci-scorehead__metric--interest-${interestTone(metricCards.interestRaw)}`}>
                    <div className="ci-scorehead__metric-value ci-scorehead__interest-value">
                        <span className="ci-scorehead__interest-dot" aria-hidden />
                        {formatInterest(metricCards.interestRaw)}
                    </div>
                    <div className="ci-scorehead__metric-label">Interest</div>
                </div>
            </div>

            <div className="ci-scorehead__narrative">
                <span aria-hidden>✨</span>
                <span>{narrative}</span>
            </div>
        </section>
    );
}
