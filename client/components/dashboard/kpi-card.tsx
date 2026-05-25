import { TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface KpiCardProps {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    meta?: string;
    trend?: {
        direction: 'up' | 'down' | 'flat';
        value: string;
    };
    footnote?: string;
    className?: string;
}

export function KpiCard({ label, value, icon, meta, trend, footnote, className }: KpiCardProps) {
    return (
        <Card className={cn('h-full border-[var(--color-border-subtle)] bg-[var(--surface-card)]', className)}>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] text-[var(--color-primary-400)]">
                        {icon}
                    </span>
                    <div className="space-y-2 text-right">
                        <CardTitle className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</CardTitle>
                        {meta ? <p className="text-[11px] font-medium text-[var(--color-text-muted)]">{meta}</p> : null}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-1">
                <p className="text-3xl font-bold leading-none text-[var(--color-text-primary)]">{value}</p>
                {trend ? (
                    <Badge
                        variant={trend.direction === 'up' ? 'success' : trend.direction === 'down' ? 'destructive' : 'secondary'}
                        className="mt-1 inline-flex gap-1"
                    >
                        {trend.direction === 'up' ? <TrendingUp className="h-3.5 w-3.5" /> : trend.direction === 'down' ? <TrendingDown className="h-3.5 w-3.5" /> : null}
                        {trend.value}
                    </Badge>
                ) : null}
                {footnote ? <p className="pt-1 text-xs text-[var(--color-text-muted)]">{footnote}</p> : null}
            </CardContent>
        </Card>
    );
}
