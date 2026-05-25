import { cn } from '@/lib/utils';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    eyebrow?: string;
    actions?: React.ReactNode;
    chips?: React.ReactNode;
    className?: string;
}

export function PageHeader({ title, subtitle, eyebrow, actions, chips, className }: PageHeaderProps) {
    return (
        <header
            className={cn(
                'relative overflow-hidden border-b border-[var(--color-border-subtle)] bg-[var(--surface-section)]/70 px-5 py-6 sm:px-8',
                className
            )}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_100%_0%,color-mix(in_srgb,var(--color-primary-glow),transparent_30%)_0%,transparent_60%)]" />
            <div className="relative mx-auto flex w-full max-w-[82rem] flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                    {eyebrow ? (
                        <p className="inline-flex rounded-full border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                            {eyebrow}
                        </p>
                    ) : null}
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">{title}</h1>
                        {subtitle ? <p className="mt-2 text-sm text-[var(--color-text-muted)] sm:text-base">{subtitle}</p> : null}
                    </div>
                    {chips ? <div className="flex flex-wrap items-center gap-2">{chips}</div> : null}
                </div>
                {actions ? <div className="flex w-full flex-wrap items-center justify-start gap-2 lg:w-auto lg:justify-end">{actions}</div> : null}
            </div>
        </header>
    );
}
