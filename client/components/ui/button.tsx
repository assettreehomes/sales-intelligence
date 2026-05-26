import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--semantic-primary),transparent_65%)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
    {
        variants: {
            variant: {
                default:
                    'bg-[var(--semantic-primary)] text-white shadow-[var(--elevation-1)] hover:bg-[var(--semantic-primary-hover)]',
                secondary:
                    'border border-[var(--semantic-border)] bg-[var(--semantic-surface-elevated)] text-[var(--semantic-text-primary)] shadow-[var(--elevation-1)] hover:border-[var(--semantic-border-strong)] hover:bg-[var(--surface-hover)]',
                outline:
                    'border border-[var(--semantic-border)] bg-transparent text-[var(--semantic-text-primary)] hover:border-[var(--semantic-border-strong)] hover:bg-[var(--surface-hover)]',
                ghost:
                    'text-[var(--semantic-text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--semantic-text-primary)]',
                destructive:
                    'bg-[var(--semantic-danger)] text-white hover:bg-[var(--color-critical-strong)]'
            },
            size: {
                default: 'h-10 px-4 py-2',
                sm: 'h-9 rounded-lg px-3',
                lg: 'h-11 rounded-xl px-6',
                icon: 'h-10 w-10'
            }
        },
        defaultVariants: {
            variant: 'default',
            size: 'default'
        }
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
    }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
