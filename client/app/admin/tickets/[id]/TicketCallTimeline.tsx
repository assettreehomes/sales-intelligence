'use client';

import { Activity } from 'lucide-react';
import { deriveMomentCategory, momentClock, type TicketKeyMoment } from './ticket-detail-utils';

export interface TicketCallTimelineProps {
    moments: TicketKeyMoment[];
    duration?: number;
    onJump?: (time: string) => void;
}

function categoryLabel(cat: string): string {
    if (cat === 'objection') return 'Objection';
    if (cat === 'commitment') return 'Commitment';
    if (cat === 'qualification') return 'Qualification';
    if (cat === 'positive') return 'Positive';
    if (cat === 'negative') return 'Mismatch';
    return 'Moment';
}

function formatDuration(seconds: number | undefined): string {
    if (!seconds || !Number.isFinite(seconds)) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} total`;
}

export function TicketCallTimeline({ moments, duration, onJump }: TicketCallTimelineProps) {
    if (!moments.length) return null;
    return (
        <section className="ci-panel">
            <header className="ci-panel__head" style={{ justifyContent: 'space-between' }}>
                <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-violet-600" />
                    <h2 className="ci-panel__title">Call timeline</h2>
                </div>
                {duration && (
                    <span className="ci-timeline__chip">{formatDuration(duration)}</span>
                )}
            </header>
            <ol className="ci-timeline">
                {moments.map((m, i) => {
                    const cat = deriveMomentCategory(m);
                    const clock = momentClock(m);
                    const label = m.label || m.description || 'Moment';
                    const note = m.description;
                    return (
                        <li key={i} className="ci-timeline__item">
                            <span className={`ci-timeline__dot ci-timeline__dot--${cat}`} />
                            <div className="ci-timeline__head">
                                <button
                                    type="button"
                                    onClick={() => onJump?.(clock)}
                                    className="ci-timeline__label"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                                >
                                    {categoryLabel(cat)}
                                </button>
                                <span className="ci-timeline__chip">{clock}</span>
                            </div>
                            <p className="ci-timeline__text">{label}{note && note !== label ? ` — ${note}` : ''}</p>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
