'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
    Bot,
    ChevronDown,
    Clock3,
    Filter,
    Funnel,
    Gauge,
    Loader2,
    PhoneCall,
    RefreshCw,
    Search,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    TrendingUp,
    Users2
} from 'lucide-react';

import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PageHeader } from '@/components/dashboard/page-header';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { SectionCard } from '@/components/dashboard/section-card';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { useAuth } from '@/contexts/AuthContext';
import { API_URL } from '@/stores/authStore';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthenticityBarChart, NumberRequestsTrendChart, PresalesMultiTrendChart } from '@/components/ui/charts';

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
    team_leader?: {
        full_name: string;
        email?: string | null;
    } | null;
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
    daily: Array<{ date: string; count: number; fake: number; interested: number; number_requests: number }>;
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

interface FunnelStage {
    key: string;
    label: string;
    value: number;
    toneClass: string;
}

const PERIODS = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' },
    { key: 'all', label: 'All Time' }
];

const SORT_LABELS: Record<TableSort, string> = {
    calls: 'calls',
    fake: 'fake risk',
    interested: 'interested',
    rating: 'rating',
    number_requests: 'number requests'
};

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function formatCount(value: number) {
    return new Intl.NumberFormat('en-IN').format(value);
}

function formatPercent(value: number) {
    return `${value.toFixed(1)}%`;
}

function formatDuration(seconds: number) {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
}

function formatDelta(value: number) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
}

function ratio(part: number, whole: number) {
    if (!whole) return 0;
    return part / whole;
}

function deriveIntelligenceRow(row: PerformanceBucket): IntelligenceRow {
    const interested = row.outcome_counts.interested ?? 0;
    const notInterested = row.outcome_counts.not_interested ?? 0;
    const followUp = row.outcome_counts.follow_up_required ?? 0;
    const fakeCalls = row.authenticity_counts.fake ?? 0;

    const outcomeTotal = interested + notInterested + followUp;
    const fakeRate = ratio(fakeCalls, row.total_calls);
    const interestedRate = ratio(interested, outcomeTotal);
    const followUpRate = ratio(followUp, outcomeTotal);
    const analyzedRate = ratio(row.analyzed_calls, row.total_calls);

    let riskLevel: RiskLevel = 'low';
    let riskReason = 'Stable call quality and authenticity.';

    if (fakeRate >= 0.35 || row.avg_duration_seconds < 18) {
        riskLevel = 'high';
        riskReason = fakeRate >= 0.35 ? 'High fake-call concentration detected.' : 'Call duration pattern looks suspicious.';
    } else if (fakeRate >= 0.2 || followUpRate >= 0.45 || row.avg_rating_10 < 3) {
        riskLevel = 'medium';
        riskReason = fakeRate >= 0.2 ? 'Fake-call share is trending above baseline.' : followUpRate >= 0.45 ? 'Follow-up backlog is elevated.' : 'Quality score below team baseline.';
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

function riskBadge(level: RiskLevel) {
    if (level === 'high') return <Badge variant="destructive">High Risk</Badge>;
    if (level === 'medium') return <Badge variant="warning">Watch</Badge>;
    return <Badge variant="success">Stable</Badge>;
}

function momentumNode(momentum: Momentum) {
    if (momentum === 'up') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-success-500)]">
                <ArrowUpRight className="h-3.5 w-3.5" />
                Improving
            </span>
        );
    }
    if (momentum === 'down') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-critical-500)]">
                <ArrowDownRight className="h-3.5 w-3.5" />
                Declining
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-text-muted)]">
            <ArrowRight className="h-3.5 w-3.5" />
            Steady
        </span>
    );
}

function FunnelVisual({ stages }: { stages: FunnelStage[] }) {
    const maxValue = Math.max(...stages.map((stage) => stage.value), 1);

    return (
        <div className="space-y-3">
            {stages.map((stage, index) => {
                const prevValue = index === 0 ? stage.value : stages[index - 1].value;
                const fromPrevious = prevValue ? Math.round((stage.value / prevValue) * 100) : 100;
                const dropOff = index === 0 ? 0 : Math.max(0, 100 - fromPrevious);
                const widthRatio = clamp((stage.value / maxValue) * 100, stage.value > 0 ? 18 : 10, 100);

                return (
                    <div key={stage.key} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{stage.label}</span>
                            <span className="font-semibold text-[var(--color-text-primary)]">{formatCount(stage.value)}</span>
                        </div>
                        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] p-2.5">
                            <div className="h-2.5 rounded-full bg-[var(--surface-hover)]">
                                <div
                                    className={`h-full rounded-full transition-all duration-700 ${stage.toneClass}`}
                                    style={{ width: `${widthRatio}%` }}
                                />
                            </div>
                            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                                <span>{Math.round((stage.value / maxValue) * 100)}% of total</span>
                                <span>{index === 0 ? 'Baseline' : `${dropOff}% drop-off`}</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function PresalesPerformanceContent() {
    const { session } = useAuth();

    const [period, setPeriod] = useState('30d');
    const [view, setView] = useState<TableView>('agents');
    const [query, setQuery] = useState('');
    const [sortBy, setSortBy] = useState<TableSort>('calls');
    const [showAllRows, setShowAllRows] = useState(false);

    const [data, setData] = useState<PresalesPerformance | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const loadData = useCallback(
        async (selectedPeriod = period, silent = false) => {
            if (!session?.access_token) return;

            if (!silent) setLoading(true);
            setError('');

            try {
                const response = await fetch(`${API_URL}/analytics/presales-performance?period=${selectedPeriod}`, {
                    headers: {
                        Authorization: `Bearer ${session.access_token}`
                    }
                });

                const payload = (await response.json()) as PresalesPerformance & { error?: string };
                if (!response.ok) {
                    throw new Error(payload.error || 'Failed to load pre-sales analytics');
                }

                setData(payload);
                setLastUpdated(new Date());
            } catch (fetchError) {
                setError(fetchError instanceof Error ? fetchError.message : 'Failed to load pre-sales analytics');
            } finally {
                if (!silent) setLoading(false);
            }
        },
        [period, session?.access_token]
    );

    useEffect(() => {
        void loadData(period);
        setShowAllRows(false);
    }, [period, loadData]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            void loadData(period, true);
        }, 60_000);

        return () => window.clearInterval(timer);
    }, [period, loadData]);

    const summary = data?.summary;

    const totalCalls = summary?.total_calls ?? 0;
    const analyzedCalls = summary?.analyzed_calls ?? 0;
    const interested = summary?.outcome_counts.interested ?? 0;
    const notInterested = summary?.outcome_counts.not_interested ?? 0;
    const followUp = summary?.outcome_counts.follow_up_required ?? 0;
    const outcomeTotal = interested + notInterested + followUp;

    const realCalls = summary?.authenticity_counts.real ?? 0;
    const fakeCalls = summary?.authenticity_counts.fake ?? 0;
    const authenticityTotal = realCalls + fakeCalls;

    const fakeRate = ratio(fakeCalls, totalCalls) * 100;
    const conversionRate = ratio(interested, totalCalls) * 100;
    const followUpRate = ratio(followUp, outcomeTotal) * 100;
    const analyzedRate = ratio(analyzedCalls, totalCalls) * 100;
    const outcomeCoverage = ratio(outcomeTotal, totalCalls) * 100;
    const authenticityRate = ratio(realCalls, authenticityTotal) * 100;
    const numberRequests = summary?.number_requests ?? 0;
    const numberRequestRate = summary?.number_request_rate ?? 0;

    const aiConfidence = useMemo(() => {
        if (data?.outcome_data_quality?.total_analyzed) {
            return ratio(data.outcome_data_quality.real, data.outcome_data_quality.total_analyzed) * 100;
        }
        return outcomeCoverage;
    }, [data?.outcome_data_quality, outcomeCoverage]);

    const qualifiedLeadsEstimate = useMemo(() => {
        if (!authenticityTotal) return interested;
        return Math.round(interested * ratio(realCalls, authenticityTotal));
    }, [authenticityTotal, interested, realCalls]);

    const trendDelta = useMemo(() => {
        const points = data?.daily ?? [];
        if (points.length < 4) return 0;

        const windowSize = Math.max(2, Math.min(7, Math.floor(points.length / 2)));
        const recent = points.slice(-windowSize).reduce((sum, point) => sum + point.count, 0);
        const previous = points.slice(-windowSize * 2, -windowSize).reduce((sum, point) => sum + point.count, 0);

        if (!previous) return 0;
        return ((recent - previous) / previous) * 100;
    }, [data?.daily]);

    const peakDay = useMemo(() => {
        const points = data?.daily ?? [];
        if (!points.length) return null;

        const highest = points.reduce((best, point) => (point.count > best.count ? point : best), points[0]);
        return {
            date: new Date(highest.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
            count: highest.count
        };
    }, [data?.daily]);

    const sparkData = useMemo(() => {
        const points = data?.daily ?? [];
        const recent = points.slice(-10);
        const maxValue = Math.max(...recent.map((point) => point.count), 1);

        return recent.map((point) => ({
            date: point.date,
            count: point.count,
            height: Math.max(14, Math.round((point.count / maxValue) * 100))
        }));
    }, [data?.daily]);

    const funnelStages: FunnelStage[] = useMemo(
        () => [
            {
                key: 'total',
                label: 'Total Calls',
                value: totalCalls,
                toneClass: 'bg-[var(--color-primary-500)]'
            },
            {
                key: 'classified',
                label: 'Classified',
                value: outcomeTotal,
                toneClass: 'bg-[var(--color-info-500)]'
            },
            {
                key: 'followup',
                label: 'Follow-Up Queue',
                value: followUp,
                toneClass: 'bg-[var(--color-warning-500)]'
            },
            {
                key: 'interested',
                label: 'Interested',
                value: interested,
                toneClass: 'bg-[var(--color-success-500)]'
            },
        ],
        [followUp, interested, outcomeTotal, qualifiedLeadsEstimate, totalCalls]
    );

    const trendSeries = useMemo(() => {
        return (data?.daily ?? []).map((point) => ({
            date: point.date,
            calls: point.count,
            fake_calls: point.fake,
            interested_calls: point.interested,
            conversion_rate: point.count ? ratio(point.interested, point.count) * 100 : 0,
        }));
    }, [data?.daily]);

    const numberRequestSeries = useMemo(() => {
        return (data?.daily ?? []).map((point) => ({
            date: point.date,
            count: point.number_requests,
        }));
    }, [data?.daily]);

    const agentRows = useMemo(() => (data?.agents ?? []).map(deriveIntelligenceRow), [data?.agents]);
    const teamRows = useMemo(() => (data?.teams ?? []).map(deriveIntelligenceRow), [data?.teams]);

    const activeRows = view === 'agents' ? agentRows : teamRows;

    const filteredRows = useMemo(() => {
        const term = query.trim().toLowerCase();

        const visible = activeRows.filter((row) => {
            if (!term) return true;

            const email = (row.email ?? '').toLowerCase();
            const leader = (row.team_leader?.full_name ?? '').toLowerCase();
            return row.label.toLowerCase().includes(term) || email.includes(term) || leader.includes(term);
        });

        return visible.sort((left, right) => {
            if (sortBy === 'calls') return right.total_calls - left.total_calls;
            if (sortBy === 'fake') return right.fake_rate - left.fake_rate;
            if (sortBy === 'interested') return right.interested_rate - left.interested_rate;
            if (sortBy === 'number_requests') return right.number_request_rate_pct - left.number_request_rate_pct;
            return right.avg_rating_10 - left.avg_rating_10;
        });
    }, [activeRows, query, sortBy]);

    const visibleRows = useMemo(() => {
        if (showAllRows) return filteredRows;
        return filteredRows.slice(0, 8);
    }, [filteredRows, showAllRows]);

    const suspiciousAgents = useMemo(() => {
        return agentRows
            .filter((row) => row.total_calls >= 5 && (row.fake_rate >= 0.25 || row.avg_duration_seconds < 20))
            .sort((left, right) => right.fake_rate - left.fake_rate)
            .slice(0, 5);
    }, [agentRows]);

    const showLoading = loading && !data;

    return (
        <AdminShell activeSection="presalesPerformance">
            <main className="min-h-screen">
                <PageHeader
                    eyebrow="Pre-Sales Intelligence"
                    title="Presales Dashboard"
                    subtitle="See call authenticity, conversion quality, and coaching priorities in one mission view."
                    chips={
                        <>
                            <StatusBadge status="pending">{suspiciousAgents.length} risk agents</StatusBadge>
                            <StatusBadge status="accepted" dot>
                                {formatPercent(conversionRate)} conversion
                            </StatusBadge>
                        </>
                    }
                    actions={
                        <div className="flex flex-wrap items-center gap-2">
                            <Tabs value={period} onValueChange={setPeriod}>
                                <TabsList>
                                    {PERIODS.map((option) => (
                                        <TabsTrigger key={option.key} value={option.key}>
                                            {option.label}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>
                            <Button variant="secondary" size="icon" onClick={() => void loadData(period)} disabled={loading} aria-label="Refresh">
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                            <NotificationBell />
                            {lastUpdated ? (
                                <span className="text-[11px] text-[var(--color-text-muted)]">
                                    Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            ) : null}
                        </div>
                    }
                />

                <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
                    {error ? <div className="rounded-2xl border border-rose-500/35 bg-rose-500/12 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

                    {showLoading ? (
                        <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--surface-card)] p-10">
                            <div className="flex items-center justify-center gap-3 text-sm text-[var(--color-text-muted)]">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                Loading pre-sales analytics...
                            </div>
                        </div>
                    ) : data ? (
                        <>
                            {data.outcome_data_quality?.is_partial && data.outcome_data_quality.inferred > 0 ? (
                                <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                                    <p className="inline-flex items-center gap-2 font-semibold text-amber-300">
                                        <AlertTriangle className="h-4 w-4" />
                                        Estimated outcome data
                                    </p>
                                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                                        {formatCount(data.outcome_data_quality.real)} verified calls and {formatCount(data.outcome_data_quality.inferred)} inferred historical calls are included.
                                        {data.outcome_data_quality.unclassified > 0
                                            ? ` ${formatCount(data.outcome_data_quality.unclassified)} records remain unclassified.`
                                            : ''}
                                    </p>
                                </div>
                            ) : null}

                            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
                                <SectionCard
                                    title="Mission Control"
                                    subtitle="Instant snapshot of volume, conversion momentum, and risk posture."
                                    icon={<Sparkles className="h-4 w-4" />}
                                    className="border-[var(--color-primary-400)]/40"
                                >
                                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_11rem]">
                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-[0.09em] text-[var(--color-text-muted)]">Total calls</p>
                                                <p className="mt-1 text-5xl font-bold tracking-tight text-[var(--color-text-primary)]">{formatCount(totalCalls)}</p>
                                                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                                                    {trendDelta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5 text-[var(--color-success-500)]" /> : <ArrowDownRight className="h-3.5 w-3.5 text-[var(--color-critical-500)]" />}
                                                    {formatDelta(trendDelta)} vs previous window
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                                <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] px-2.5 py-2">
                                                    <p className="text-[11px] text-[var(--color-text-muted)]">Analyzed</p>
                                                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{formatPercent(analyzedRate)}</p>
                                                </div>
                                                <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] px-2.5 py-2">
                                                    <p className="text-[11px] text-[var(--color-text-muted)]">Outcome coverage</p>
                                                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{formatPercent(outcomeCoverage)}</p>
                                                </div>
                                                <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] px-2.5 py-2">
                                                    <p className="text-[11px] text-[var(--color-text-muted)]">Peak day</p>
                                                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{peakDay ? `${peakDay.date} (${formatCount(peakDay.count)})` : 'N/A'}</p>
                                                </div>
                                                <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] px-2.5 py-2">
                                                    <p className="text-[11px] text-[var(--color-text-muted)]">AI confidence</p>
                                                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{formatPercent(aiConfidence)}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] p-3">
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Volume rhythm</p>
                                            <div className="flex h-28 items-end justify-between gap-1.5">
                                                {sparkData.length ? (
                                                    sparkData.map((point) => (
                                                        <span
                                                            key={point.date}
                                                            className="w-full rounded-sm bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-primary-400),#ffffff_8%),var(--color-primary-700))]"
                                                            style={{ height: `${point.height}%` }}
                                                        />
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-[var(--color-text-muted)]">No recent trend points</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </SectionCard>

                                <SectionCard title="Risk + Quality" subtitle="Signals that need immediate action." icon={<ShieldAlert className="h-4 w-4" />}>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-rose-300">Fake call risk</p>
                                            <p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">{formatPercent(fakeRate)}</p>
                                            <p className="text-xs text-[var(--color-text-muted)]">{formatCount(fakeCalls)} fake / invalid calls</p>
                                        </div>
                                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-300">Follow-up backlog</p>
                                            <p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">{formatPercent(followUpRate)}</p>
                                            <p className="text-xs text-[var(--color-text-muted)]">{formatCount(followUp)} pending outcomes</p>
                                        </div>
                                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-300">Authentic calls</p>
                                            <p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">{formatPercent(authenticityRate)}</p>
                                            <p className="text-xs text-[var(--color-text-muted)]">{formatCount(realCalls)} trusted calls</p>
                                        </div>
                                        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] p-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Avg duration</p>
                                            <p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">{formatDuration(summary?.avg_duration_seconds ?? 0)}</p>
                                            <p className="text-xs text-[var(--color-text-muted)]">per analyzed call</p>
                                        </div>
                                    </div>
                                </SectionCard>
                            </section>

                            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                                <KpiCard
                                    label="Total Calls"
                                    icon={<PhoneCall className="h-4 w-4" />}
                                    value={formatCount(totalCalls)}
                                    footnote={`${formatCount(analyzedCalls)} analyzed`}
                                />
                                <KpiCard
                                    label="Conversion"
                                    icon={<TrendingUp className="h-4 w-4" />}
                                    value={formatPercent(conversionRate)}
                                    footnote={`${formatCount(interested)} interested outcomes`}
                                />
                                <KpiCard
                                    label="Authenticity"
                                    icon={<ShieldCheck className="h-4 w-4" />}
                                    value={formatPercent(authenticityRate)}
                                    footnote={`${formatCount(fakeCalls)} fake / invalid`}
                                />
                                <KpiCard
                                    label="Coaching Pressure"
                                    icon={<Users2 className="h-4 w-4" />}
                                    value={formatPercent(followUpRate)}
                                    footnote={`${formatCount(followUp)} follow-up required`}
                                />
                                <KpiCard
                                    label="Number Requests"
                                    icon={<ShieldAlert className="h-4 w-4" />}
                                    value={formatCount(numberRequests)}
                                    footnote={`${formatPercent(numberRequestRate)} of calls`}
                                />
                            </section>

                            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)] xl:items-start">
                                <SectionCard
                                    title="Conversion Funnel"
                                    subtitle="Where leads are dropping across the pre-sales pipeline."
                                    icon={<Funnel className="h-4 w-4" />}
                                >
                                    <FunnelVisual stages={funnelStages} />
                                </SectionCard>

                                <SectionCard
                                    title="Trust & Fraud Intelligence"
                                    subtitle="Authenticity split, alerting, and suspicious agent watchlist."
                                    icon={<ShieldAlert className="h-4 w-4" />}
                                >
                                    <AuthenticityBarChart real={realCalls} fake={fakeCalls} height={168} />
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-300">Real</p>
                                            <p className="text-xl font-bold text-[var(--color-text-primary)]">{formatCount(realCalls)}</p>
                                        </div>
                                        <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 p-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-300">Fake</p>
                                            <p className="text-xl font-bold text-[var(--color-text-primary)]">{formatCount(fakeCalls)}</p>
                                        </div>
                                    </div>

                                    <div className="mt-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] p-2.5">
                                        <div className="mb-2 flex items-center justify-between">
                                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Suspicious agents</p>
                                            <Badge variant={suspiciousAgents.length ? 'warning' : 'secondary'}>{suspiciousAgents.length || 'none'}</Badge>
                                        </div>
                                        <ScrollArea className="h-24">
                                            <div className="space-y-1.5 pr-2">
                                                {suspiciousAgents.length ? (
                                                    suspiciousAgents.map((agent) => (
                                                        <div key={agent.id} className="flex items-center justify-between rounded-md border border-[var(--color-border-subtle)] bg-[var(--surface-card)] px-2 py-1.5">
                                                            <div className="min-w-0">
                                                                <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{agent.label}</p>
                                                                <p className="text-[11px] text-[var(--color-text-muted)]">{agent.risk_reason}</p>
                                                            </div>
                                                            <Badge variant={agent.risk_level === 'high' ? 'destructive' : 'warning'}>
                                                                {formatPercent(agent.fake_rate * 100)}
                                                            </Badge>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-xs text-[var(--color-text-muted)]">No suspicious agents in this period.</p>
                                                )}
                                            </div>
                                        </ScrollArea>
                                    </div>
                                </SectionCard>

                                <SectionCard
                                    title="Duration & Coaching"
                                    subtitle="Call-length quality and recommendation pressure map."
                                    icon={<Clock3 className="h-4 w-4" />}
                                >
                                    <div className="space-y-4">
                                        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] p-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Average call duration</p>
                                            <p className="mt-1 text-4xl font-bold text-[var(--color-text-primary)]">{formatDuration(summary?.avg_duration_seconds ?? 0)}</p>
                                            <p className="text-xs text-[var(--color-text-muted)]">Target healthy range: 35s to 80s</p>
                                        </div>

                                        <div className="space-y-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] p-3">
                                            <div>
                                                <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                                                    <span>AI confidence</span>
                                                    <span className="font-semibold text-[var(--color-text-primary)]">{formatPercent(aiConfidence)}</span>
                                                </div>
                                                <Progress value={aiConfidence} indicatorClassName="bg-[var(--color-primary-500)]" />
                                            </div>
                                            <div>
                                                <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                                                    <span>Follow-up pressure</span>
                                                    <span className="font-semibold text-[var(--color-text-primary)]">{formatPercent(followUpRate)}</span>
                                                </div>
                                                <Progress value={followUpRate} indicatorClassName="bg-[var(--color-warning-500)]" />
                                            </div>
                                            <div>
                                                <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                                                    <span>Fake-call risk</span>
                                                    <span className="font-semibold text-[var(--color-text-primary)]">{formatPercent(fakeRate)}</span>
                                                </div>
                                                <Progress value={fakeRate} indicatorClassName="bg-[var(--color-critical-500)]" />
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] p-3">
                                            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Primary recommendation</p>
                                            <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                                                {fakeRate >= 25
                                                    ? 'Prioritize trust audit and caller verification on high-risk cohorts.'
                                                    : followUpRate >= 35
                                                      ? 'Increase objection-handling drills to clear follow-up backlog.'
                                                      : conversionRate < 6
                                                        ? 'Coach discovery questions and qualification checkpoints.'
                                                        : 'Keep the playbook steady and replicate top-performer scripts.'}
                                            </p>
                                        </div>
                                    </div>
                                </SectionCard>
                            </section>

                            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                                <SectionCard
                                    title="Operational Trend Intelligence"
                                    subtitle="Total calls, fake volume, interested outcomes, and conversion trajectory — real per-day data."
                                    icon={<Gauge className="h-4 w-4" />}
                                >
                                    <PresalesMultiTrendChart data={trendSeries} height={236} />
                                </SectionCard>

                                <SectionCard
                                    title="Number Request Activity"
                                    subtitle="Daily count of calls where agents asked leads for their mobile number."
                                    icon={<ShieldAlert className="h-4 w-4" />}
                                    className="border-rose-500/30"
                                >
                                    <div className="mb-3 grid grid-cols-2 gap-2">
                                        <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 p-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-300">Total Incidents</p>
                                            <p className="text-2xl font-bold text-[var(--color-text-primary)]">{formatCount(numberRequests)}</p>
                                        </div>
                                        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] p-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Incident Rate</p>
                                            <p className="text-2xl font-bold text-[var(--color-text-primary)]">{formatPercent(numberRequestRate)}</p>
                                        </div>
                                    </div>
                                    <NumberRequestsTrendChart data={numberRequestSeries} height={160} />
                                    {numberRequests === 0 && (
                                        <p className="mt-2 text-center text-xs text-[var(--color-text-muted)]">
                                            No number requests detected in this period.
                                        </p>
                                    )}
                                </SectionCard>
                            </section>

                            <section>
                                <SectionCard
                                    title="Agent Intelligence Table"
                                    subtitle="Health score, risk pattern, momentum, and coaching action per agent/team."
                                    icon={<Bot className="h-4 w-4" />}
                                    actions={
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Tabs value={view} onValueChange={(value) => setView(value as TableView)}>
                                                <TabsList>
                                                    <TabsTrigger value="agents">Agents</TabsTrigger>
                                                    <TabsTrigger value="teams">Teams</TabsTrigger>
                                                </TabsList>
                                            </Tabs>

                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" size="sm">
                                                        Sort: {SORT_LABELS[sortBy]}
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuRadioGroup value={sortBy} onValueChange={(value) => setSortBy(value as TableSort)}>
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
                                                    <Button variant="outline" size="sm">
                                                        <Filter className="h-3.5 w-3.5" />
                                                        Insights
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => setShowAllRows(false)}>Top 8 focus</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setShowAllRows(true)}>View full list</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    }
                                >
                                    <div className="space-y-3">
                                        <div className="relative">
                                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                                            <Input
                                                value={query}
                                                onChange={(event) => setQuery(event.target.value)}
                                                placeholder={`Search ${view} by name, email, or leader...`}
                                                className="pl-9"
                                            />
                                        </div>

                                        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-card)]">
                                            <ScrollArea className={showAllRows ? 'h-[31rem]' : 'h-[24rem]'}>
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>{view === 'agents' ? 'Agent' : 'Team'}</TableHead>
                                                            <TableHead className="text-center">Calls</TableHead>
                                                            <TableHead className="text-center">Risk</TableHead>
                                                            <TableHead className="text-center">Momentum</TableHead>
                                                            <TableHead className="text-right">Interested</TableHead>
                                                            <TableHead className="text-right">Fake</TableHead>
                                                            <TableHead className="text-right">🚨 Nr. Req.</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {visibleRows.map((row) => (
                                                            <TableRow key={row.id}>
                                                                <TableCell>
                                                                    <div className="flex items-start gap-2">
                                                                        <Avatar name={row.label} src={null} size="sm" />
                                                                        <div className="min-w-0">
                                                                            <p className="truncate font-semibold text-[var(--color-text-primary)]">{row.label}</p>
                                                                            <p className="text-xs text-[var(--color-text-muted)]">
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
                                                                    <p className="font-semibold text-[var(--color-text-primary)]">{formatCount(row.total_calls)}</p>
                                                                    <p className="text-xs text-[var(--color-text-muted)]">{Math.round(row.analyzed_rate * 100)}% analyzed</p>
                                                                </TableCell>
                                                                <TableCell className="text-center">
                                                                    <div className="space-y-1">
                                                                        <div className="flex justify-center">{riskBadge(row.risk_level)}</div>
                                                                        <p className="text-[11px] text-[var(--color-text-muted)]">{row.risk_reason}</p>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-center">{momentumNode(row.momentum)}</TableCell>
                                                                <TableCell className="text-right">
                                                                    <span className="font-semibold text-[var(--color-text-primary)]">{formatPercent(row.interested_rate * 100)}</span>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <span className="font-semibold text-[var(--color-text-primary)]">{formatPercent(row.fake_rate * 100)}</span>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    {row.number_requests > 0 ? (
                                                                        <span className="font-semibold text-rose-500">{formatCount(row.number_requests)}</span>
                                                                    ) : (
                                                                        <span className="text-[var(--color-text-muted)]">—</span>
                                                                    )}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}

                                                        {!visibleRows.length ? (
                                                            <TableRow>
                                                                <TableCell colSpan={7} className="py-10 text-center text-sm text-[var(--color-text-muted)]">
                                                                    No matching {view} found for the current query.
                                                                </TableCell>
                                                            </TableRow>
                                                        ) : null}
                                                    </TableBody>
                                                </Table>
                                            </ScrollArea>
                                        </div>

                                        {filteredRows.length > 8 ? (
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs text-[var(--color-text-muted)]">
                                                    Showing {visibleRows.length} of {filteredRows.length} {view}
                                                </p>
                                                <Button variant="outline" size="sm" onClick={() => setShowAllRows((prev) => !prev)}>
                                                    {showAllRows ? 'Show top 8' : `Show all (${filteredRows.length})`}
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                </SectionCard>
                            </section>
                        </>
                    ) : null}
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
