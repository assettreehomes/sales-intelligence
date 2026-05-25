import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SectionCardProps {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
}

export function SectionCard({ title, subtitle, icon, actions, children, className, contentClassName }: SectionCardProps) {
    return (
        <Card className={cn('border-[var(--color-border-subtle)] bg-[var(--surface-card)]', className)}>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <CardTitle className="inline-flex items-center gap-2 text-lg">
                            {icon ? <span className="text-[var(--color-primary-400)]">{icon}</span> : null}
                            {title}
                        </CardTitle>
                        {subtitle ? <p className="text-sm text-[var(--color-text-muted)]">{subtitle}</p> : null}
                    </div>
                    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
                </div>
            </CardHeader>
            <CardContent className={cn('pt-0', contentClassName)}>{children}</CardContent>
        </Card>
    );
}
