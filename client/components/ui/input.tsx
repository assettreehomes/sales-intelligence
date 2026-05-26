import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => {
    return (
        <input
            type={type}
            className={cn(
                'flex h-10 w-full rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-elevated)] px-3 py-2 text-sm text-[var(--semantic-text-primary)] shadow-[var(--elevation-1)] transition-colors placeholder:text-[var(--semantic-text-muted)] hover:border-[var(--semantic-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--semantic-primary),transparent_65%)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
                className
            )}
            ref={ref}
            {...props}
        />
    );
});
Input.displayName = 'Input';

export { Input };
