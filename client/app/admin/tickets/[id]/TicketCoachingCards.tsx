'use client';

import { Sparkles } from 'lucide-react';

export interface TicketCoachingCardsProps {
    suggestions: string[];
}

function splitTitleBody(text: string): { title: string; body?: string } {
    const sentences = text.split(/(?<=[.!?])\s+/);
    if (sentences.length <= 1) return { title: text };
    return { title: sentences[0], body: sentences.slice(1).join(' ') };
}

export function TicketCoachingCards({ suggestions }: TicketCoachingCardsProps) {
    if (!suggestions.length) return null;
    return (
        <section className="ci-panel">
            <header className="ci-panel__head">
                <Sparkles className="h-5 w-5 text-amber-500" />
                <h2 className="ci-panel__title">Coaching insights</h2>
            </header>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {suggestions.map((s, i) => {
                    const { title, body } = splitTitleBody(s);
                    return (
                        <div key={i} className={`ci-coaching-card ${i % 2 === 1 ? 'ci-coaching-card--alt' : ''}`}>
                            <span className="ci-coaching-card__num">{i + 1}</span>
                            <div>
                                <p className="ci-coaching-card__text">{title}</p>
                                {body && <p className="ci-coaching-card__sub">{body}</p>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
