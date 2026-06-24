'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
    Bot,
    Camera,
    ChevronDown,
    Download,
    FileText,
    Filter,
    Loader2,
    PhoneCall,
    RefreshCw,
    Search,
    ShieldAlert,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import {
    CartesianGrid,
    Line,
    LineChart,
    Pie,
    PieChart,
    PolarAngleAxis,
    PolarGrid,
    Radar,
    RadarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart';

import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { API_URL } from '@/stores/authStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface OutcomeCounts {
    interested: number;
    not_interested: number;
    follow_up_required: number;
}

interface AuthenticityCounts {
    real: number;
    fake: number;
}

interface PerformanceBucket {
    id: string;
    label: string;
    email?: string | null;
    total_calls: number;
    analyzed_calls: number;
    avg_duration_seconds: number;
    avg_rating_10: number;
    outcome_counts: OutcomeCounts;
    authenticity_counts: AuthenticityCounts;
    number_requests: number;
    number_request_rate: number;
    team_leader?: { full_name: string; email?: string | null } | null;
}

interface OutcomeDataQuality {
    real: number;
    inferred: number;
    unclassified: number;
    total_analyzed: number;
    is_partial: boolean;
}

interface PresalesPerformance {
    period: string;
    summary: PerformanceBucket & { number_requests: number; number_request_rate: number };
    agents: PerformanceBucket[];
    teams: PerformanceBucket[];
    daily: Array<{
        date: string;
        count: number;
        fake: number;
        interested: number;
        follow_up: number;
        number_requests: number;
    }>;
    weekly: Array<{ week: string; count: number }>;
    outcome_data_quality?: OutcomeDataQuality;
}

type TableView = 'agents' | 'teams';
type TableSort = 'calls' | 'fake' | 'interested' | 'rating' | 'number_requests';
type RiskLevel = 'low' | 'medium' | 'high';
type Momentum = 'up' | 'flat' | 'down';

interface IntelligenceRow extends PerformanceBucket {
    risk_level: RiskLevel;
    risk_reason: string;
    momentum: Momentum;
    fake_rate: number;
    interested_rate: number;
    follow_up_rate: number;
    analyzed_rate: number;
    number_request_rate_pct: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PERIODS = [
    { key: 'today', label: 'Today' },
    { key: '7d',   label: '7 Days' },
    { key: '30d',  label: '30 Days' },
    { key: '90d',  label: '90 Days' },
    { key: 'all',  label: 'All Time' },
];

const SORT_LABELS: Record<TableSort, string> = {
    calls: 'calls',
    fake: 'fake risk',
    interested: 'interested',
    rating: 'rating',
    number_requests: 'number requests',
};

const CHART_LINES = [
    { key: 'total_calls',     label: 'Total Calls',  color: '#8b5cf6' },
    { key: 'real',            label: 'Real',         color: '#10b981' },
    { key: 'fake',            label: 'Fake',         color: '#ef4444' },
    { key: 'interested',      label: 'Interested',   color: '#22c55e' },
    { key: 'follow_up',       label: 'Follow-Up',    color: '#f59e0b' },
    { key: 'number_requests', label: 'Nr. Requests', color: '#f97316' },
] as const;

type ChartKey = typeof CHART_LINES[number]['key'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCount(value: number) {
    return new Intl.NumberFormat('en-IN').format(value);
}

function formatPercent(value: number) {
    return `${value.toFixed(1)}%`;
}

function formatDelta(value: number) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
}

function ratio(part: number, whole: number) {
    if (!whole) return 0;
    return part / whole;
}

// ── Business Logic ─────────────────────────────────────────────────────────────

function deriveIntelligenceRow(row: PerformanceBucket): IntelligenceRow {
    const interested   = row.outcome_counts.interested ?? 0;
    const notInterested = row.outcome_counts.not_interested ?? 0;
    const followUp     = row.outcome_counts.follow_up_required ?? 0;
    const fakeCalls    = row.authenticity_counts.fake ?? 0;

    const outcomeTotal   = interested + notInterested + followUp;
    const fakeRate       = ratio(fakeCalls, row.total_calls);
    const interestedRate = ratio(interested, outcomeTotal);
    const followUpRate   = ratio(followUp, outcomeTotal);
    const analyzedRate   = ratio(row.analyzed_calls, row.total_calls);

    let riskLevel: RiskLevel = 'low';
    let riskReason = 'Stable call quality and authenticity.';

    if (fakeRate >= 0.35 || row.avg_duration_seconds < 18) {
        riskLevel = 'high';
        riskReason = fakeRate >= 0.35
            ? 'High fake-call concentration detected.'
            : 'Call duration pattern looks suspicious.';
    } else if (fakeRate >= 0.2 || followUpRate >= 0.45 || row.avg_rating_10 < 3) {
        riskLevel = 'medium';
        riskReason = fakeRate >= 0.2
            ? 'Fake-call share is trending above baseline.'
            : followUpRate >= 0.45
              ? 'Follow-up backlog is elevated.'
              : 'Quality score below team baseline.';
    }

    let momentum: Momentum = 'flat';
    if (row.avg_rating_10 >= 6 && interestedRate >= 0.1 && fakeRate < 0.2) {
        momentum = 'up';
    } else if (row.avg_rating_10 < 3 || fakeRate >= 0.3) {
        momentum = 'down';
    }

    return {
        ...row,
        risk_level: riskLevel,
        risk_reason: riskReason,
        momentum,
        fake_rate: fakeRate,
        interested_rate: interestedRate,
        follow_up_rate: followUpRate,
        analyzed_rate: analyzedRate,
        number_request_rate_pct: row.number_request_rate ?? 0,
    };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function riskBadge(level: RiskLevel) {
    if (level === 'high')   return <Badge variant="destructive">High Risk</Badge>;
    if (level === 'medium') return <Badge variant="warning">Watch</Badge>;
    return <Badge variant="success">Stable</Badge>;
}

function momentumNode(momentum: Momentum) {
    if (momentum === 'up') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="h-3.5 w-3.5" />
                Improving
            </span>
        );
    }
    if (momentum === 'down') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                <ArrowDownRight className="h-3.5 w-3.5" />
                Declining
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <ArrowRight className="h-3.5 w-3.5" />
            Steady
        </span>
    );
}

function AgentAvatar({ name }: { name: string }) {
    const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '??';
    const palettes = ['bg-purple-600', 'bg-violet-600', 'bg-indigo-600', 'bg-fuchsia-600', 'bg-blue-600', 'bg-emerald-600'];
    const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palettes.length;
    return (
        <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src="" alt={name} />
            <AvatarFallback className={cn(palettes[idx], 'text-xs font-bold text-white')}>
                {initials}
            </AvatarFallback>
        </Avatar>
    );
}

// Custom recharts tooltip
function LineTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: { name: string; value: number; color: string }[];
    label?: string;
}) {
    if (!active || !payload?.length) return null;
    const dateStr = label
        ? new Date(label).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : '';
    return (
        <div className="rounded-xl border border-purple-500/40 bg-background/95 px-3 py-2.5 shadow-xl backdrop-blur-sm">
            {dateStr && <p className="mb-2 text-xs font-semibold text-purple-700 dark:text-purple-300">{dateStr}</p>}
            <div className="space-y-1">
                {payload.map((p) => (
                    <div key={p.name} className="flex items-center justify-between gap-5 text-xs">
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                            <span className="text-muted-foreground">{p.name}</span>
                        </span>
                        <span className="font-bold tabular-nums">{formatCount(p.value)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Chart config for today's pie — purple palette
const TODAY_CHART_CONFIG: ChartConfig = {
    value:         { label: 'Calls' },
    interested:    { label: 'Interested',     color: '#6d28d9' },
    follow_up:     { label: 'Follow-Up',      color: '#7c3aed' },
    not_interested:{ label: 'Not Interested', color: '#a78bfa' },
    fake:          { label: 'Fake',           color: '#c4b5fd' },
    unclassified:  { label: 'Unclassified',   color: '#ede9fe' },
};

// ── Main Component ─────────────────────────────────────────────────────────────

function PresalesPerformanceContent() {
    const { session } = useAuth();

    const [period, setPeriod]         = useState('today');
    const [view, setView]             = useState<TableView>('agents');
    const [query, setQuery]           = useState('');
    const [sortBy, setSortBy]         = useState<TableSort>('calls');
    const [showAllRows, setShowAllRows] = useState(false);
    const [data, setData]             = useState<PresalesPerformance | null>(null);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState('');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [activeLines, setActiveLines] = useState<Set<ChartKey>>(
        () => new Set(CHART_LINES.map((l) => l.key))
    );

    function toggleLine(key: ChartKey) {
        setActiveLines((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                if (next.size > 1) next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }

    const loadData = useCallback(
        async (selectedPeriod: string, silent = false) => {
            if (!session?.access_token) return;
            if (!silent) setLoading(true);
            setError('');
            try {
                const res = await fetch(`${API_URL}/analytics/presales-performance?period=${selectedPeriod}`, {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                });
                const payload = (await res.json()) as PresalesPerformance & { error?: string };
                if (!res.ok) throw new Error(payload.error || 'Failed to load pre-sales analytics');
                setData(payload);
                setLastUpdated(new Date());
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to load pre-sales analytics');
            } finally {
                if (!silent) setLoading(false);
            }
        },
        [session?.access_token]
    );

    useEffect(() => {
        void loadData(period);
        setShowAllRows(false);
    }, [period, loadData]);

    useEffect(() => {
        const timer = window.setInterval(() => void loadData(period, true), 60_000);
        return () => window.clearInterval(timer);
    }, [period, loadData]);

    // ── Derived values ────────────────────────────────────────────────────────

    const summary       = data?.summary;
    const totalCalls    = summary?.total_calls ?? 0;
    const analyzedCalls = summary?.analyzed_calls ?? 0;
    const interested    = summary?.outcome_counts.interested ?? 0;
    const notInterested = summary?.outcome_counts.not_interested ?? 0;
    const followUp      = summary?.outcome_counts.follow_up_required ?? 0;
    const outcomeTotal  = interested + notInterested + followUp;
    const realCalls     = summary?.authenticity_counts.real ?? 0;
    const fakeCalls     = summary?.authenticity_counts.fake ?? 0;

    const fakeRate        = ratio(fakeCalls, totalCalls) * 100;
    const conversionRate  = ratio(interested, totalCalls) * 100;
    const followUpRate    = ratio(followUp, outcomeTotal) * 100;
    const analyzedRate    = ratio(analyzedCalls, totalCalls) * 100;
    const outcomeCoverage = ratio(outcomeTotal, totalCalls) * 100;
    const authenticityRate = ratio(realCalls, realCalls + fakeCalls) * 100;
    const numberRequests  = summary?.number_requests ?? 0;
    const numberRequestRate = summary?.number_request_rate ?? 0;

    const trendDelta = useMemo(() => {
        const points = data?.daily ?? [];
        if (points.length < 4) return 0;
        const windowSize = Math.max(2, Math.min(7, Math.floor(points.length / 2)));
        const recent   = points.slice(-windowSize).reduce((s, p) => s + p.count, 0);
        const previous = points.slice(-windowSize * 2, -windowSize).reduce((s, p) => s + p.count, 0);
        if (!previous) return 0;
        return ((recent - previous) / previous) * 100;
    }, [data?.daily]);

    const trendSeries = useMemo(
        () =>
            (data?.daily ?? []).map((p) => ({
                date:            p.date,
                total_calls:     p.count,
                fake:            p.fake,
                real:            p.count - p.fake,
                interested:      p.interested,
                follow_up:       p.follow_up ?? 0,
                number_requests: p.number_requests,
            })),
        [data?.daily]
    );

    const chartTotals = useMemo(() => {
        const totals = { total_calls: 0, real: 0, fake: 0, interested: 0, follow_up: 0, number_requests: 0 } as Record<ChartKey, number>;
        for (const p of trendSeries) {
            for (const { key } of CHART_LINES) {
                totals[key] += (p as Record<string, number>)[key] ?? 0;
            }
        }
        return totals;
    }, [trendSeries]);

    const todayPieData = useMemo(() => {
        const uncategorized = Math.max(0, totalCalls - interested - followUp - notInterested);
        return [
            { key: 'interested',     name: 'Interested',     value: interested,    fill: 'var(--color-interested)' },
            { key: 'follow_up',      name: 'Follow-Up',      value: followUp,      fill: 'var(--color-follow_up)' },
            { key: 'not_interested', name: 'Not Interested', value: notInterested, fill: 'var(--color-not_interested)' },
            { key: 'fake',           name: 'Fake',           value: fakeCalls,     fill: 'var(--color-fake)' },
            { key: 'unclassified',   name: 'Unclassified',   value: uncategorized, fill: 'var(--color-unclassified)' },
        ].filter((d) => d.value > 0);
    }, [totalCalls, interested, followUp, notInterested, fakeCalls]);

    const agentRows  = useMemo(() => (data?.agents ?? []).map(deriveIntelligenceRow), [data?.agents]);
    const teamRows   = useMemo(() => (data?.teams  ?? []).map(deriveIntelligenceRow), [data?.teams]);
    const activeRows = view === 'agents' ? agentRows : teamRows;

    const filteredRows = useMemo(() => {
        const term = query.trim().toLowerCase();
        const visible = activeRows.filter((row) => {
            if (!term) return true;
            const email  = (row.email ?? '').toLowerCase();
            const leader = (row.team_leader?.full_name ?? '').toLowerCase();
            return row.label.toLowerCase().includes(term) || email.includes(term) || leader.includes(term);
        });
        return visible.sort((a, b) => {
            if (sortBy === 'calls')           return b.total_calls - a.total_calls;
            if (sortBy === 'fake')            return b.fake_rate - a.fake_rate;
            if (sortBy === 'interested')      return b.interested_rate - a.interested_rate;
            if (sortBy === 'number_requests') return b.number_request_rate_pct - a.number_request_rate_pct;
            return b.avg_rating_10 - a.avg_rating_10;
        });
    }, [activeRows, query, sortBy]);

    const visibleRows = useMemo(
        () => (showAllRows ? filteredRows : filteredRows.slice(0, 8)),
        [filteredRows, showAllRows]
    );

    const suspiciousAgents = useMemo(
        () =>
            agentRows
                .filter((r) => r.total_calls >= 5 && (r.fake_rate >= 0.25 || r.avg_duration_seconds < 20))
                .sort((a, b) => b.fake_rate - a.fake_rate)
                .slice(0, 5),
        [agentRows]
    );

    const suspiciousRadarData = useMemo(
        () =>
            suspiciousAgents.map((a) => ({
                agent: a.label.split(' ').slice(0, 2).join(' '), // first two words to keep labels short
                fake_calls: Math.round(a.fake_rate * a.total_calls),
                number_requests: a.number_requests,
            })),
        [suspiciousAgents]
    );

    const suspiciousChartConfig: ChartConfig = {
        fake_calls:      { label: 'Fake Calls',      color: '#7c3aed' },
        number_requests: { label: 'Nr. Requests',    color: '#a78bfa' },
    };

    const showLoading = loading && !data;
    const [isExporting, setIsExporting] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    function downloadCSV() {
        if (!data) return;
        const rows: string[] = [];
        const esc = (v: string | number) => {
            const s = String(v);
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const row = (...cols: (string | number)[]) => rows.push(cols.map(esc).join(','));

        const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? period;
        row(`Presales Performance Report — ${periodLabel}`, `Generated: ${new Date().toLocaleString()}`);
        rows.push('');

        row('SUMMARY');
        row('Metric', 'Value');
        row('Total Calls', totalCalls);
        row('Analyzed Calls', analyzedCalls);
        row('Analyzed Coverage', `${analyzedRate.toFixed(1)}%`);
        row('Real Calls', realCalls);
        row('Fake Calls', fakeCalls);
        row('Fake Rate', `${fakeRate.toFixed(1)}%`);
        row('Conversion (Interested)', interested);
        row('Conversion Rate', `${conversionRate.toFixed(1)}%`);
        row('Follow-Up', followUp);
        row('Follow-Up Rate', `${followUpRate.toFixed(1)}%`);
        row('Not Interested', notInterested);
        row('Outcome Coverage', `${outcomeCoverage.toFixed(1)}%`);
        row('Authenticity Rate', `${authenticityRate.toFixed(1)}%`);
        row('Number Requests', numberRequests);
        row('Number Request Rate', `${(numberRequestRate * 100).toFixed(1)}%`);
        rows.push('');

        if (data.daily.length > 0) {
            row('DAILY TREND');
            row('Date', 'Total Calls', 'Real', 'Fake', 'Interested', 'Follow-Up', 'Nr. Requests');
            for (const d of data.daily) {
                row(d.date, d.count, d.count - d.fake, d.fake, d.interested, d.follow_up ?? 0, d.number_requests);
            }
            rows.push('');
        }

        if (data.agents.length > 0) {
            row('AGENT PERFORMANCE');
            row('Name', 'Email', 'Total Calls', 'Analyzed', 'Real', 'Fake', 'Fake Rate', 'Interested', 'Follow-Up', 'Not Interested', 'Avg Rating', 'Nr. Requests');
            for (const a of data.agents) {
                const fRate = a.total_calls > 0 ? ((a.authenticity_counts.fake / a.total_calls) * 100).toFixed(1) + '%' : '0.0%';
                row(a.label, a.email ?? '', a.total_calls, a.analyzed_calls, a.authenticity_counts.real, a.authenticity_counts.fake, fRate, a.outcome_counts.interested, a.outcome_counts.follow_up_required, a.outcome_counts.not_interested, a.avg_rating_10.toFixed(2), a.number_requests);
            }
            rows.push('');
        }

        if (data.teams.length > 0) {
            row('TEAM PERFORMANCE');
            row('Team', 'Total Calls', 'Analyzed', 'Real', 'Fake', 'Fake Rate', 'Interested', 'Follow-Up', 'Not Interested', 'Avg Rating', 'Nr. Requests');
            for (const t of data.teams) {
                const fRate = t.total_calls > 0 ? ((t.authenticity_counts.fake / t.total_calls) * 100).toFixed(1) + '%' : '0.0%';
                row(t.label, t.total_calls, t.analyzed_calls, t.authenticity_counts.real, t.authenticity_counts.fake, fRate, t.outcome_counts.interested, t.outcome_counts.follow_up_required, t.outcome_counts.not_interested, t.avg_rating_10.toFixed(2), t.number_requests);
            }
        }

        const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `presales-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function downloadScreenshot() {
        if (!contentRef.current) return;
        setIsExporting(true);
        try {
            const html2canvas = (await import('html2canvas-pro')).default;
            const isDark = document.documentElement.classList.contains('dark');
            const canvas = await html2canvas(contentRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: isDark ? '#09090b' : '#ffffff',
            });
            const url = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = url;
            a.download = `presales-${period}-${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } finally {
            setIsExporting(false);
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <AdminShell activeSection="presalesPerformance">
            <main className="min-h-screen">

                {/* ── Page Header ────────────────────────────────────────────── */}
                <header className="relative overflow-hidden border-b border-purple-500/15 px-6 py-6 sm:px-8">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_100%_0%,rgba(139,92,246,0.13),transparent)]" />
                    <div className="relative mx-auto flex max-w-[82rem] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                            <Badge
                                variant="outline"
                                className="border-purple-500/30 bg-purple-500/10 text-[11px] font-semibold uppercase tracking-widest text-purple-700 dark:text-purple-400"
                            >
                                Pre-Sales Intelligence
                            </Badge>
                            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Presales Dashboard</h1>
                            <p className="text-sm text-muted-foreground">
                                Call authenticity, conversion quality, and coaching priorities.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Tabs value={period} onValueChange={setPeriod}>
                                <TabsList>
                                    {PERIODS.map((opt) => (
                                        <TabsTrigger key={opt.key} value={opt.key}>{opt.label}</TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => void loadData(period)}
                                disabled={loading}
                                aria-label="Refresh"
                                className="border-purple-500/20 hover:border-purple-500/40 hover:bg-purple-500/10"
                            >
                                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin text-purple-600 dark:text-purple-400')} />
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={!data || isExporting}
                                        className="gap-1.5 border-purple-500/20 hover:border-purple-500/40 hover:bg-purple-500/10"
                                    >
                                        {isExporting
                                            ? <Loader2 className="h-4 w-4 animate-spin" />
                                            : <Download className="h-4 w-4" />}
                                        Export
                                        <ChevronDown className="h-3 w-3 opacity-60" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                    <DropdownMenuItem onClick={downloadCSV} className="gap-2 cursor-pointer">
                                        <FileText className="h-4 w-4" />
                                        Download CSV
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { void downloadScreenshot(); }} className="gap-2 cursor-pointer">
                                        <Camera className="h-4 w-4" />
                                        Screenshot
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <NotificationBell />
                            {lastUpdated && (
                                <span className="text-[11px] text-muted-foreground">
                                    Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </div>
                    </div>
                </header>

                {/* ── Content ────────────────────────────────────────────────── */}
                <div ref={contentRef} className="mx-auto flex w-full max-w-[82rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">

                    {error && (
                        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                            {error}
                        </div>
                    )}

                    {showLoading && (
                        <Card className="border-purple-500/15">
                            <CardContent className="flex items-center justify-center gap-3 py-20 text-sm text-muted-foreground">
                                <Loader2 className="h-5 w-5 animate-spin text-purple-600 dark:text-purple-400" />
                                Loading pre-sales analytics…
                            </CardContent>
                        </Card>
                    )}

                    {data && (
                        <div className={cn('flex flex-col gap-6 transition-opacity duration-300', loading && 'pointer-events-none opacity-50')}>

                            {/* Partial data quality banner */}
                            {data.outcome_data_quality?.is_partial && data.outcome_data_quality.inferred > 0 && (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                                    <p className="inline-flex items-center gap-2 font-semibold text-amber-600 dark:text-amber-300">
                                        <AlertTriangle className="h-4 w-4" />
                                        Estimated outcome data
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                        {formatCount(data.outcome_data_quality.real)} verified and{' '}
                                        {formatCount(data.outcome_data_quality.inferred)} inferred calls included.
                                        {data.outcome_data_quality.unclassified > 0 &&
                                            ` ${formatCount(data.outcome_data_quality.unclassified)} records remain unclassified.`}
                                    </p>
                                </div>
                            )}

                            {/* ── Row 1: 4 KPI Stat Cards ────────────────────────── */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

                                <Card className="border-purple-500/15 transition-all duration-300 hover:border-purple-500/30 hover:shadow-[0_0_20px_rgba(139,92,246,0.07)]">
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Calls</CardTitle>
                                        <span className={cn('flex items-center gap-0.5 text-xs font-semibold', trendDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                                            {trendDelta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                                            {formatDelta(trendDelta)}
                                        </span>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-4xl font-bold tracking-tight">{formatCount(totalCalls)}</div>
                                        <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
                                            {trendDelta >= 0 ? 'Trending up this period' : 'Trending down this period'}
                                            {trendDelta >= 0
                                                ? <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                                : <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
                                        </div>
                                        <p className="text-sm text-muted-foreground">{formatCount(analyzedCalls)} analyzed · {formatPercent(analyzedRate)} coverage</p>
                                    </CardContent>
                                </Card>

                                <Card className="border-rose-500/15 transition-all duration-300 hover:border-rose-500/25 hover:shadow-[0_0_20px_rgba(239,68,68,0.06)]">
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Fake Call Risk</CardTitle>
                                        <span className="flex items-center gap-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                                            <ShieldAlert className="h-3.5 w-3.5" />
                                            {formatCount(fakeCalls)} calls
                                        </span>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-4xl font-bold tracking-tight">{formatPercent(fakeRate)}</div>
                                        <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
                                            {fakeRate >= 25 ? 'High fake-call concentration' : fakeRate >= 15 ? 'Elevated above baseline' : 'Within healthy range'}
                                            {fakeRate >= 15
                                                ? <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                                                : <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                                        </div>
                                        <p className="text-sm text-muted-foreground">{formatPercent(authenticityRate)} calls verified authentic</p>
                                    </CardContent>
                                </Card>

                                <Card className="border-emerald-500/15 transition-all duration-300 hover:border-emerald-500/25 hover:shadow-[0_0_20px_rgba(16,185,129,0.06)]">
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Conversion Rate</CardTitle>
                                        <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                            <PhoneCall className="h-3.5 w-3.5" />
                                            {formatCount(interested)} interested
                                        </span>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-4xl font-bold tracking-tight">{formatPercent(conversionRate)}</div>
                                        <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
                                            {conversionRate >= 10 ? 'Strong lead conversion' : conversionRate >= 5 ? 'Moderate conversion rate' : 'Conversion needs attention'}
                                            {conversionRate >= 5
                                                ? <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                                : <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
                                        </div>
                                        <p className="text-sm text-muted-foreground">{formatPercent(outcomeCoverage)} outcome coverage · {formatPercent(followUpRate)} follow-up</p>
                                    </CardContent>
                                </Card>

                                <Card className="border-amber-500/15 transition-all duration-300 hover:border-amber-500/25 hover:shadow-[0_0_20px_rgba(245,158,11,0.06)]">
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Number Requests</CardTitle>
                                        <span className="flex items-center gap-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                                            <ShieldAlert className="h-3.5 w-3.5" />
                                            {formatPercent(numberRequestRate)} rate
                                        </span>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-4xl font-bold tracking-tight">{formatCount(numberRequests)}</div>
                                        <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
                                            {numberRequests === 0 ? 'No incidents detected' : numberRequests <= 5 ? 'Low incident count' : 'Lead theft risk events'}
                                            {numberRequests > 5
                                                ? <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                                                : <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                                        </div>
                                        <p className="text-sm text-muted-foreground">{formatCount(numberRequests)} total incidents this period</p>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* ── Row 2: Chart (pie for today, line for ranges) ───── */}
                            {period === 'today' ? (
                                <Card className="flex flex-col border-purple-500/15 transition-all duration-300 hover:border-purple-500/25">
                                    <CardHeader className="items-center pb-0">
                                        <CardTitle className="text-base">Today's Call Breakdown</CardTitle>
                                        <CardDescription>Distribution of calls by outcome and authenticity.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex-1 pb-0">
                                        {todayPieData.length === 0 ? (
                                            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                                                No calls recorded today yet.
                                            </div>
                                        ) : (
                                            <ChartContainer
                                                config={TODAY_CHART_CONFIG}
                                                className="mx-auto aspect-square h-[300px] w-full max-h-[300px] pb-0 [&_.recharts-pie-label-text]:fill-foreground"
                                            >
                                                <PieChart>
                                                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                                                    <Pie data={todayPieData} dataKey="value" nameKey="name" label />
                                                </PieChart>
                                            </ChartContainer>
                                        )}
                                    </CardContent>
                                    {todayPieData.length > 0 && (
                                        <div className="flex flex-wrap justify-center gap-3 px-6 pb-5 pt-2">
                                            {todayPieData.map((entry) => (
                                                <span key={entry.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TODAY_CHART_CONFIG[entry.key]?.color }} />
                                                    {entry.name}
                                                    <span className="font-semibold tabular-nums text-foreground">{formatCount(entry.value)}</span>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </Card>
                            ) : (
                                <Card className="border-purple-500/15 transition-all duration-300 hover:border-purple-500/25">
                                    <CardHeader className="flex flex-col items-stretch border-b border-purple-500/10 p-0 sm:flex-row">
                                        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5">
                                            <CardTitle className="text-base">Call Intelligence Trend</CardTitle>
                                            <CardDescription>All key metrics over time — click a metric to toggle its line.</CardDescription>
                                        </div>
                                        <div className="flex flex-wrap border-t border-purple-500/10 sm:border-t-0">
                                            {CHART_LINES.map(({ key, label, color }) => (
                                                <button
                                                    key={key}
                                                    onClick={() => toggleLine(key)}
                                                    className={cn(
                                                        'flex flex-col justify-center gap-0.5 border-l border-purple-500/10 px-4 py-3 text-left transition-all duration-150 hover:bg-purple-500/5 sm:px-5 sm:py-4',
                                                        !activeLines.has(key) && 'opacity-30'
                                                    )}
                                                >
                                                    <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground">
                                                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                                                        {label}
                                                    </span>
                                                    <span className="text-base font-bold tabular-nums sm:text-lg">
                                                        {formatCount(chartTotals[key])}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="px-2 py-4 sm:p-6">
                                        {trendSeries.length === 0 ? (
                                            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                                                No daily data available for this period.
                                            </div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height={300}>
                                                <LineChart data={trendSeries} margin={{ left: 0, right: 8 }}>
                                                    <CartesianGrid stroke="rgba(139,92,246,0.1)" vertical={false} />
                                                    <XAxis
                                                        dataKey="date"
                                                        tickLine={false}
                                                        axisLine={false}
                                                        tickMargin={8}
                                                        minTickGap={32}
                                                        tick={{ fontSize: 11 }}
                                                        tickFormatter={(v) =>
                                                            new Date(v).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
                                                        }
                                                    />
                                                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={30} />
                                                    <Tooltip content={<LineTooltip />} />
                                                    {CHART_LINES.filter((l) => activeLines.has(l.key)).map(({ key, label, color }) => (
                                                        <Line
                                                            key={key}
                                                            dataKey={key}
                                                            name={label}
                                                            type="monotone"
                                                            stroke={color}
                                                            strokeWidth={2}
                                                            dot={false}
                                                            activeDot={{ r: 4, strokeWidth: 0 }}
                                                        />
                                                    ))}
                                                </LineChart>
                                            </ResponsiveContainer>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* ── Row 3: Suspicious Agents ───────────────────────── */}
                            <div className="grid grid-cols-1 gap-4">

                                {/* Suspicious Agents */}
                                <Card className="border-rose-500/15 transition-all duration-300 hover:border-rose-500/25">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <CardTitle className="flex items-center gap-2 text-base">
                                                    <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                                                    Suspicious Agents
                                                </CardTitle>
                                                <CardDescription className="mt-1">
                                                    Agents with high fake-call rate or abnormal call duration.
                                                </CardDescription>
                                            </div>
                                            <Badge variant={suspiciousAgents.length ? 'destructive' : 'secondary'}>
                                                {suspiciousAgents.length ? `${suspiciousAgents.length} flagged` : 'All clear'}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex flex-col items-center">
                                        {suspiciousAgents.length ? (
                                            <>
                                                <ChartContainer
                                                    config={suspiciousChartConfig}
                                                    className="h-[280px] w-full"
                                                >
                                                    <RadarChart data={suspiciousRadarData}>
                                                        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                                        <PolarAngleAxis dataKey="agent" tick={{ fontSize: 11 }} />
                                                        <PolarGrid radialLines={false} stroke="rgba(139,92,246,0.2)" />
                                                        <Radar
                                                            dataKey="fake_calls"
                                                            name="Fake Calls"
                                                            fill="var(--color-fake_calls)"
                                                            fillOpacity={0.2}
                                                            stroke="var(--color-fake_calls)"
                                                            strokeWidth={2}
                                                        />
                                                        <Radar
                                                            dataKey="number_requests"
                                                            name="Nr. Requests"
                                                            fill="var(--color-number_requests)"
                                                            fillOpacity={0.2}
                                                            stroke="var(--color-number_requests)"
                                                            strokeWidth={2}
                                                        />
                                                    </RadarChart>
                                                </ChartContainer>
                                                <div className="mt-1 flex flex-wrap justify-center gap-3 px-4 pb-2">
                                                    <span className="flex items-center gap-1.5 text-xs"><span className="h-2.5 w-2.5 rounded-full bg-[#7c3aed]" /> Fake Calls</span>
                                                    <span className="flex items-center gap-1.5 text-xs"><span className="h-2.5 w-2.5 rounded-full bg-[#a78bfa]" /> Nr. Requests</span>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                                                <div className="rounded-full bg-emerald-500/10 p-3">
                                                    <ShieldAlert className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                                </div>
                                                <p className="text-sm font-medium">No suspicious activity</p>
                                                <p className="text-xs text-muted-foreground">All agents within normal parameters.</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                            </div>

                            {/* ── Row 4: Agent Intelligence Table ────────────────── */}
                            <Card className="border-purple-500/15 transition-all duration-300 hover:border-purple-500/25">
                                <CardHeader className="pb-3">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <CardTitle className="flex items-center gap-2 text-base">
                                                <Bot className="h-4 w-4 text-purple-700 dark:text-purple-400" />
                                                Agent Intelligence Table
                                            </CardTitle>
                                            <CardDescription className="mt-1">Risk pattern, momentum, and coaching action per agent / team.</CardDescription>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Tabs value={view} onValueChange={(v) => setView(v as TableView)}>
                                                <TabsList>
                                                    <TabsTrigger value="agents">Agents</TabsTrigger>
                                                    <TabsTrigger value="teams">Teams</TabsTrigger>
                                                </TabsList>
                                            </Tabs>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" size="sm" className="border-purple-500/20 hover:border-purple-500/40">
                                                        Sort: {SORT_LABELS[sortBy]}
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as TableSort)}>
                                                        <DropdownMenuRadioItem value="calls">Call volume</DropdownMenuRadioItem>
                                                        <DropdownMenuRadioItem value="fake">Fake risk</DropdownMenuRadioItem>
                                                        <DropdownMenuRadioItem value="interested">Interested rate</DropdownMenuRadioItem>
                                                        <DropdownMenuRadioItem value="rating">Rating</DropdownMenuRadioItem>
                                                        <DropdownMenuRadioItem value="number_requests">Number requests</DropdownMenuRadioItem>
                                                    </DropdownMenuRadioGroup>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" size="sm" className="border-purple-500/20 hover:border-purple-500/40">
                                                        <Filter className="h-3.5 w-3.5" />
                                                        View
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => setShowAllRows(false)}>Top 8 focus</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setShowAllRows(true)}>View full list</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="relative">
                                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            placeholder={`Search ${view} by name, email, or leader…`}
                                            className="border-purple-500/15 pl-9 focus-visible:border-purple-500/40 focus-visible:ring-purple-500/20"
                                        />
                                    </div>
                                    <div className="overflow-hidden rounded-xl border border-purple-500/10">
                                        <ScrollArea className={showAllRows ? 'h-[31rem]' : 'h-[24rem]'}>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="border-purple-500/10 hover:bg-transparent">
                                                        <TableHead className="font-semibold text-purple-800 dark:text-purple-300">
                                                            {view === 'agents' ? 'Agent' : 'Team'}
                                                        </TableHead>
                                                        <TableHead className="text-center font-semibold text-purple-800 dark:text-purple-300">Calls</TableHead>
                                                        <TableHead className="text-center font-semibold text-purple-800 dark:text-purple-300">Risk</TableHead>
                                                        <TableHead className="text-center font-semibold text-purple-800 dark:text-purple-300">Momentum</TableHead>
                                                        <TableHead className="text-right font-semibold text-purple-800 dark:text-purple-300">Interested</TableHead>
                                                        <TableHead className="text-right font-semibold text-purple-800 dark:text-purple-300">Fake</TableHead>
                                                        <TableHead className="text-right font-semibold text-purple-800 dark:text-purple-300">Nr. Req.</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {visibleRows.map((row) => (
                                                        <TableRow
                                                            key={row.id}
                                                            className="border-purple-500/8 transition-colors duration-150 hover:bg-purple-500/5"
                                                        >
                                                            <TableCell>
                                                                <div className="flex items-center gap-2.5">
                                                                    <AgentAvatar name={row.label} />
                                                                    <div className="min-w-0">
                                                                        <p className="truncate font-semibold">{row.label}</p>
                                                                        <p className="truncate text-xs text-muted-foreground">
                                                                            {view === 'agents'
                                                                                ? row.email || 'No email'
                                                                                : row.team_leader?.full_name
                                                                                  ? `Leader: ${row.team_leader.full_name}`
                                                                                  : 'No leader assigned'}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <p className="font-semibold">{formatCount(row.total_calls)}</p>
                                                                <p className="text-xs text-muted-foreground">{Math.round(row.analyzed_rate * 100)}% analyzed</p>
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <div className="flex flex-col items-center gap-1">
                                                                    {riskBadge(row.risk_level)}
                                                                    <p className="text-[11px] text-muted-foreground">{row.risk_reason}</p>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-center">{momentumNode(row.momentum)}</TableCell>
                                                            <TableCell className="text-right font-semibold">{formatPercent(row.interested_rate * 100)}</TableCell>
                                                            <TableCell className="text-right font-semibold">{formatPercent(row.fake_rate * 100)}</TableCell>
                                                            <TableCell className="text-right">
                                                                {row.number_requests > 0 ? (
                                                                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                                                                        {formatCount(row.number_requests)}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-muted-foreground">—</span>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                    {!visibleRows.length && (
                                                        <TableRow>
                                                            <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                                                                No matching {view} found for the current query.
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </ScrollArea>
                                    </div>
                                    {filteredRows.length > 8 && (
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs text-muted-foreground">
                                                Showing {visibleRows.length} of {filteredRows.length} {view}
                                            </p>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setShowAllRows((prev) => !prev)}
                                                className="border-purple-500/20 hover:border-purple-500/40"
                                            >
                                                {showAllRows ? 'Show top 8' : `Show all (${filteredRows.length})`}
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                        </div>
                    )}
                </div>
            </main>
        </AdminShell>
    );
}

export default function PresalesPerformancePage() {
    return (
        <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
            <PresalesPerformanceContent />
        </ProtectedRoute>
    );
}
