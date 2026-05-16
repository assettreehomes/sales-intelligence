import { HTMLAttributes } from 'react';

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
    value: number;
    max?: number;
    color?: string;
    trackColor?: string;
    size?: 'sm' | 'md' | 'lg';
}

const sizeMap = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' };

export function Progress({
    value,
    max = 100,
    color = 'var(--color-primary-500)',
    trackColor = 'var(--color-border-subtle)',
    size = 'md',
    className = '',
    style,
    ...props
}: ProgressProps) {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
        <div
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={max}
            className={`w-full overflow-hidden rounded-full ${sizeMap[size]} ${className}`}
            style={{ background: trackColor, ...style }}
            {...props}
        >
            <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${pct}%`, background: color }}
            />
        </div>
    );
}
