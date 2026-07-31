'use client';

import { MessageCircle, Phone } from 'lucide-react';
import { inferActionCta } from './ticket-detail-utils';

export interface TicketNextStepProps {
    index: number;
    text: string;
}

export function TicketNextStep({ index, text }: TicketNextStepProps) {
    const cta = inferActionCta(text);

    let action: React.ReactNode = null;

    if (cta.type === 'whatsapp' && cta.href) {
        action = (
            <a className="ci-nextstep__cta" href={cta.href} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5" /> {cta.label}
            </a>
        );
    } else if (cta.type === 'phone' && cta.href) {
        action = (
            <a className="ci-nextstep__cta" href={cta.href}>
                <Phone className="h-3.5 w-3.5" /> {cta.label}
            </a>
        );
    }

    return (
        <div className="ci-nextstep">
            <span className="ci-nextstep__index" aria-hidden>{index}</span>
            <p className="ci-nextstep__text">{text}</p>
            {action}
        </div>
    );
}
