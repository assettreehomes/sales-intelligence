'use client';

import { useMemo, useState } from 'react';
import { Code2 } from 'lucide-react';

export interface TicketJsonViewerProps {
    data: unknown;
    label?: string;
}

type Token = { type: 'key' | 'str' | 'num' | 'bool' | 'null' | 'text'; value: string };

const STRING_RE = /"(?:\\.|[^"\\])*"/g;
const NUM_RE = /\b-?\d+(?:\.\d+)?\b/g;

function highlight(jsonText: string): Token[] {
    const tokens: Token[] = [];
    let cursor = 0;
    const matches: Array<{ index: number; length: number; token: Token }> = [];

    let match: RegExpExecArray | null;
    STRING_RE.lastIndex = 0;
    while ((match = STRING_RE.exec(jsonText)) !== null) {
        const after = jsonText.slice(match.index + match[0].length).trimStart();
        const isKey = after.startsWith(':');
        matches.push({
            index: match.index,
            length: match[0].length,
            token: { type: isKey ? 'key' : 'str', value: match[0] },
        });
    }
    NUM_RE.lastIndex = 0;
    while ((match = NUM_RE.exec(jsonText)) !== null) {
        const overlaps = matches.some((m) => match!.index >= m.index && match!.index < m.index + m.length);
        if (!overlaps) {
            matches.push({ index: match.index, length: match[0].length, token: { type: 'num', value: match[0] } });
        }
    }

    const KEYWORDS: Array<{ word: string; type: Token['type'] }> = [
        { word: 'true', type: 'bool' },
        { word: 'false', type: 'bool' },
        { word: 'null', type: 'null' },
    ];
    for (const kw of KEYWORDS) {
        const re = new RegExp(`\\b${kw.word}\\b`, 'g');
        while ((match = re.exec(jsonText)) !== null) {
            const overlaps = matches.some((m) => match!.index >= m.index && match!.index < m.index + m.length);
            if (!overlaps) {
                matches.push({ index: match.index, length: match[0].length, token: { type: kw.type, value: match[0] } });
            }
        }
    }

    matches.sort((a, b) => a.index - b.index);

    for (const m of matches) {
        if (m.index > cursor) {
            tokens.push({ type: 'text', value: jsonText.slice(cursor, m.index) });
        }
        tokens.push(m.token);
        cursor = m.index + m.length;
    }
    if (cursor < jsonText.length) tokens.push({ type: 'text', value: jsonText.slice(cursor) });
    return tokens;
}

export function TicketJsonViewer({ data, label = 'Raw analysis JSON' }: TicketJsonViewerProps) {
    const [opened, setOpened] = useState(false);

    const jsonText = useMemo(() => {
        if (data === null || data === undefined) return 'null';
        try {
            return JSON.stringify(data, null, 2);
        } catch {
            return String(data);
        }
    }, [data]);

    const tokens = useMemo(() => (opened ? highlight(jsonText) : []), [opened, jsonText]);

    return (
        <details
            className="ci-json-accordion"
            open={opened}
            onToggle={(e) => setOpened((e.target as HTMLDetailsElement).open)}
        >
            <summary>
                <span className="inline-flex items-center gap-2">
                    <Code2 className="h-3.5 w-3.5" />
                    {label}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{opened ? 'Hide' : 'Show'}</span>
            </summary>
            {opened && (
                <pre className="ci-json">
                    {tokens.map((t, i) => {
                        if (t.type === 'text') return <span key={i}>{t.value}</span>;
                        return (
                            <span key={i} className={`tok-${t.type}`}>
                                {t.value}
                            </span>
                        );
                    })}
                </pre>
            )}
        </details>
    );
}
