'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface SegmentedToggleOption<T extends string> {
    value: T;
    label: string;
}

interface SegmentedToggleProps<T extends string> {
    value: T;
    onChange: (value: T) => void;
    options: SegmentedToggleOption<T>[];
    size?: 'sm' | 'md' | 'toolbar';
    /** default = rounded-lg; pill = fully rounded (performance dashboards) */
    shape?: 'default' | 'pill';
    className?: string;
    ariaLabel?: string;
}

export function SegmentedToggle<T extends string>({
    value,
    onChange,
    options,
    size = 'md',
    shape = 'default',
    className = '',
    ariaLabel,
}: SegmentedToggleProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRefs = useRef(new Map<T, HTMLButtonElement>());
    const [indicator, setIndicator] = useState({ left: 0, width: 0 });

    const updateIndicator = useCallback(() => {
        const container = containerRef.current;
        const activeBtn = buttonRefs.current.get(value);
        if (!container || !activeBtn) return;

        const containerRect = container.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        setIndicator({
            left: btnRect.left - containerRect.left,
            width: btnRect.width,
        });
    }, [value]);

    useLayoutEffect(() => {
        updateIndicator();
    }, [value, options, size, shape, updateIndicator]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver(() => updateIndicator());
        observer.observe(container);
        window.addEventListener('resize', updateIndicator);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateIndicator);
        };
    }, [updateIndicator]);

    const shapeClass = shape === 'pill' ? 'segmented-toggle--pill' : '';

    return (
        <div
            ref={containerRef}
            role="tablist"
            aria-label={ariaLabel}
            className={`segmented-toggle segmented-toggle--${size} ${shapeClass} ${className}`.trim()}
        >
            <span
                className="segmented-toggle__indicator"
                aria-hidden
                style={{
                    width: indicator.width,
                    transform: `translateX(${indicator.left}px)`,
                }}
            />
            {options.map((opt) => {
                const isActive = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        ref={(node) => {
                            if (node) buttonRefs.current.set(opt.value, node);
                            else buttonRefs.current.delete(opt.value);
                        }}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onChange(opt.value)}
                        className={`segmented-toggle__btn${isActive ? ' is-active' : ''}`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
