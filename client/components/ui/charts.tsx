'use client';

import {
    Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart,
    ComposedChart, Line,
    RadarChart, Radar, PolarGrid, PolarAngleAxis,
    ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
    Legend,
} from 'recharts';

// ─── Theme tokens ───────────────────────────────────────────────────
export const CHART_COLORS = {
    purple:    '#8b5cf6',
    purpleDim: '#6d28d9',
    purpleGlow:'rgba(139,92,246,0.18)',
    emerald:   '#10b981',
    red:       '#ef4444',
    amber:     '#f59e0b',
    muted:     'var(--chart-muted, rgba(139,92,246,0.12))',
    grid:      'var(--chart-grid, rgba(139,92,246,0.18))',
    text:      'var(--chart-text, rgba(30,16,64,0.6))',
    textStrong:'var(--chart-text-strong, rgba(30,16,64,0.9))',
};

// Outcome colors
export const OUTCOME_COLORS: Record<string, string> = {
    interested:        CHART_COLORS.emerald,
    not_interested:    CHART_COLORS.red,
    follow_up_required:CHART_COLORS.amber,
};

// ─── Custom Tooltip ─────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, formatter }: {
    active?: boolean;
    payload?: { name: string; value: number; color?: string }[];
    label?: string;
    formatter?: (v: number, name: string) => string;
}) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border px-3 py-2 shadow-xl text-xs"
            style={{ background: 'var(--chart-tooltip-bg, #1a0f2e)', borderColor: 'var(--chart-tooltip-border, rgba(139,92,246,0.4))', color: 'var(--chart-text-strong, #fff)' }}>
            {label && <p className="mb-1 font-semibold" style={{ color: CHART_COLORS.textStrong }}>{label}</p>}
            {payload.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color || CHART_COLORS.purple }} />
                    <span style={{ color: CHART_COLORS.text }}>{p.name}:</span>
                    <span className="font-bold" style={{ color: CHART_COLORS.textStrong }}>
                        {formatter ? formatter(p.value, p.name) : p.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ─── Outcome Pie / Donut ─────────────────────────────────────────────
interface OutcomeDonutProps {
    interested: number;
    not_interested: number;
    follow_up_required: number;
    height?: number;
}

export function OutcomeDonutChart({ interested, not_interested, follow_up_required, height = 220 }: OutcomeDonutProps) {
    const data = [
        { name: 'Interested',     value: interested,         color: CHART_COLORS.emerald },
        { name: 'Not Interested', value: not_interested,     color: CHART_COLORS.red },
        { name: 'Follow-up',      value: follow_up_required, color: CHART_COLORS.amber },
    ].filter(d => d.value > 0);

    const total = interested + not_interested + follow_up_required;

    if (!total) return (
        <div className="flex items-center justify-center" style={{ height }}>
            <p className="text-sm" style={{ color: CHART_COLORS.text }}>No outcome data yet</p>
        </div>
    );

    return (
        <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius="55%"
                        outerRadius="80%"
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                    >
                        {data.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => (
                            <span style={{ color: CHART_COLORS.textStrong, fontSize: 12 }}>{value}</span>
                        )}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── Authenticity Bar ────────────────────────────────────────────────
interface AuthenticityBarProps {
    real: number;
    fake: number;
    height?: number;
}

export function AuthenticityBarChart({ real, fake, height = 180 }: AuthenticityBarProps) {
    const data = [
        { name: 'Real', value: real, fill: CHART_COLORS.emerald },
        { name: 'Fake', value: fake, fill: CHART_COLORS.red },
    ];
    return (
        <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} barCategoryGap="40%" margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                    <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                    <XAxis dataKey="name" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(139,92,246,0.08)' }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── Daily Trend Bar ─────────────────────────────────────────────────
interface DailyTrendProps {
    data: { date: string; count: number }[];
    height?: number;
}

export function DailyTrendChart({ data, height = 160 }: DailyTrendProps) {
    const formatted = data.slice(-30).map(d => ({
        date: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        Calls: d.count,
    }));
    return (
        <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={formatted} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                    <defs>
                        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a855f7" />
                            <stop offset="100%" stopColor="#6d28d9" />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                    <XAxis dataKey="date" tick={{ fill: CHART_COLORS.text, fontSize: 9 }} axisLine={false} tickLine={false}
                        interval={Math.floor(formatted.length / 6)} />
                    <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(139,92,246,0.08)' }} />
                    <Bar dataKey="Calls" fill="url(#barGrad)" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── Area Chart (Rating Trend) ───────────────────────────────────────
interface AreaTrendProps {
    data: { date: string; rating: number | null; tickets: number }[];
    height?: number;
}

export function RatingTrendChart({ data, height = 200 }: AreaTrendProps) {
    const formatted = data.map(d => ({
        date: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        Rating: d.rating ?? 0,
        Tickets: d.tickets,
    }));
    return (
        <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formatted} margin={{ top: 8, right: 8, bottom: 8, left: -20 }}>
                    <defs>
                        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke={CHART_COLORS.grid} />
                    <XAxis dataKey="date" tick={{ fill: CHART_COLORS.text, fontSize: 9 }} axisLine={false} tickLine={false}
                        interval={Math.floor(formatted.length / 5)} />
                    <YAxis domain={[0, 5]} tick={{ fill: CHART_COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip formatter={(v, n) => n === 'Rating' ? v.toFixed(2) : String(v)} />} />
                    <Area type="monotone" dataKey="Rating" stroke="#8b5cf6" strokeWidth={2}
                        fill="url(#areaGrad)" dot={false} activeDot={{ r: 4, fill: '#8b5cf6' }} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── Horizontal Bar (Employees by Rating) ────────────────────────────
interface HBarProps {
    data: { name: string; value: number }[];
    height?: number;
    color?: string;
    maxValue?: number;
}

export function HorizontalBarChart({ data, height, color = CHART_COLORS.purple, maxValue = 10 }: HBarProps) {
    const h = height ?? Math.max(140, data.length * 36 + 20);
    return (
        <div style={{ height: h }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }}>
                    <CartesianGrid horizontal={false} stroke={CHART_COLORS.grid} />
                    <XAxis type="number" domain={[0, maxValue]} tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                        axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: CHART_COLORS.textStrong, fontSize: 11 }}
                        axisLine={false} tickLine={false} width={80} />
                    <Tooltip content={<ChartTooltip formatter={(v) => v.toFixed(2)} />} cursor={{ fill: 'rgba(139,92,246,0.08)' }} />
                    <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} label={{ position: 'right', fill: CHART_COLORS.textStrong, fontSize: 11, formatter: (v: unknown) => typeof v === 'number' ? v.toFixed(1) : String(v) }} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── Radar Chart (Skills) ────────────────────────────────────────────
interface RadarProps {
    labels: string[];
    values: number[];
    size?: number;
    color?: string;
}

export function SkillRadarChart({ labels, values, size = 160, color = '#8b5cf6' }: RadarProps) {
    const data = labels.map((label, i) => ({ subject: label, value: values[i] ?? 0, fullMark: 10 }));
    return (
        <div style={{ width: size, height: size }}>
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                    <PolarGrid stroke={CHART_COLORS.grid} />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: CHART_COLORS.text, fontSize: 9 }} />
                    <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.25} strokeWidth={1.5} />
                    <Tooltip content={<ChartTooltip />} />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── Rating Distribution Bar ─────────────────────────────────────────
interface RatingDistProps {
    data: { label: string; count: number; color: string }[];
    height?: number;
}

export function RatingDistChart({ data, height = 200 }: RatingDistProps) {
    const formatted = data.map(d => ({ name: d.label, Count: d.count, fill: d.color }));
    return (
        <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={formatted} margin={{ top: 8, right: 8, bottom: 8, left: -20 }}>
                    <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                    <XAxis dataKey="name" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(139,92,246,0.08)' }} />
                    <Bar dataKey="Count" radius={[6, 6, 0, 0]}>
                        {formatted.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── Conversation Comparison Chart ───────────────────────────────────
interface ConversationComparisonPoint {
    label: string;
    Current: number;
    Previous: number;
}

interface ConversationComparisonChartProps {
    data: ConversationComparisonPoint[];
    height?: number;
}

export function ConversationComparisonChart({ data, height = 236 }: ConversationComparisonChartProps) {
    if (!data.length) {
        return (
            <div className="flex items-center justify-center text-sm" style={{ height, color: CHART_COLORS.text }}>
                No comparison data available
            </div>
        );
    }

    return (
        <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: -10 }}>
                    <defs>
                        <linearGradient id="convCurrentGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.45} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                    <XAxis
                        dataKey="label"
                        tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        angle={data.length > 6 ? -35 : 0}
                        textAnchor={data.length > 6 ? 'end' : 'middle'}
                        height={data.length > 6 ? 56 : 30}
                    />
                    <YAxis
                        domain={[0, 100]}
                        tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${v}`}
                    />
                    <Tooltip
                        content={
                            <ChartTooltip
                                formatter={(value) => `${Math.round(value)} / 100`}
                            />
                        }
                        cursor={{ fill: 'rgba(139,92,246,0.08)' }}
                    />
                    <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ paddingTop: 4 }}
                        formatter={(value) => (
                            <span style={{ color: CHART_COLORS.textStrong, fontSize: 12 }}>{value}</span>
                        )}
                    />
                    <Bar dataKey="Current" fill="url(#convCurrentGrad)" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    <Line
                        type="monotone"
                        dataKey="Previous"
                        stroke={CHART_COLORS.muted.toString().includes('var') ? 'rgba(139,92,246,0.55)' : CHART_COLORS.muted}
                        strokeDasharray="6 4"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: 'rgba(139,92,246,0.55)', stroke: 'none' }}
                        activeDot={{ r: 4, fill: 'rgba(139,92,246,0.8)' }}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}

interface PresalesTrendPoint {
    date: string;
    calls: number;
    fake_calls: number;
    interested_calls: number;
    conversion_rate: number;
}

interface PresalesMultiTrendChartProps {
    data: PresalesTrendPoint[];
    height?: number;
}

export function PresalesMultiTrendChart({ data, height = 220 }: PresalesMultiTrendChartProps) {
    const formatted = data.slice(-30).map((point) => ({
        date: new Date(point.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        Calls: point.calls,
        Fake: point.fake_calls,
        Interested: point.interested_calls,
        Conversion: Number(point.conversion_rate.toFixed(1))
    }));

    if (!formatted.length) {
        return (
            <div className="flex items-center justify-center text-sm" style={{ height, color: CHART_COLORS.text }}>
                No trend data yet
            </div>
        );
    }

    return (
        <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={formatted} margin={{ top: 8, right: 12, bottom: 8, left: -10 }}>
                    <defs>
                        <linearGradient id="presalesCallsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.45} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                    <XAxis
                        dataKey="date"
                        tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval={Math.floor(formatted.length / 6)}
                    />
                    <YAxis
                        yAxisId="volume"
                        tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        yAxisId="rate"
                        orientation="right"
                        domain={[0, 100]}
                        tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip
                        content={
                            <ChartTooltip
                                formatter={(value, name) => {
                                    if (name === 'Conversion') return `${value.toFixed(1)}%`;
                                    return String(value);
                                }}
                            />
                        }
                        cursor={{ fill: 'rgba(139,92,246,0.08)' }}
                    />
                    <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ paddingTop: 4 }}
                        formatter={(value) => <span style={{ color: CHART_COLORS.textStrong, fontSize: 12 }}>{value}</span>}
                    />
                    <Bar yAxisId="volume" dataKey="Calls" fill="url(#presalesCallsGrad)" radius={[6, 6, 0, 0]} maxBarSize={34} />
                    <Line
                        yAxisId="volume"
                        type="monotone"
                        dataKey="Fake"
                        stroke={CHART_COLORS.red}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3, fill: CHART_COLORS.red }}
                    />
                    <Line
                        yAxisId="volume"
                        type="monotone"
                        dataKey="Interested"
                        stroke={CHART_COLORS.emerald}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3, fill: CHART_COLORS.emerald }}
                    />
                    <Line
                        yAxisId="rate"
                        type="monotone"
                        dataKey="Conversion"
                        stroke={CHART_COLORS.amber}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3, fill: CHART_COLORS.amber }}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
