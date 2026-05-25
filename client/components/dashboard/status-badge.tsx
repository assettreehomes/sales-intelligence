import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const statusBadgeVariants = cva(
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide',
    {
        variants: {
            status: {
                active: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
                inactive: 'border-slate-500/35 bg-slate-500/14 text-slate-300',
                online: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
                offline: 'border-slate-500/35 bg-slate-500/14 text-slate-300',
                idle: 'border-sky-500/30 bg-sky-500/15 text-sky-300',
                pending: 'border-amber-500/35 bg-amber-500/16 text-amber-300',
                accepted: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
                rejected: 'border-rose-500/35 bg-rose-500/16 text-rose-300',
                recording: 'border-rose-500/35 bg-rose-500/16 text-rose-300',
                neutral: 'border-[var(--color-border-subtle)] bg-[var(--surface-hover)] text-[var(--color-text-muted)]'
            },
            size: {
                sm: 'px-2 py-0.5 text-[11px]',
                md: 'px-2.5 py-1 text-xs'
            }
        },
        defaultVariants: {
            status: 'neutral',
            size: 'md'
        }
    }
);

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof statusBadgeVariants> {
    dot?: boolean;
}

export function StatusBadge({ status, size, dot = false, className, children, ...props }: StatusBadgeProps) {
    return (
        <span className={cn(statusBadgeVariants({ status, size }), className)} {...props}>
            {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
            {children}
        </span>
    );
}
