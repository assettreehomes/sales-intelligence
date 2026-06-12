'use client';

import Link from 'next/link';
import {
    type ComponentType,
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    BarChart3,
    Bot,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ChevronsUpDown,
    CirclePause,
    Clock3,
    Download,
    ExternalLink,
    Gauge,
    Layers3,
    Loader2,
    MoreHorizontal,
    Pencil,
    RefreshCw,
    RotateCcw,
    Search,
    ServerCog,
    ShieldCheck,
    Sparkles,
    TimerReset,
    TriangleAlert,
    Users,
    XCircle,
    Zap
} from 'lucide-react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis
} from 'recharts';

import { AdminShell } from '@/components/AdminShell';
import { PageHeader } from '@/components/dashboard/page-header';
import { SectionCard } from '@/components/dashboard/section-card';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { notifyError, notifyInfo, notifySuccess } from '@/lib/toast';
import { API_URL } from '@/stores/authStore';

interface QueueStats {
    active: number;
    waiting: number;
    maxConcurrent: number;
    rpm: number;
    maxRpm: number;
}

interface TicketCounts {
    pending: number;
    processing: number;
    retryable: number;
    permanent_failed: number;
}

interface StuckTicket {
    id: string;
    name: string;
    agent: string | null;
    stuck_min: number;
}

interface QueueStatus {
    queue: QueueStats;
    tickets: TicketCounts;
    stuck: StuckTicket[];
    autoRetry: {
        batchSize: number;
        intervalMinutes: number;
    };
}

interface QueueSnapshot {
    timestamp: number;
    waiting: number;
    active: number;
    processing: number;
    failed: number;
    rpm: number;
}

interface ActivityEvent {
    id: string;
    timestamp: number;
    title: string;
    detail: string;
    tone: 'success' | 'warning' | 'danger' | 'info';
}

type HealthTone = 'healthy' | 'warning' | 'critical';
type TimeRange = '1H' | '24H' | '7D' | '30D';
type SortKey = 'name' | 'priority' | 'stuck';
type SortDirection = 'asc' | 'desc';

const HISTORY_KEY = 'analysis-queue-telemetry-v3';
const MAX_HISTORY_AGE = 30 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_POINTS = 1000;
const PAGE_SIZE = 10;

const RANGE_MS: Record<TimeRange, number> = {
    '1H': 60 * 60 * 1000,
    '24H': 24 * 60 * 60 * 1000,
    '7D': 7 * 24 * 60 * 60 * 1000,
    '30D': 30 * 24 * 60 * 60 * 1000
};

const CHART_COLORS = {
    primary: '#8b5cf6',
    processing: '#3b82f6',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444'
};

const chartTooltipStyle = {
    background: 'var(--chart-tooltip-bg)',
    border: '1px solid var(--chart-tooltip-border)',
    borderRadius: '12px',
    boxShadow: 'var(--elevation-2)',
    color: 'var(--chart-text-strong)',
    fontSize: '12px'
};

function clamp(value: number, min = 0, max = 100) {
    return Math.min(Math.max(value, min), max);
}

function safePercent(value: number, total: number) {
    return total > 0 ? Math.round((value / total) * 100) : 0;
}

function formatCompact(value: number) {
    return new Intl.NumberFormat('en-US', {
        notation: value >= 1000 ? 'compact' : 'standard',
        maximumFractionDigits: 1
    }).format(value);
}

function formatClock(timestamp: number) {
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    }).format(timestamp);
}

function formatChartTime(timestamp: number, range: TimeRange) {
    return new Intl.DateTimeFormat('en-US', {
        ...(range === '1H' || range === '24H'
            ? { hour: 'numeric', minute: '2-digit' }
            : { month: 'short', day: 'numeric' })
    }).format(timestamp);
}

function relativeTime(seconds: number) {
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
}

function getPriority(minutes: number) {
    if (minutes >= 45) return 'Critical';
    if (minutes >= 30) return 'High';
    if (minutes >= 20) return 'Medium';
    return 'Low';
}

function priorityRank(priority: string) {
    return { Critical: 4, High: 3, Medium: 2, Low: 1 }[priority] ?? 0;
}

function buildSnapshot(status: QueueStatus): QueueSnapshot {
    return {
        timestamp: Date.now(),
        waiting: status.queue.waiting,
        active: status.queue.active,
        processing: status.tickets.processing,
        failed: status.tickets.retryable + status.tickets.permanent_failed,
        rpm: status.queue.rpm
    };
}

function readHistory() {
    if (typeof window === 'undefined') return [] as QueueSnapshot[];
    try {
        const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]') as QueueSnapshot[];
        const cutoff = Date.now() - MAX_HISTORY_AGE;
        return parsed
            .filter((point) => Number.isFinite(point.timestamp) && point.timestamp >= cutoff)
            .slice(-MAX_HISTORY_POINTS);
    } catch {
        return [] as QueueSnapshot[];
    }
}

function persistHistory(history: QueueSnapshot[]) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY_POINTS)));
}

function buildActivity(previous: QueueStatus | null, next: QueueStatus): ActivityEvent[] {
    const timestamp = Date.now();
    if (!previous) {
        return [{
            id: `connected-${timestamp}`,
            timestamp,
            title: 'Queue telemetry connected',
            detail: `${next.queue.active} active · ${next.queue.waiting} waiting`,
            tone: 'info'
        }];
    }

    const events: ActivityEvent[] = [];
    const waitingDelta = next.queue.waiting - previous.queue.waiting;
    const processingDelta = next.tickets.processing - previous.tickets.processing;
    const failedDelta =
        next.tickets.retryable +
        next.tickets.permanent_failed -
        previous.tickets.retryable -
        previous.tickets.permanent_failed;

    if (waitingDelta > 0) {
        events.push({
            id: `queued-${timestamp}`,
            timestamp,
            title: `${waitingDelta} job${waitingDelta === 1 ? '' : 's'} entered the queue`,
            detail: `Queue depth is now ${next.queue.waiting}`,
            tone: 'warning'
        });
    }

    if (waitingDelta < 0) {
        events.push({
            id: `picked-${timestamp}`,
            timestamp,
            title: `${Math.abs(waitingDelta)} job${waitingDelta === -1 ? '' : 's'} picked up`,
            detail: `Queue depth reduced to ${next.queue.waiting}`,
            tone: 'success'
        });
    }

    if (processingDelta < 0) {
        events.push({
            id: `completed-${timestamp}`,
            timestamp,
            title: `${Math.abs(processingDelta)} processing job${processingDelta === -1 ? '' : 's'} cleared`,
            detail: 'Inferred from the latest queue snapshot',
            tone: 'success'
        });
    }

    if (failedDelta > 0) {
        events.push({
            id: `failed-${timestamp}`,
            timestamp,
            title: `${failedDelta} new failure${failedDelta === 1 ? '' : 's'} detected`,
            detail: 'Reason-level diagnostics are not exposed by the queue API',
            tone: 'danger'
        });
    }

    if (previous.stuck.length !== next.stuck.length) {
        events.push({
            id: `stuck-${timestamp}`,
            timestamp,
            title: `${next.stuck.length} ticket${next.stuck.length === 1 ? '' : 's'} currently stuck`,
            detail: 'Processing for longer than 10 minutes',
            tone: next.stuck.length > previous.stuck.length ? 'warning' : 'success'
        });
    }

    return events;
}

function calculateHealth(status: QueueStatus | null) {
    if (!status) {
        return { score: 0, tone: 'warning' as HealthTone, label: 'Connecting' };
    }

    const failures = status.tickets.retryable + status.tickets.permanent_failed;
    const workload = status.tickets.pending + status.tickets.processing + failures;
    const failureRate = safePercent(failures, workload);
    const rpmUtilization = safePercent(status.queue.rpm, status.queue.maxRpm);
    const concurrency = safePercent(status.queue.active, status.queue.maxConcurrent);
    const backlogPenalty = Math.min(22, status.queue.waiting * 0.45);
    const stuckPenalty = Math.min(28, status.stuck.length * 4);
    const failurePenalty = Math.min(30, failureRate * 0.7);
    const saturationPenalty = rpmUtilization >= 100 ? 12 : rpmUtilization >= 85 ? 6 : 0;
    const idlePenalty = status.queue.waiting > 0 && concurrency === 0 ? 15 : 0;
    const score = Math.round(clamp(
        100 - backlogPenalty - stuckPenalty - failurePenalty - saturationPenalty - idlePenalty
    ));
    const tone: HealthTone = score >= 80 ? 'healthy' : score >= 55 ? 'warning' : 'critical';

    return {
        score,
        tone,
        label: tone === 'healthy' ? 'Healthy' : tone === 'warning' ? 'Warning' : 'Critical'
    };
}

function trendPercent(current: number, previous?: number) {
    if (previous === undefined || previous === 0) return null;
    return Math.round(((current - previous) / previous) * 100);
}

function MetricCard({
    label,
    value,
    suffix,
    context,
    icon: Icon,
    tone,
    sparkline,
    trend,
    positiveUp = true,
    loading,
    unavailable = false
}: {
    label: string;
    value: string | number;
    suffix?: string;
    context: string;
    icon: ComponentType<{ className?: string }>;
    tone: 'primary' | 'blue' | 'green' | 'amber' | 'red';
    sparkline: number[];
    trend: number | null;
    positiveUp?: boolean;
    loading: boolean;
    unavailable?: boolean;
}) {
    const tones = {
        primary: {
            icon: 'border-violet-500/25 bg-violet-500/12 text-violet-600 dark:text-violet-300',
            value: 'text-[var(--semantic-text-primary)]',
            color: CHART_COLORS.primary
        },
        blue: {
            icon: 'border-blue-500/25 bg-blue-500/12 text-blue-600 dark:text-blue-300',
            value: 'text-blue-600 dark:text-blue-300',
            color: CHART_COLORS.processing
        },
        green: {
            icon: 'border-emerald-500/25 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
            value: 'text-emerald-600 dark:text-emerald-300',
            color: CHART_COLORS.success
        },
        amber: {
            icon: 'border-amber-500/25 bg-amber-500/12 text-amber-600 dark:text-amber-300',
            value: 'text-amber-600 dark:text-amber-300',
            color: CHART_COLORS.warning
        },
        red: {
            icon: 'border-rose-500/25 bg-rose-500/12 text-rose-600 dark:text-rose-300',
            value: 'text-rose-600 dark:text-rose-300',
            color: CHART_COLORS.danger
        }
    };
    const selected = tones[tone];
    const favorable = trend === null || trend === 0 || (trend > 0 && positiveUp) || (trend < 0 && !positiveUp);
    const chartData = sparkline.map((point, index) => ({ index, value: point }));

    return (
        <Card className="group relative h-full overflow-hidden border-[var(--semantic-border)] bg-[var(--semantic-surface)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--semantic-border-strong)] hover:shadow-[var(--elevation-2)]">
            <div
                className="absolute inset-x-0 top-0 h-0.5 opacity-80"
                style={{ background: `linear-gradient(90deg, transparent, ${selected.color}, transparent)` }}
            />
            <CardContent className="flex h-full min-h-[168px] flex-col p-4">
                {loading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-8 w-8 rounded-xl" />
                        <Skeleton className="h-8 w-20" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                ) : (
                    <>
                        <div className="flex items-start justify-between gap-3">
                            <div className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl border', selected.icon)}>
                                <Icon className="h-4 w-4" />
                            </div>
                            {unavailable ? (
                                <Badge variant="secondary" className="text-[10px]">Unavailable</Badge>
                            ) : trend === null ? (
                                <span className="text-[10px] font-medium text-[var(--semantic-text-muted)]">Live</span>
                            ) : (
                                <span
                                    className={cn(
                                        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold',
                                        favorable
                                            ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300'
                                            : 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
                                    )}
                                >
                                    {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                    {Math.abs(trend)}%
                                </span>
                            )}
                        </div>

                        <div className="mt-4 flex items-end justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--semantic-text-muted)]">
                                    {label}
                                </p>
                                <div className="mt-1.5 flex items-baseline gap-1">
                                    <span className={cn('text-3xl font-bold leading-none tracking-tight', selected.value, unavailable && 'text-[var(--semantic-text-muted)]')}>
                                        {value}
                                    </span>
                                    {suffix ? <span className="text-xs font-medium text-[var(--semantic-text-muted)]">{suffix}</span> : null}
                                </div>
                            </div>
                            <div className="h-10 w-20 shrink-0">
                                {chartData.length > 1 && !unavailable ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData}>
                                            <Area
                                                type="monotone"
                                                dataKey="value"
                                                stroke={selected.color}
                                                strokeWidth={2}
                                                fill={selected.color}
                                                fillOpacity={0.1}
                                                isAnimationActive
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : null}
                            </div>
                        </div>

                        <p className="mt-auto pt-3 text-[11px] leading-4 text-[var(--semantic-text-muted)]">{context}</p>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function HealthBadge({ tone, label }: { tone: HealthTone; label: string }) {
    if (tone === 'healthy') {
        return <StatusBadge status="online" dot>{label}</StatusBadge>;
    }
    if (tone === 'warning') {
        return <StatusBadge status="pending" dot>{label}</StatusBadge>;
    }
    return <StatusBadge status="rejected" dot>{label}</StatusBadge>;
}

function HealthOverview({ status, loading }: { status: QueueStatus | null; loading: boolean }) {
    const health = calculateHealth(status);
    const failures = status ? status.tickets.retryable + status.tickets.permanent_failed : 0;
    const workload = status ? status.tickets.pending + status.tickets.processing + failures : 0;
    const successProxy = clamp(100 - safePercent(failures, workload));
    const rpmUtilization = status ? safePercent(status.queue.rpm, status.queue.maxRpm) : 0;
    const concurrency = status ? safePercent(status.queue.active, status.queue.maxConcurrent) : 0;
    const backlogPressure = status
        ? clamp(safePercent(status.queue.waiting, Math.max(status.queue.maxConcurrent * 10, 1)))
        : 0;

    const signals = [
        { label: 'Healthy workload', value: successProxy, display: `${successProxy}%`, color: 'bg-emerald-500' },
        { label: 'RPM utilization', value: rpmUtilization, display: `${status?.queue.rpm ?? 0}/${status?.queue.maxRpm ?? 0}`, color: 'bg-violet-500' },
        { label: 'Concurrency', value: concurrency, display: `${status?.queue.active ?? 0}/${status?.queue.maxConcurrent ?? 0}`, color: 'bg-blue-500' },
        { label: 'Backlog pressure', value: backlogPressure, display: `${status?.queue.waiting ?? 0} waiting`, color: 'bg-amber-500' }
    ];

    return (
        <SectionCard
            title="Queue Health"
            subtitle="Composite score from live failures, saturation, backlog, and stuck work."
            icon={<ShieldCheck className="h-4 w-4" />}
            actions={<HealthBadge tone={health.tone} label={health.label} />}
            className="h-full"
            contentClassName="space-y-5"
        >
            {loading ? (
                <Skeleton className="h-[280px] rounded-xl" />
            ) : (
                <>
                    <div className="grid grid-cols-[128px_1fr] items-center gap-5 rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-muted)]/55 p-4">
                        <div className="relative flex h-28 w-28 items-center justify-center">
                            <div
                                className="absolute inset-0 rounded-full"
                                style={{
                                    background: `conic-gradient(${health.tone === 'healthy' ? CHART_COLORS.success : health.tone === 'warning' ? CHART_COLORS.warning : CHART_COLORS.danger} ${health.score * 3.6}deg, var(--surface-hover) 0deg)`
                                }}
                            />
                            <div className="absolute inset-[9px] rounded-full bg-[var(--semantic-surface)]" />
                            <div className="relative text-center">
                                <p className="text-3xl font-bold text-[var(--semantic-text-primary)]">{health.score}</p>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--semantic-text-muted)]">of 100</p>
                            </div>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-[var(--semantic-text-primary)]">
                                {health.tone === 'healthy' ? 'Pipeline is operating normally' : health.tone === 'warning' ? 'Pipeline needs attention' : 'Pipeline is degraded'}
                            </p>
                            <p className="mt-1.5 text-xs leading-5 text-[var(--semantic-text-muted)]">
                                {status?.stuck.length
                                    ? `${status.stuck.length} stuck ticket${status.stuck.length === 1 ? '' : 's'} are reducing the health score.`
                                    : 'No tickets are currently outside the expected processing window.'}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <Badge variant="secondary">{status?.tickets.pending ?? 0} pending</Badge>
                                <Badge variant="warning">{status?.tickets.retryable ?? 0} retryable</Badge>
                                <Badge variant="destructive">{status?.tickets.permanent_failed ?? 0} permanent</Badge>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {signals.map((signal) => (
                            <div key={signal.label}>
                                <div className="mb-1.5 flex items-center justify-between text-xs">
                                    <span className="text-[var(--semantic-text-secondary)]">{signal.label}</span>
                                    <span className="font-semibold text-[var(--semantic-text-primary)]">{signal.display}</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-hover)]">
                                    <div
                                        className={cn('h-full rounded-full transition-all duration-700', signal.color)}
                                        style={{ width: `${signal.value}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </SectionCard>
    );
}

function QueueVolumeChart({
    history,
    range,
    onRangeChange
}: {
    history: QueueSnapshot[];
    range: TimeRange;
    onRangeChange: (range: TimeRange) => void;
}) {
    const latestTimestamp = history.at(-1)?.timestamp ?? 0;
    const cutoff = latestTimestamp - RANGE_MS[range];
    const chartData = history
        .filter((point) => point.timestamp >= cutoff)
        .map((point) => ({
            ...point,
            label: formatChartTime(point.timestamp, range)
        }));

    return (
        <SectionCard
            title="Queue Throughput"
            subtitle="Live browser-captured trend of queue depth, processing volume, and failures."
            icon={<BarChart3 className="h-4 w-4" />}
            actions={
                <div className="inline-flex rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-elevated)] p-1">
                    {(Object.keys(RANGE_MS) as TimeRange[]).map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => onRangeChange(item)}
                            className={cn(
                                'rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                                range === item
                                    ? 'bg-[var(--semantic-primary)] text-white shadow-[var(--elevation-1)]'
                                    : 'text-[var(--semantic-text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--semantic-text-primary)]'
                            )}
                        >
                            {item}
                        </button>
                    ))}
                </div>
            }
            className="h-full"
        >
            <div className="h-[318px]">
                {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                            <defs>
                                <linearGradient id="queue-volume-fill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                                    <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="processing-fill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={CHART_COLORS.processing} stopOpacity={0.18} />
                                    <stop offset="100%" stopColor={CHART_COLORS.processing} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                            <XAxis
                                dataKey="label"
                                tick={{ fill: 'var(--chart-text)', fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                                minTickGap={42}
                            />
                            <YAxis
                                allowDecimals={false}
                                tick={{ fill: 'var(--chart-text)', fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <RechartsTooltip
                                contentStyle={chartTooltipStyle}
                                labelStyle={{ color: 'var(--chart-text)', marginBottom: 6 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="waiting"
                                name="Waiting"
                                stroke={CHART_COLORS.primary}
                                strokeWidth={2.5}
                                fill="url(#queue-volume-fill)"
                                activeDot={{ r: 4 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="processing"
                                name="Processing"
                                stroke={CHART_COLORS.processing}
                                strokeWidth={2}
                                fill="url(#processing-fill)"
                            />
                            <Line
                                type="monotone"
                                dataKey="failed"
                                name="Failures"
                                stroke={CHART_COLORS.danger}
                                strokeWidth={2}
                                dot={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-[var(--semantic-border)] bg-[var(--semantic-surface-muted)]/45 text-center">
                        <Activity className="h-7 w-7 text-[var(--semantic-text-muted)]" />
                        <p className="mt-3 text-sm font-semibold text-[var(--semantic-text-primary)]">Collecting queue telemetry</p>
                        <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--semantic-text-muted)]">
                            The graph builds from the live 10-second polling cycle on this browser.
                        </p>
                    </div>
                )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--semantic-border)] pt-3 text-[11px] text-[var(--semantic-text-muted)]">
                <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-violet-500" />Waiting</span>
                <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-blue-500" />Processing</span>
                <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-rose-500" />Failures</span>
                <span className="ml-auto">Session telemetry · no synthetic data</span>
            </div>
        </SectionCard>
    );
}

function OperationalInsights({ status }: { status: QueueStatus | null }) {
    const insights = useMemo(() => {
        if (!status) return [];

        const failures = status.tickets.retryable + status.tickets.permanent_failed;
        const rpmUtilization = safePercent(status.queue.rpm, status.queue.maxRpm);
        const concurrency = safePercent(status.queue.active, status.queue.maxConcurrent);
        const rows: Array<{
            title: string;
            detail: string;
            tone: 'success' | 'warning' | 'danger' | 'info';
            icon: ComponentType<{ className?: string }>;
        }> = [];

        if (status.queue.waiting === 0) {
            rows.push({
                title: 'Queue is fully drained',
                detail: 'No analysis jobs are waiting for capacity.',
                tone: 'success',
                icon: CheckCircle2
            });
        } else if (status.queue.waiting > status.queue.maxConcurrent * 5) {
            rows.push({
                title: 'Backlog is building',
                detail: `${status.queue.waiting} jobs are competing for ${status.queue.maxConcurrent} worker slots.`,
                tone: 'warning',
                icon: Layers3
            });
        }

        if (rpmUtilization >= 90) {
            rows.push({
                title: 'RPM headroom is low',
                detail: `Vertex usage is at ${rpmUtilization}% of the configured limit.`,
                tone: 'warning',
                icon: Gauge
            });
        } else {
            rows.push({
                title: 'Rate limit has headroom',
                detail: `${Math.max(0, status.queue.maxRpm - status.queue.rpm)} requests per minute remain available.`,
                tone: 'success',
                icon: Zap
            });
        }

        if (status.stuck.length) {
            rows.push({
                title: `${status.stuck.length} ticket${status.stuck.length === 1 ? '' : 's'} at timeout risk`,
                detail: 'Review or retry work held in processing for more than 10 minutes.',
                tone: 'danger',
                icon: TimerReset
            });
        }

        if (failures) {
            rows.push({
                title: `${failures} unresolved failure${failures === 1 ? '' : 's'}`,
                detail: `${status.tickets.retryable} can retry; ${status.tickets.permanent_failed} require investigation.`,
                tone: 'warning',
                icon: AlertCircle
            });
        }

        if (status.queue.waiting > 0 && concurrency >= 95) {
            rows.push({
                title: 'Concurrency is saturated',
                detail: `Validate quotas before increasing beyond ${status.queue.maxConcurrent} slots.`,
                tone: 'info',
                icon: Sparkles
            });
        }

        return rows.slice(0, 4);
    }, [status]);

    const toneClass = {
        success: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-300',
        warning: 'border-amber-500/25 bg-amber-500/8 text-amber-600 dark:text-amber-300',
        danger: 'border-rose-500/25 bg-rose-500/8 text-rose-600 dark:text-rose-300',
        info: 'border-blue-500/25 bg-blue-500/8 text-blue-600 dark:text-blue-300'
    };

    return (
        <SectionCard
            title="Operational Insights"
            subtitle="Actionable recommendations derived from the live payload."
            icon={<Bot className="h-4 w-4" />}
            actions={<Badge variant="default">Live rules</Badge>}
            className="h-full"
        >
            <div className="space-y-3">
                {insights.length ? insights.map((insight) => {
                    const Icon = insight.icon;
                    return (
                        <div key={insight.title} className={cn('rounded-xl border p-3.5', toneClass[insight.tone])}>
                            <div className="flex items-start gap-3">
                                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                                <div>
                                    <p className="text-xs font-semibold text-[var(--semantic-text-primary)]">{insight.title}</p>
                                    <p className="mt-1 text-[11px] leading-5 text-[var(--semantic-text-muted)]">{insight.detail}</p>
                                </div>
                            </div>
                        </div>
                    );
                }) : (
                    <Skeleton className="h-64 rounded-xl" />
                )}
            </div>
        </SectionCard>
    );
}

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
    const dotClass = {
        success: 'bg-emerald-500',
        warning: 'bg-amber-500',
        danger: 'bg-rose-500',
        info: 'bg-blue-500'
    };

    return (
        <SectionCard
            title="Live Activity"
            subtitle="Changes inferred from each live queue snapshot."
            icon={<Activity className="h-4 w-4" />}
            actions={<StatusBadge status="online" dot size="sm">Streaming</StatusBadge>}
            className="h-full"
        >
            <ScrollArea className="h-[300px] pr-3">
                <div className="relative space-y-0 pl-5">
                    <div className="absolute bottom-3 left-[4px] top-3 w-px bg-[var(--semantic-border)]" />
                    {events.length ? events.map((event) => (
                        <div key={event.id} className="relative pb-5">
                            <span className={cn('absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--semantic-surface)]', dotClass[event.tone])} />
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold text-[var(--semantic-text-primary)]">{event.title}</p>
                                    <p className="mt-1 text-[11px] leading-5 text-[var(--semantic-text-muted)]">{event.detail}</p>
                                </div>
                                <time className="shrink-0 text-[10px] font-medium text-[var(--semantic-text-muted)]">
                                    {formatClock(event.timestamp)}
                                </time>
                            </div>
                        </div>
                    )) : (
                        <div className="flex h-64 flex-col items-center justify-center text-center">
                            <Activity className="h-6 w-6 text-[var(--semantic-text-muted)]" />
                            <p className="mt-3 text-xs text-[var(--semantic-text-muted)]">Waiting for queue activity.</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </SectionCard>
    );
}

function FailureAnalytics({ status }: { status: QueueStatus | null }) {
    const retryable = status?.tickets.retryable ?? 0;
    const permanent = status?.tickets.permanent_failed ?? 0;
    const total = retryable + permanent;
    const data = [
        { name: 'Retryable', value: retryable, percent: safePercent(retryable, total), color: CHART_COLORS.warning },
        { name: 'Permanent', value: permanent, percent: safePercent(permanent, total), color: CHART_COLORS.danger }
    ];

    return (
        <SectionCard
            title="Failure Analytics"
            subtitle="Current failure classes reported by the queue API."
            icon={<AlertTriangle className="h-4 w-4" />}
            actions={<Badge variant={total ? 'destructive' : 'success'}>{total} total</Badge>}
            className="h-full"
        >
            <div className="space-y-5">
                <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: -4, bottom: 0 }}>
                            <XAxis type="number" hide />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={72}
                                tick={{ fill: 'var(--chart-text)', fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <RechartsTooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'var(--chart-muted)' }} />
                            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                                {data.map((row) => <Cell key={row.name} fill={row.color} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="space-y-4">
                    {data.map((row) => (
                        <div key={row.name}>
                            <div className="mb-1.5 flex items-center justify-between text-xs">
                                <span className="text-[var(--semantic-text-secondary)]">{row.name}</span>
                                <span className="font-semibold text-[var(--semantic-text-primary)]">{row.value} · {row.percent}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-hover)]">
                                <div className="h-full rounded-full" style={{ width: `${row.percent}%`, backgroundColor: row.color }} />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="rounded-xl border border-dashed border-[var(--semantic-border)] bg-[var(--semantic-surface-muted)]/45 p-3 text-[11px] leading-5 text-[var(--semantic-text-muted)]">
                    Vertex timeout, RPM, parsing, and metadata reason codes are not included in the current response.
                </div>
            </div>
        </SectionCard>
    );
}

function PriorityBadge({ priority }: { priority: string }) {
    return (
        <span
            className={cn(
                'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold',
                priority === 'Critical' && 'border-rose-500/30 bg-rose-500/12 text-rose-600 dark:text-rose-300',
                priority === 'High' && 'border-orange-500/30 bg-orange-500/12 text-orange-600 dark:text-orange-300',
                priority === 'Medium' && 'border-amber-500/30 bg-amber-500/12 text-amber-600 dark:text-amber-300',
                priority === 'Low' && 'border-blue-500/30 bg-blue-500/12 text-blue-600 dark:text-blue-300'
            )}
        >
            {priority}
        </span>
    );
}

function SortButton({
    sort,
    onSort,
    children
}: {
    sort: SortKey;
    onSort: (sort: SortKey) => void;
    children: ReactNode;
}) {
    return (
        <button type="button" onClick={() => onSort(sort)} className="inline-flex items-center gap-1 hover:text-[var(--semantic-text-primary)]">
            {children}
            <ChevronsUpDown className="h-3 w-3" />
        </button>
    );
}

function StuckTicketsTable({
    tickets,
    resettingTicket,
    onRetry
}: {
    tickets: StuckTicket[];
    resettingTicket: string | null;
    onRetry: (id: string) => Promise<void>;
}) {
    const [query, setQuery] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('stuck');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return tickets
            .filter((ticket) =>
                !needle ||
                ticket.id.toLowerCase().includes(needle) ||
                ticket.name.toLowerCase().includes(needle) ||
                (ticket.agent || '').toLowerCase().includes(needle)
            )
            .sort((left, right) => {
                let comparison = 0;
                if (sortKey === 'name') comparison = left.name.localeCompare(right.name);
                if (sortKey === 'stuck') comparison = left.stuck_min - right.stuck_min;
                if (sortKey === 'priority') {
                    comparison = priorityRank(getPriority(left.stuck_min)) - priorityRank(getPriority(right.stuck_min));
                }
                return sortDirection === 'asc' ? comparison : -comparison;
            });
    }, [query, sortDirection, sortKey, tickets]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const handleSort = (key: SortKey) => {
        setPage(1);
        if (sortKey === key) {
            setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection(key === 'name' ? 'asc' : 'desc');
        }
    };

    const handleEscalate = async (ticket: StuckTicket) => {
        const summary = `Queue escalation: ${ticket.id} (${ticket.name}) has been stuck in processing for ${ticket.stuck_min} minutes. Assigned agent: ${ticket.agent || 'Unassigned'}.`;
        try {
            await navigator.clipboard.writeText(summary);
            notifySuccess('Escalation summary copied');
        } catch {
            notifyInfo(summary);
        }
    };

    return (
        <SectionCard
            title="Stuck Tickets"
            subtitle="Processing longer than 10 minutes. Priority is derived from time stuck."
            icon={<TimerReset className="h-4 w-4" />}
            actions={
                <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--semantic-text-muted)]" />
                    <Input
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setPage(1);
                        }}
                        placeholder="Search ticket, client, or agent"
                        className="h-9 pl-9 text-xs"
                    />
                </div>
            }
            contentClassName="px-0 pb-0"
        >
            {!tickets.length ? (
                <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                        <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-[var(--semantic-text-primary)]">No stuck tickets</p>
                    <p className="mt-1 text-xs text-[var(--semantic-text-muted)]">All processing jobs are inside the expected window.</p>
                </div>
            ) : (
                <>
                    <div className="max-h-[560px] overflow-auto">
                        <Table>
                            <TableHeader className="sticky top-0 z-10 bg-[var(--semantic-surface-elevated)]">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Ticket ID</TableHead>
                                    <TableHead><SortButton sort="name" onSort={handleSort}>Client</SortButton></TableHead>
                                    <TableHead><SortButton sort="priority" onSort={handleSort}>Priority</SortButton></TableHead>
                                    <TableHead>Stage</TableHead>
                                    <TableHead>Assigned Agent</TableHead>
                                    <TableHead><SortButton sort="stuck" onSort={handleSort}>Time Stuck</SortButton></TableHead>
                                    <TableHead>Signal</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visible.map((ticket) => {
                                    const priority = getPriority(ticket.stuck_min);
                                    return (
                                        <TableRow key={ticket.id}>
                                            <TableCell>
                                                <span className="font-mono text-xs font-semibold text-[var(--semantic-primary)]">{ticket.id.slice(0, 8)}</span>
                                            </TableCell>
                                            <TableCell className="max-w-56">
                                                <span className="block truncate font-semibold text-[var(--semantic-text-primary)]" title={ticket.name}>{ticket.name}</span>
                                            </TableCell>
                                            <TableCell><PriorityBadge priority={priority} /></TableCell>
                                            <TableCell>
                                                <StatusBadge status="idle" size="sm" dot>Processing</StatusBadge>
                                            </TableCell>
                                            <TableCell>{ticket.agent || 'Unassigned'}</TableCell>
                                            <TableCell>
                                                <span className={cn(
                                                    'font-semibold',
                                                    ticket.stuck_min >= 30
                                                        ? 'text-rose-600 dark:text-rose-300'
                                                        : 'text-amber-600 dark:text-amber-300'
                                                )}>
                                                    {ticket.stuck_min} min
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--semantic-text-muted)]">
                                                    <TriangleAlert className="h-3.5 w-3.5 text-amber-500" />
                                                    Timeout risk
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                            <span className="sr-only">Ticket actions</span>
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem asChild>
                                                            <Link href={`/admin/tickets/${ticket.id}`} className="cursor-pointer gap-2">
                                                                <ExternalLink className="h-3.5 w-3.5" />
                                                                View ticket
                                                            </Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            disabled={resettingTicket === ticket.id}
                                                            onSelect={() => void onRetry(ticket.id)}
                                                            className="cursor-pointer gap-2"
                                                        >
                                                            {resettingTicket === ticket.id
                                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                : <RotateCcw className="h-3.5 w-3.5" />}
                                                            Retry
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onSelect={() => void handleEscalate(ticket)} className="cursor-pointer gap-2">
                                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                                            Copy escalation
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-[var(--semantic-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-[var(--semantic-text-muted)]">
                            Showing {filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === 1}
                                onClick={() => setPage((value) => Math.max(1, value - 1))}
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                                Previous
                            </Button>
                            <span className="px-2 text-xs font-medium text-[var(--semantic-text-muted)]">
                                {currentPage} / {pageCount}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === pageCount}
                                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                            >
                                Next
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </SectionCard>
    );
}

function AutoRetryConfiguration({ status }: { status: QueueStatus | null }) {
    const [open, setOpen] = useState(false);
    const settings = [
        { label: 'Batch size', value: status?.autoRetry.batchSize ?? 0, suffix: 'tickets', icon: Layers3 },
        { label: 'Retry interval', value: status?.autoRetry.intervalMinutes ?? 0, suffix: 'minutes', icon: Clock3 },
        { label: 'RPM limit', value: status?.queue.maxRpm ?? 0, suffix: 'requests/min', icon: Gauge },
        { label: 'Max concurrency', value: status?.queue.maxConcurrent ?? 0, suffix: 'slots', icon: Users }
    ];

    return (
        <>
            <SectionCard
                title="Auto-Retry Configuration"
                subtitle="Runtime settings returned by the queue status endpoint."
                icon={<ServerCog className="h-4 w-4" />}
                actions={
                    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                    </Button>
                }
            >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {settings.map((setting) => {
                        const Icon = setting.icon;
                        return (
                            <div
                                key={setting.label}
                                className="rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-muted)]/55 p-4 transition-colors hover:border-[var(--semantic-border-strong)] hover:bg-[var(--surface-hover)]"
                            >
                                <div className="flex items-center gap-2 text-xs font-medium text-[var(--semantic-text-muted)]">
                                    <Icon className="h-4 w-4 text-[var(--semantic-primary)]" />
                                    {setting.label}
                                </div>
                                <div className="mt-3 flex items-baseline gap-1.5">
                                    <span className="text-2xl font-bold text-[var(--semantic-text-primary)]">{setting.value}</span>
                                    <span className="text-[11px] text-[var(--semantic-text-muted)]">{setting.suffix}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </SectionCard>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Queue configuration</DialogTitle>
                        <DialogDescription>
                            These values are controlled by backend environment variables. The dashboard displays them as read-only.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 py-2 sm:grid-cols-2">
                        {settings.map((setting) => (
                            <div key={setting.label} className="rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-muted)] p-3">
                                <p className="text-xs text-[var(--semantic-text-muted)]">{setting.label}</p>
                                <p className="mt-1 font-semibold text-[var(--semantic-text-primary)]">{setting.value} {setting.suffix}</p>
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setOpen(false)}>
                            <Check className="h-4 w-4" />
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function QueuePage() {
    const { session } = useAuth();
    const token = session?.access_token;
    const [status, setStatus] = useState<QueueStatus | null>(null);
    const [history, setHistory] = useState<QueueSnapshot[]>([]);
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [secondsAgo, setSecondsAgo] = useState(0);
    const [resettingTicket, setResettingTicket] = useState<string | null>(null);
    const [retryingAll, setRetryingAll] = useState(false);
    const [range, setRange] = useState<TimeRange>('24H');
    const previousStatusRef = useRef<QueueStatus | null>(null);

    useEffect(() => {
        setHistory(readHistory());
    }, []);

    const fetchStatus = useCallback(async (manual = false) => {
        if (!token) return;
        if (manual) setRefreshing(true);

        try {
            const response = await fetch(`${API_URL}/admin/queue/status`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error(`Queue status request failed (${response.status})`);
            }

            const nextStatus = await response.json() as QueueStatus;
            const snapshot = buildSnapshot(nextStatus);
            const nextEvents = buildActivity(previousStatusRef.current, nextStatus);

            setStatus(nextStatus);
            setEvents((current) => [...nextEvents, ...current].slice(0, 30));
            setHistory((current) => {
                const last = current.at(-1);
                const shouldAppend =
                    !last ||
                    Date.now() - last.timestamp >= 9_000 ||
                    last.waiting !== snapshot.waiting ||
                    last.active !== snapshot.active ||
                    last.processing !== snapshot.processing ||
                    last.failed !== snapshot.failed;
                const next = shouldAppend ? [...current, snapshot].slice(-MAX_HISTORY_POINTS) : current;
                persistHistory(next);
                return next;
            });
            previousStatusRef.current = nextStatus;
            setLastUpdated(new Date());
            setSecondsAgo(0);
            setError('');
        } catch (fetchError) {
            const message = fetchError instanceof Error ? fetchError.message : 'Unable to load queue telemetry';
            setError(message);
            if (manual) notifyError(message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [token]);

    useEffect(() => {
        void fetchStatus();
        const interval = window.setInterval(() => void fetchStatus(), 10_000);
        return () => window.clearInterval(interval);
    }, [fetchStatus]);

    useEffect(() => {
        const interval = window.setInterval(() => setSecondsAgo((value) => value + 1), 1000);
        return () => window.clearInterval(interval);
    }, []);

    const handleRetryTicket = useCallback(async (id: string) => {
        if (!token) return;
        setResettingTicket(id);
        try {
            const response = await fetch(`${API_URL}/admin/queue/ticket/${id}/reset`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Ticket retry failed');
            notifySuccess('Ticket returned to the retry workflow');
            await fetchStatus(true);
        } catch (retryError) {
            notifyError(retryError instanceof Error ? retryError.message : 'Ticket retry failed');
        } finally {
            setResettingTicket(null);
        }
    }, [fetchStatus, token]);

    const handleRetryFailed = async () => {
        if (!status?.stuck.length || !token) return;
        setRetryingAll(true);
        let completed = 0;

        try {
            for (const ticket of status.stuck) {
                const response = await fetch(`${API_URL}/admin/queue/ticket/${ticket.id}/reset`, {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (response.ok) completed += 1;
            }

            if (completed === status.stuck.length) {
                notifySuccess(`${completed} stuck ticket${completed === 1 ? '' : 's'} queued for retry`);
            } else {
                notifyInfo(`${completed} of ${status.stuck.length} tickets queued for retry`);
            }
            await fetchStatus(true);
        } catch {
            notifyError('Unable to retry the stuck ticket batch');
        } finally {
            setRetryingAll(false);
        }
    };

    const handleExport = () => {
        if (!status) return;
        const report = {
            generatedAt: new Date().toISOString(),
            source: 'Analysis Queue status API and browser-captured telemetry',
            status,
            health: calculateHealth(status),
            telemetry: history,
            notes: [
                'Success is shown as a healthy-workload proxy because completed-job counts are not exposed.',
                'Average processing duration and reason-level failures are not exposed.',
                'No backend endpoint or configuration was changed.'
            ]
        };
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `analysis-queue-report-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        notifySuccess('Queue report exported');
    };

    const health = calculateHealth(status);
    const failures = status ? status.tickets.retryable + status.tickets.permanent_failed : 0;
    const workload = status ? status.tickets.pending + status.tickets.processing + failures : 0;
    const successProxy = clamp(100 - safePercent(failures, workload));
    const previousSnapshot = history.length > 1 ? history.at(-2) : undefined;
    const sparkline = (key: keyof Omit<QueueSnapshot, 'timestamp'>) => history.slice(-18).map((point) => point[key]);

    const metrics = [
        {
            label: 'Waiting jobs',
            value: formatCompact(status?.queue.waiting ?? 0),
            context: 'Waiting for an available Vertex analysis slot.',
            icon: Layers3,
            tone: 'primary' as const,
            sparkline: sparkline('waiting'),
            trend: trendPercent(status?.queue.waiting ?? 0, previousSnapshot?.waiting),
            positiveUp: false
        },
        {
            label: 'Active jobs',
            value: status?.queue.active ?? 0,
            suffix: `/ ${status?.queue.maxConcurrent ?? 0}`,
            context: 'Workers currently consuming concurrency.',
            icon: Zap,
            tone: 'blue' as const,
            sparkline: sparkline('active'),
            trend: trendPercent(status?.queue.active ?? 0, previousSnapshot?.active),
            positiveUp: true
        },
        {
            label: 'Processing',
            value: status?.tickets.processing ?? 0,
            context: 'Database tickets currently in processing.',
            icon: RefreshCw,
            tone: 'green' as const,
            sparkline: sparkline('processing'),
            trend: trendPercent(status?.tickets.processing ?? 0, previousSnapshot?.processing),
            positiveUp: true
        },
        {
            label: 'Failed jobs',
            value: failures,
            context: `${status?.tickets.retryable ?? 0} retryable · ${status?.tickets.permanent_failed ?? 0} permanent`,
            icon: XCircle,
            tone: 'red' as const,
            sparkline: sparkline('failed'),
            trend: trendPercent(failures, previousSnapshot?.failed),
            positiveUp: false
        },
        {
            label: 'Healthy workload',
            value: `${successProxy}%`,
            context: 'Proxy from the current workload failure mix.',
            icon: ShieldCheck,
            tone: 'green' as const,
            sparkline: history.slice(-18).map((point) => clamp(100 - safePercent(point.failed, point.waiting + point.processing + point.failed))),
            trend: null,
            positiveUp: true
        },
        {
            label: 'Avg processing time',
            value: 'N/A',
            context: 'Duration is not returned by the queue API.',
            icon: Clock3,
            tone: 'amber' as const,
            sparkline: [],
            trend: null,
            positiveUp: false,
            unavailable: true
        }
    ];

    return (
        <AdminShell activeSection="queue">
            <TooltipProvider delayDuration={180}>
                <main className="min-h-screen">
                    <PageHeader
                        eyebrow="Operations Control"
                        title="Analysis Queue"
                        subtitle="Monitor pipeline health, identify blocked work, and take action before analysis SLAs are affected."
                        chips={
                            <>
                                <HealthBadge tone={health.tone} label={health.label} />
                                <StatusBadge status="neutral">
                                    <Activity className="h-3 w-3" />
                                    Updated {lastUpdated ? relativeTime(secondsAgo) : 'connecting'}
                                </StatusBadge>
                                <StatusBadge status="neutral">
                                    <Gauge className="h-3 w-3" />
                                    {status?.queue.rpm ?? 0}/{status?.queue.maxRpm ?? 0} RPM
                                </StatusBadge>
                            </>
                        }
                        actions={
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => void fetchStatus(true)}
                                    disabled={refreshing}
                                >
                                    <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                                    Refresh
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleExport} disabled={!status}>
                                    <Download className="h-4 w-4" />
                                    Export
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleRetryFailed()}
                                    disabled={!status?.stuck.length || retryingAll}
                                    className="border-amber-500/30 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
                                >
                                    {retryingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                    Retry stuck
                                </Button>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span>
                                            <Button variant="outline" size="sm" disabled>
                                                <CirclePause className="h-4 w-4" />
                                                Pause
                                            </Button>
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>Queue pause is not supported by the current API.</TooltipContent>
                                </Tooltip>
                            </div>
                        }
                    />

                    <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
                        {error ? (
                            <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
                                <span className="inline-flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4" />
                                    {error}
                                </span>
                                <button type="button" onClick={() => void fetchStatus(true)} className="font-semibold hover:underline">
                                    Retry
                                </button>
                            </div>
                        ) : null}

                        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                            {metrics.map((metric) => (
                                <MetricCard key={metric.label} {...metric} loading={loading} />
                            ))}
                        </section>

                        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.8fr)] xl:items-stretch">
                            <QueueVolumeChart history={history} range={range} onRangeChange={setRange} />
                            <HealthOverview status={status} loading={loading} />
                        </section>

                        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 xl:items-stretch">
                            <OperationalInsights status={status} />
                            <ActivityFeed events={events} />
                            <FailureAnalytics status={status} />
                        </section>

                        <StuckTicketsTable
                            tickets={status?.stuck ?? []}
                            resettingTicket={resettingTicket}
                            onRetry={handleRetryTicket}
                        />

                        <AutoRetryConfiguration status={status} />

                        <footer className="flex flex-col gap-2 border-t border-[var(--semantic-border)] py-3 text-[11px] text-[var(--semantic-text-muted)] sm:flex-row sm:items-center sm:justify-between">
                            <span>Live source: `/admin/queue/status` · refreshes every 10 seconds</span>
                            <span>Historical chart data is stored in this browser · backend untouched</span>
                        </footer>
                    </div>
                </main>
            </TooltipProvider>
        </AdminShell>
    );
}
