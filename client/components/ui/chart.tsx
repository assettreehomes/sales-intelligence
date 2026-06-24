'use client';

import * as React from 'react';
import { ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

// ── ChartConfig type ───────────────────────────────────────────────────────────

export type ChartConfig = {
    [k in string]: {
        label?: React.ReactNode;
        icon?: React.ComponentType;
        color?: string;
    };
};

// ── Context ────────────────────────────────────────────────────────────────────

type ChartContextValue = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart() {
    const ctx = React.useContext(ChartContext);
    if (!ctx) throw new Error('useChart must be used inside <ChartContainer>');
    return ctx;
}

// ── ChartContainer ─────────────────────────────────────────────────────────────
// Injects CSS custom properties for every color in the config so recharts
// components can reference them as var(--color-<key>).

export const ChartContainer = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'> & { config: ChartConfig; children: React.ReactNode }
>(({ config, className, children, ...props }, ref) => {
    const cssVars = Object.entries(config).reduce<Record<string, string>>((acc, [key, value]) => {
        if (value.color) acc[`--color-${key}`] = value.color;
        return acc;
    }, {});

    return (
        <ChartContext.Provider value={{ config }}>
            <div
                ref={ref}
                style={cssVars as React.CSSProperties}
                className={cn(
                    '[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground',
                    '[&_.recharts-cartesian-grid_line[stroke]]:stroke-border/50',
                    '[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border',
                    '[&_.recharts-polar-grid_[stroke]]:stroke-border',
                    '[&_.recharts-radial-bar-background-sector]:fill-muted',
                    '[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted',
                    '[&_.recharts-reference-line_[stroke]]:stroke-border',
                    '[&_.recharts-sector[stroke]]:stroke-transparent',
                    '[&_.recharts-surface]:overflow-visible',
                    className
                )}
                {...props}
            >
                <ResponsiveContainer width="100%" height="100%">
                    {children as React.ReactElement}
                </ResponsiveContainer>
            </div>
        </ChartContext.Provider>
    );
});
ChartContainer.displayName = 'ChartContainer';

// ── ChartTooltip ───────────────────────────────────────────────────────────────

export const ChartTooltip = Tooltip;

// ── ChartTooltipContent ────────────────────────────────────────────────────────

export const ChartTooltipContent = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'> & {
        active?: boolean;
        payload?: { name: string; value: number; dataKey?: string; color?: string; fill?: string }[];
        label?: string;
        hideLabel?: boolean;
        nameKey?: string;
        indicator?: 'line' | 'dot';
        labelFormatter?: (value: string, payload: unknown[]) => React.ReactNode;
        formatter?: (value: number, name: string) => React.ReactNode;
    }
>(({ active, payload, label, hideLabel = false, nameKey, labelFormatter, formatter, className, ...props }, ref) => {
    const { config } = useChart();

    if (!active || !payload?.length) return null;

    return (
        <div
            ref={ref}
            className={cn(
                'rounded-xl border border-border bg-background/95 px-3 py-2.5 shadow-xl backdrop-blur-sm',
                className
            )}
            {...props}
        >
            {!hideLabel && label && (
                <p className="mb-1.5 text-xs font-semibold text-foreground">
                    {labelFormatter ? labelFormatter(label, payload) : label}
                </p>
            )}
            <div className="space-y-1">
                {payload.map((item, i) => {
                    // item.name is always the category label recharts resolves from nameKey
                    // item.fill is set on pie slices; item.color on lines
                    const color = item.fill ?? item.color;
                    const displayName = item.name;

                    return (
                        <div key={i} className="flex items-center justify-between gap-4 text-xs">
                            <span className="flex items-center gap-1.5">
                                <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ background: color }}
                                />
                                <span className="text-muted-foreground">{displayName}</span>
                            </span>
                            <span className="font-bold tabular-nums text-foreground">
                                {formatter ? formatter(item.value, item.name) : item.value.toLocaleString('en-IN')}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
ChartTooltipContent.displayName = 'ChartTooltipContent';
