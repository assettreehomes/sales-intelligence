'use client';

import { Calendar, Copy, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useCallback, useState } from 'react';
import { inferActionCta } from './ticket-detail-utils';

export interface TicketNextStepProps {
    index: number;
    text: string;
}

export function TicketNextStep({ index, text }: TicketNextStepProps) {
    const cta = inferActionCta(text);
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(cta.text || text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            /* clipboard unavailable */
        }
    }, [cta.text, text]);

    let icon: React.ReactNode = null;
    let action: React.ReactNode = null;

    if (cta.type === 'whatsapp' && cta.href) {
        icon = <MessageCircle className="h-3.5 w-3.5" />;
        action = (
            <a className="ci-nextstep__cta" href={cta.href} target="_blank" rel="noopener noreferrer">
                {icon} {cta.label}
            </a>
        );
    } else if (cta.type === 'phone' && cta.href) {
        icon = <Phone className="h-3.5 w-3.5" />;
        action = (
            <a className="ci-nextstep__cta" href={cta.href}>
                {icon} {cta.label}
            </a>
        );
    } else if (cta.type === 'mail') {
        icon = <Mail className="h-3.5 w-3.5" />;
        action = (
            <button type="button" className="ci-nextstep__cta" onClick={handleCopy}>
                {icon} {copied ? 'Copied' : cta.label}
            </button>
        );
    } else if (cta.type === 'schedule') {
        icon = <Calendar className="h-3.5 w-3.5" />;
        action = (
            <button type="button" className="ci-nextstep__cta" onClick={handleCopy}>
                {icon} {copied ? 'Copied' : cta.label}
            </button>
        );
    } else if (cta.type === 'copy') {
        icon = <MapPin className="h-3.5 w-3.5" />;
        action = (
            <button type="button" className="ci-nextstep__cta" onClick={handleCopy}>
                {icon} {copied ? 'Copied' : cta.label}
            </button>
        );
    } else {
        action = (
            <button type="button" className="ci-nextstep__cta" onClick={handleCopy}>
                <Copy className="h-3.5 w-3.5" />
                {copied ? 'Copied' : 'Copy'}
            </button>
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
