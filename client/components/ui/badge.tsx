import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-400)]/55 focus:ring-offset-2',
    {
        variants: {
            variant: {
                default: 'border-transparent bg-[color-mix(in_srgb,var(--color-primary-500),transparent_84%)] text-[var(--color-primary-500)]',
                success: 'border-transparent bg-[color-mix(in_srgb,var(--color-success-500),transparent_84%)] text-[var(--color-success-strong)]',
                destructive: 'border-transparent bg-[color-mix(in_srgb,var(--color-critical-500),transparent_84%)] text-[var(--color-critical-strong)]',
                warning: 'border-transparent bg-[color-mix(in_srgb,var(--color-warning-500),transparent_84%)] text-[var(--color-warning-strong)]',
                secondary: 'border-transparent bg-[var(--surface-hover)] text-[var(--color-text-secondary)]',
                outline: 'border-[var(--color-border-strong)] text-[var(--color-text-primary)]'
            }
        },
        defaultVariants: {
            variant: 'default'
        }
    }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
