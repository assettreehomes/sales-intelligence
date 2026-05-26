import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--semantic-primary),transparent_65%)] focus:ring-offset-2',
    {
        variants: {
            variant: {
                default: 'border-transparent bg-[var(--semantic-primary-soft)] text-[var(--semantic-primary)]',
                success: 'border-transparent bg-[var(--semantic-success-soft)] text-[var(--color-success-strong)]',
                destructive: 'border-transparent bg-[var(--semantic-danger-soft)] text-[var(--color-critical-strong)]',
                warning: 'border-transparent bg-[var(--semantic-warning-soft)] text-[var(--color-warning-strong)]',
                secondary: 'border-transparent bg-[var(--surface-hover)] text-[var(--semantic-text-secondary)]',
                outline: 'border-[var(--semantic-border-strong)] text-[var(--semantic-text-primary)]'
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
