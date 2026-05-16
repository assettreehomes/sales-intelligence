import { HTMLAttributes } from 'react';

type BadgeVariant = 'default' | 'success' | 'destructive' | 'warning' | 'secondary' | 'outline';

const variantStyles: Record<BadgeVariant, { bg: string; text: string; ring: string }> = {
    default: {
        bg: 'rgba(103,40,142,0.10)',
        text: '#67288e',
        ring: 'rgba(103,40,142,0.25)',
    },
    success: {
        bg: 'rgba(5,150,105,0.10)',
        text: '#059669',
        ring: 'rgba(5,150,105,0.25)',
    },
    destructive: {
        bg: 'rgba(220,38,38,0.10)',
        text: '#dc2626',
        ring: 'rgba(220,38,38,0.20)',
    },
    warning: {
        bg: 'rgba(217,119,6,0.10)',
        text: '#d97706',
        ring: 'rgba(217,119,6,0.20)',
    },
    secondary: {
        bg: 'var(--surface-hover)',
        text: 'var(--color-text-secondary)',
        ring: 'var(--color-border-subtle)',
    },
    outline: {
        bg: 'transparent',
        text: 'var(--color-text-primary)',
        ring: 'var(--color-border-strong)',
    },
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
}

export function Badge({ variant = 'default', className = '', style, ...props }: BadgeProps) {
    const vs = variantStyles[variant];
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${className}`}
            style={{
                background: vs.bg,
                color: vs.text,
                boxShadow: `inset 0 0 0 1px ${vs.ring}`,
                ...style,
            }}
            {...props}
        />
    );
}
