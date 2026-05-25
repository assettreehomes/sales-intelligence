'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    BarChart3,
    Camera,
    CheckCircle2,
    ChevronDown,
    CircleAlert,
    CircleX,
    Gauge,
    RefreshCw,
    Star,
    Target,
    Ticket,
    TrendingUp,
    Trophy,
    Users
} from 'lucide-react';

import { AdminShell } from '@/components/AdminShell';
import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/contexts/AuthContext';
import { HorizontalBarChart, RatingDistChart, RatingTrendChart, SkillRadarChart } from '@/components/ui/charts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { PageHeader } from '@/components/dashboard/page-header';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { SectionCard } from '@/components/dashboard/section-card';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { EmployeeDetailSheet, type EmployeeInsight } from '@/components/dashboard/employee-detail-sheet';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface EmployeeSkills {
    politeness: number;
    confidence: number;
    interest: number;
    rapport_building: number;
    objection_handling: number;
    closing_techniques: number;
    product_knowledge: number;
    professionalism: number;
    [key: string]: number;
}

interface Employee extends EmployeeInsight {
    projects_count: number;
}

interface RatingBucket {
    label: string;
    range: string;
    count: number;
    color: string;
}

interface TrendPoint {
    date: string;
    tickets: number;
    avg_rating_5: number | null;
}

interface LeaderboardEntry {
    rank: number;
    user_id: string;
    fullname: string;
    avatar_url?: string | null;
    role: string;
    total_tickets: number;
    analyzed_tickets: number;
    training_calls: number;
    avg_rating_10: number;
    avg_rating_5: number;
    completion_rate: number;
    skill_avg: number;
    composite_score: number;
}

interface AnalyticsData {
    period: string;
    from: string;
    to: string;
    summary: {
        total_tickets: number;
        analyzed_tickets: number;
        training_calls: number;
        completion_rate: number;
        avg_rating_10: number;
        avg_rating_5: number;
        total_employees: number;
        outcome_counts?: {
            interested: number;
            not_interested: number;
            follow_up_required: number;
        };
    };
    team_skills: EmployeeSkills;
    rating_distribution: RatingBucket[];
    trend: TrendPoint[];
    employees: Employee[];
}

interface LeaderboardData {
    period: string;
    leaderboard: LeaderboardEntry[];
}

type EmployeeSort = 'score' | 'rating' | 'tickets' | 'completion' | 'name';
type EmployeeFilter = 'all' | 'online' | 'offline';

const SKILL_LABELS: Record<string, string> = {
    politeness: 'Politeness',
    confidence: 'Confidence',
    interest: 'Interest',
    rapport_building: 'Rapport',
    objection_handling: 'Objections',
    closing_techniques: 'Closing',
    product_knowledge: 'Product',
    professionalism: 'Professionalism'
};

const SKILL_CHART_LABELS: Record<string, string> = {
    politeness: 'Polite',
    confidence: 'Conf.',
    interest: 'Interest',
    rapport_building: 'Rapport',
    objection_handling: 'Object.',
    closing_techniques: 'Closing',
    product_knowledge: 'Product',
    professionalism: 'Prof.'
};

const RATING_DISTRIBUTION_COLOR_BY_LABEL: Record<string, string> = {
    poor: '#ef4444',
    fair: '#f59e0b',
    good: '#10b981',
    great: '#3b82f6',
    excellent: '#8b5cf6'
};

const PERIODS = [
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' }
];

function skillToneClass(value: number) {
    if (value >= 8) return 'bg-violet-500/30 text-violet-100 border-violet-400/40';
    if (value >= 6) return 'bg-indigo-500/25 text-indigo-100 border-indigo-400/40';
    if (value >= 4) return 'bg-sky-500/25 text-sky-100 border-sky-400/40';
    if (value >= 2) return 'bg-amber-500/20 text-amber-100 border-amber-400/35';
    if (value > 0) return 'bg-rose-500/20 text-rose-100 border-rose-400/35';
    return 'bg-[var(--surface-hover)] text-[var(--color-text-muted)] border-[var(--color-border-subtle)]';
}

function statusOf(isOnline: boolean): EmployeeFilter {
    return isOnline ? 'online' : 'offline';
}

export default function PerformancePage() {
    const { session, profile } = useAuth();
    const [period, setPeriod] = useState('30d');
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [employeeStatuses, setEmployeeStatuses] = useState<Record<string, boolean>>({});
    const [employeeSort, setEmployeeSort] = useState<EmployeeSort>('score');
    const [employeeFilter, setEmployeeFilter] = useState<EmployeeFilter>('all');
    const [employeeQuery, setEmployeeQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    const [showAllEmployees, setShowAllEmployees] = useState(false);
    const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

    const [uploadingUserId, setUploadingUserId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isSuperAdmin = profile?.role === 'superadmin';

    const fetchData = useCallback(async () => {
        if (!session?.access_token) return;
        setLoading(true);
        setError('');

        try {
            const headers = {
                Authorization: `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
            };

            const [empRes, lbRes, statusRes] = await Promise.all([
                fetch(`${API_URL}/analytics/employees?period=${period}`, { headers }),
                fetch(`${API_URL}/analytics/leaderboard?period=${period}`, { headers }),
                fetch(`${API_URL}/employee/status`, { headers })
            ]);

            if (!empRes.ok || !lbRes.ok) {
                throw new Error('Failed to fetch analytics data');
            }

            const [empData, lbData, statusData] = await Promise.all([
                empRes.json(),
                lbRes.json(),
                statusRes.ok ? statusRes.json() : Promise.resolve({ statuses: [] })
            ]);

            setAnalytics(empData);
            setLeaderboard(lbData);

            const map: Record<string, boolean> = {};
            const rawStatuses = statusData?.statuses;
            if (Array.isArray(rawStatuses)) {
                rawStatuses.forEach((entry: { user?: { id?: string }; status?: { is_online?: boolean } }) => {
                    const uid = entry.user?.id;
                    if (uid) map[uid] = !!entry.status?.is_online;
                });
            }
            setEmployeeStatuses(map);
        } catch (err) {
            console.error('Analytics fetch error:', err);
            setError('Failed to load analytics data');
        } finally {
            setLoading(false);
        }
    }, [session, period]);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    useEffect(() => {
        const statusInterval = setInterval(async () => {
            if (!session?.access_token) return;

            const res = await fetch(`${API_URL}/employee/status`, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });
            if (!res.ok) return;

            const data = await res.json();
            const map: Record<string, boolean> = {};
            const rawStatuses = data?.statuses;
            if (Array.isArray(rawStatuses)) {
                rawStatuses.forEach((entry: { user?: { id?: string }; status?: { is_online?: boolean } }) => {
                    const uid = entry.user?.id;
                    if (uid) map[uid] = !!entry.status?.is_online;
                });
            }
            setEmployeeStatuses(map);
        }, 10_000);

        return () => clearInterval(statusInterval);
    }, [session]);

    const handleAvatarClick = (userId: string) => {
        if (!isSuperAdmin) return;
        setUploadingUserId(userId);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !uploadingUserId || !session?.access_token) return;

        try {
            const formData = new FormData();
            formData.append('avatar', file);

            const res = await fetch(`${API_URL}/users/${uploadingUserId}/avatar`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${session.access_token}` },
                body: formData
            });

            if (!res.ok) throw new Error('Failed to upload avatar');

            await fetchData();
            if (fileInputRef.current) fileInputRef.current.value = '';
            setUploadingUserId(null);
        } catch (err) {
            console.error('Avatar upload error:', err);
            setError('Failed to upload avatar');
        }
    };

    const summary = analytics?.summary;
    const skillKeys = useMemo(() => Object.keys(SKILL_LABELS), []);
    const leaderboardEntries = useMemo(() => leaderboard?.leaderboard ?? [], [leaderboard]);
    const topPerformer = leaderboardEntries[0];
    const topPerformerEmployee = analytics?.employees.find((employee) => employee.user_id === topPerformer?.user_id);

    const topPerformerInsight = useMemo(() => {
        if (!topPerformer || !topPerformerEmployee) {
            return {
                strongestSkillLabel: 'N/A',
                strongestSkillValue: 0,
                trendDelta: 0,
                trendBars: [] as number[]
            };
        }

        const strongest = skillKeys
            .map((key) => ({
                label: SKILL_LABELS[key],
                value: topPerformerEmployee.skills?.[key] ?? 0
            }))
            .sort((a, b) => b.value - a.value)[0];

        const recent = (topPerformerEmployee.recent_ratings ?? [])
            .map((rating) => Number(rating.rating) || 0)
            .filter((rating) => Number.isFinite(rating))
            .slice(-8);

        const trendDelta = recent.length >= 2 ? recent[recent.length - 1] - recent[0] : 0;

        return {
            strongestSkillLabel: strongest?.label ?? 'N/A',
            strongestSkillValue: strongest?.value ?? 0,
            trendDelta,
            trendBars: recent
        };
    }, [skillKeys, topPerformer, topPerformerEmployee]);
    const employeeRankMap = useMemo(() => {
        const entries = leaderboardEntries.map((entry) => [entry.user_id, entry.rank] as const);
        return new Map(entries);
    }, [leaderboardEntries]);

    const trendChartData = useMemo(() => {
        if (!analytics?.trend) return [];
        return analytics.trend.map((point) => ({
            date: point.date,
            rating: point.avg_rating_5,
            tickets: point.tickets
        }));
    }, [analytics]);

    const ratingDistChart = useMemo(() => {
        if (!analytics?.rating_distribution) return [];
        return analytics.rating_distribution.map((bucket) => ({
            label: bucket.label,
            count: bucket.count,
            color: RATING_DISTRIBUTION_COLOR_BY_LABEL[bucket.label.trim().toLowerCase()] ?? '#6d28d9'
        }));
    }, [analytics]);

    const topEmployeesByRating = useMemo(() => {
        if (!analytics?.employees) return [];
        return analytics.employees
            .filter((employee) => employee.analyzed_tickets > 0)
            .sort((a, b) => b.avg_rating_10 - a.avg_rating_10)
            .slice(0, 6)
            .map((employee) => ({
                name: employee.fullname.split(' ')[0],
                value: Number(employee.avg_rating_10.toFixed(1))
            }));
    }, [analytics]);

    const outcomeStats = summary?.outcome_counts ?? {
        interested: 0,
        not_interested: 0,
        follow_up_required: 0
    };
    const outcomeTotal = outcomeStats.interested + outcomeStats.not_interested + outcomeStats.follow_up_required;

    const filteredEmployees = useMemo(() => {
        const source = analytics?.employees ?? [];
        const query = employeeQuery.trim().toLowerCase();

        const matched = source.filter((employee) => {
            const online = !!employeeStatuses[employee.user_id];
            if (employeeFilter !== 'all' && statusOf(online) !== employeeFilter) return false;
            if (!query) return true;

            return (
                employee.fullname.toLowerCase().includes(query) ||
                employee.email.toLowerCase().includes(query) ||
                employee.role.toLowerCase().includes(query)
            );
        });

        const sorted = [...matched].sort((a, b) => {
            if (employeeSort === 'name') return a.fullname.localeCompare(b.fullname);
            if (employeeSort === 'rating') return b.avg_rating_5 - a.avg_rating_5;
            if (employeeSort === 'tickets') return b.total_tickets - a.total_tickets;
            if (employeeSort === 'completion') return b.completion_rate - a.completion_rate;

            const rankA = employeeRankMap.get(a.user_id) ?? Number.MAX_SAFE_INTEGER;
            const rankB = employeeRankMap.get(b.user_id) ?? Number.MAX_SAFE_INTEGER;
            if (rankA !== rankB) return rankA - rankB;
            return b.avg_rating_5 - a.avg_rating_5;
        });

        return sorted;
    }, [analytics, employeeQuery, employeeFilter, employeeSort, employeeStatuses, employeeRankMap]);

    const visibleEmployees = useMemo(() => {
        if (showAllEmployees) return filteredEmployees;
        return filteredEmployees.slice(0, 8);
    }, [filteredEmployees, showAllEmployees]);

    const leaderboardVisible = useMemo(() => {
        if (leaderboardExpanded) return leaderboardEntries;
        return leaderboardEntries.slice(0, 8);
    }, [leaderboardEntries, leaderboardExpanded]);

    const employeeSuggestions = useMemo(() => {
        const source = analytics?.employees ?? [];
        const query = employeeQuery.trim().toLowerCase();
        const filtered = query
            ? source.filter((employee) => employee.fullname.toLowerCase().includes(query) || employee.email.toLowerCase().includes(query))
            : source;
        return filtered.slice(0, 7);
    }, [analytics?.employees, employeeQuery]);

    const showLoading = loading || !analytics || !leaderboard;

    return (
        <AdminShell activeSection="performance">
            <TooltipProvider delayDuration={180}>
                <main className="min-h-screen">
                    <PageHeader
                        eyebrow="Team Operations Intelligence"
                        title="Performance Dashboard"
                        subtitle="Track coaching impact, quality trends, and individual momentum in one place."
                        chips={
                            <>
                                <StatusBadge status="online" dot>
                                    {Object.values(employeeStatuses).filter(Boolean).length} online
                                </StatusBadge>
                                <StatusBadge status="active">{summary?.total_employees ?? 0} team members</StatusBadge>
                            </>
                        }
                        actions={
                            <div className="flex flex-wrap items-center gap-2">
                                <Tabs value={period} onValueChange={setPeriod}>
                                    <TabsList>
                                        {PERIODS.map((p) => (
                                            <TabsTrigger key={p.key} value={p.key}>
                                                {p.label}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                </Tabs>
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    onClick={() => void fetchData()}
                                    disabled={loading}
                                    aria-label="Refresh dashboard"
                                >
                                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>
                        }
                    />

                    <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
                        {error ? (
                            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/12 px-4 py-3 text-sm text-rose-200">{error}</div>
                        ) : null}

                        {showLoading ? (
                            <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--surface-card)] p-10 text-center text-[var(--color-text-muted)]">
                                Loading analytics...
                            </div>
                        ) : (
                            <>
                                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                    <KpiCard
                                        label="Workload"
                                        icon={<Ticket className="h-4 w-4" />}
                                        value={summary?.total_tickets ?? 0}
                                        footnote="Total tickets"
                                    />
                                    <KpiCard
                                        label="Quality"
                                        icon={<Star className="h-4 w-4" />}
                                        value={`${(summary?.avg_rating_5 ?? 0).toFixed(1)}/5`}
                                        footnote="Average rating"
                                    />
                                    <KpiCard
                                        label="Completion Rate"
                                        icon={<Target className="h-4 w-4" />}
                                        value={`${(summary?.completion_rate ?? 0).toFixed(0)}%`}
                                        footnote="Analyzed vs total"
                                    />
                                    <KpiCard
                                        label="Coaching Calls"
                                        icon={<Users className="h-4 w-4" />}
                                        value={summary?.training_calls ?? 0}
                                        footnote="Shared for review"
                                    />
                                </section>

                                <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                    <KpiCard
                                        label="Interested"
                                        icon={<CheckCircle2 className="h-4 w-4" />}
                                        value={outcomeStats.interested}
                                        meta={`${outcomeTotal ? Math.round((outcomeStats.interested / outcomeTotal) * 100) : 0}% of outcomes`}
                                        className="border-emerald-500/35"
                                    />
                                    <KpiCard
                                        label="Not Interested"
                                        icon={<CircleX className="h-4 w-4" />}
                                        value={outcomeStats.not_interested}
                                        meta={`${outcomeTotal ? Math.round((outcomeStats.not_interested / outcomeTotal) * 100) : 0}% of outcomes`}
                                        className="border-rose-500/35"
                                    />
                                    <KpiCard
                                        label="Follow Up Required"
                                        icon={<CircleAlert className="h-4 w-4" />}
                                        value={outcomeStats.follow_up_required}
                                        meta={`${outcomeTotal ? Math.round((outcomeStats.follow_up_required / outcomeTotal) * 100) : 0}% of outcomes`}
                                        className="border-amber-500/35"
                                    />
                                </section>

                                <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_23.5rem] xl:items-start">
                                    <SectionCard
                                        title="Leaderboard"
                                        icon={<Trophy className="h-4 w-4" />}
                                        subtitle="Top contributors in the selected period"
                                        actions={
                                            leaderboardEntries.length > 8 ? (
                                                <Button variant="ghost" size="sm" onClick={() => setLeaderboardExpanded((prev) => !prev)}>
                                                    {leaderboardExpanded ? 'Show top 8' : `View all (${leaderboardEntries.length})`}
                                                </Button>
                                            ) : null
                                        }
                                    >
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-14">#</TableHead>
                                                    <TableHead>Employee</TableHead>
                                                    <TableHead className="text-center">Tickets</TableHead>
                                                    <TableHead className="text-center">Rating</TableHead>
                                                    <TableHead className="text-center">Completion</TableHead>
                                                    <TableHead className="text-center">Skills</TableHead>
                                                    <TableHead className="text-right">Score</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {leaderboardVisible.map((entry) => (
                                                    <TableRow key={entry.user_id} className={entry.rank <= 3 ? 'bg-[color-mix(in_srgb,var(--color-primary-500),transparent_90%)]' : ''}>
                                                        <TableCell>
                                                            <Badge variant={entry.rank <= 3 ? 'default' : 'secondary'}>#{entry.rank}</Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <Avatar src={entry.avatar_url} name={entry.fullname} size="sm" />
                                                                <div>
                                                                    <p className="font-semibold text-[var(--color-text-primary)]">{entry.fullname}</p>
                                                                    <p className="text-xs capitalize text-[var(--color-text-muted)]">{entry.role}</p>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center font-semibold text-[var(--color-text-primary)]">{entry.total_tickets}</TableCell>
                                                        <TableCell className="text-center">
                                                            <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-text-primary)]">
                                                                <Star className="h-3.5 w-3.5 fill-current text-[var(--color-primary-400)]" />
                                                                {entry.avg_rating_5.toFixed(1)}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-center font-semibold text-[var(--color-text-primary)]">{entry.completion_rate.toFixed(0)}%</TableCell>
                                                        <TableCell className="text-center font-semibold text-[var(--color-text-primary)]">{entry.skill_avg.toFixed(1)}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Badge variant="default">{entry.composite_score.toFixed(1)}</Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </SectionCard>

                                    <SectionCard
                                        title="Top Performer"
                                        icon={<Trophy className="h-4 w-4" />}
                                        className="top-performer-card-animate self-start overflow-hidden border-[var(--color-primary-400)]/45 bg-[linear-gradient(170deg,color-mix(in_srgb,var(--color-primary-700),transparent_6%)_0%,color-mix(in_srgb,var(--color-primary-500),transparent_18%)_100%)]"
                                    >
                                        {topPerformer ? (
                                            <div className="space-y-3">
                                                <div className="flex items-start justify-between gap-2">
                                                    <StatusBadge status="accepted" className="bg-white/12 text-white border-white/25">
                                                        #1 this period
                                                    </StatusBadge>
                                                    <StatusBadge
                                                        status={employeeStatuses[topPerformer.user_id] ? 'online' : 'offline'}
                                                        dot
                                                        className="bg-white/12 text-white border-white/25"
                                                    >
                                                        {employeeStatuses[topPerformer.user_id] ? 'Online' : 'Offline'}
                                                    </StatusBadge>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    <div className="relative">
                                                        <Avatar src={topPerformer.avatar_url} name={topPerformer.fullname} size="lg" className="border-2 border-white/30" />
                                                        {isSuperAdmin ? (
                                                            <button
                                                                type="button"
                                                                className="absolute -right-1 -top-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white hover:bg-black/50"
                                                                onClick={() => handleAvatarClick(topPerformer.user_id)}
                                                                title="Upload avatar"
                                                            >
                                                                <Camera className="h-3.5 w-3.5" />
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                    <div>
                                                        <p className="text-xl font-bold text-white">{topPerformer.fullname}</p>
                                                        <p className="text-sm text-white/80 capitalize">{topPerformer.role}</p>
                                                        <p className="mt-1 text-xs text-white/75">
                                                            Strongest skill: {topPerformerInsight.strongestSkillLabel} ({topPerformerInsight.strongestSkillValue.toFixed(1)})
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-3 gap-2">
                                                    <div className="rounded-lg border border-white/20 bg-white/10 p-2 text-center">
                                                        <p className="text-[11px] text-white/75">Tickets</p>
                                                        <p className="text-lg font-semibold text-white">{topPerformer.total_tickets}</p>
                                                    </div>
                                                    <div className="rounded-lg border border-white/20 bg-white/10 p-2 text-center">
                                                        <p className="text-[11px] text-white/75">Rating</p>
                                                        <p className="text-lg font-semibold text-white">{topPerformer.avg_rating_5.toFixed(1)}</p>
                                                    </div>
                                                    <div className="rounded-lg border border-white/20 bg-white/10 p-2 text-center">
                                                        <p className="text-[11px] text-white/75">Score</p>
                                                        <p className="text-lg font-semibold text-white">{topPerformer.composite_score.toFixed(1)}</p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-white/20 bg-black/12 p-2.5">
                                                    <div>
                                                        <p className="text-[11px] uppercase tracking-[0.08em] text-white/70">Momentum</p>
                                                        <p className="inline-flex items-center gap-1 text-sm font-semibold text-white">
                                                            <TrendingUp className="h-3.5 w-3.5" />
                                                            {topPerformerInsight.trendDelta >= 0 ? '+' : ''}
                                                            {topPerformerInsight.trendDelta.toFixed(2)} recent shift
                                                        </p>
                                                    </div>
                                                    <div className="flex h-14 items-end gap-1">
                                                        {topPerformerInsight.trendBars.length ? (
                                                            topPerformerInsight.trendBars.map((value, idx) => (
                                                                <span
                                                                    key={`${value}-${idx}`}
                                                                    className="w-2 rounded-sm bg-white/80"
                                                                    style={{ height: `${Math.max(12, Math.min(100, (value / 5) * 100))}%` }}
                                                                />
                                                            ))
                                                        ) : (
                                                            <span className="text-xs text-white/65">No trend data</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-xl border border-white/20 bg-black/12 p-2.5">
                                                    <p className="text-[11px] uppercase tracking-[0.08em] text-white/70">Skill focus</p>
                                                    <div className="h-2 overflow-hidden rounded-full bg-white/20">
                                                        <div
                                                            className="h-full rounded-full bg-white/80 transition-all duration-700"
                                                            style={{ width: `${Math.min(100, Math.max(4, (topPerformerInsight.strongestSkillValue / 10) * 100))}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex justify-center rounded-xl border border-white/20 bg-black/12 p-1">
                                                    <SkillRadarChart
                                                        size={148}
                                                        labels={skillKeys.map((k) => SKILL_CHART_LABELS[k])}
                                                        values={skillKeys.map((k) => topPerformerEmployee?.skills?.[k] ?? 0)}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-white/80">No top performer in this period.</p>
                                        )}
                                    </SectionCard>
                                </section>

                                <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                    <SectionCard title="Team Rating Trend" icon={<BarChart3 className="h-4 w-4" />}>
                                        <RatingTrendChart data={trendChartData} height={190} />
                                    </SectionCard>
                                    <SectionCard title="Top Employees by Rating" icon={<Gauge className="h-4 w-4" />}>
                                        <HorizontalBarChart data={topEmployeesByRating} maxValue={10} height={190} />
                                    </SectionCard>
                                </section>

                                <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
                                    <SectionCard title="Skills Heatmap" icon={<Target className="h-4 w-4" />} subtitle="Quick skill-read for active employees">
                                        <ScrollArea className="w-full">
                                            <table className="w-full min-w-[760px] border-separate border-spacing-y-1 text-sm">
                                                <thead>
                                                    <tr>
                                                        <th className="px-2 py-2 text-left text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Employee</th>
                                                        {skillKeys.map((skill) => (
                                                            <th key={skill} className="px-2 py-2 text-center text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                                                                {SKILL_CHART_LABELS[skill]}
                                                            </th>
                                                        ))}
                                                        <th className="px-2 py-2 text-center text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Avg</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {analytics?.employees.slice(0, 6).map((employee) => (
                                                        <tr key={employee.user_id}>
                                                            <td className="px-2 py-1.5">
                                                                <div className="flex items-center gap-2">
                                                                    <Avatar src={employee.avatar_url} name={employee.fullname} size="xs" />
                                                                    <span className="font-medium text-[var(--color-text-primary)]">{employee.fullname}</span>
                                                                </div>
                                                            </td>
                                                            {skillKeys.map((skill) => {
                                                                const value = employee.skills?.[skill] ?? 0;
                                                                return (
                                                                    <td key={`${employee.user_id}-${skill}`} className="px-1 py-1.5 text-center">
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <span className={`inline-flex min-w-[2.6rem] items-center justify-center rounded-md border px-2 py-1 text-xs font-medium ${skillToneClass(value)}`}>
                                                                                    {value > 0 ? value.toFixed(1) : '--'}
                                                                                </span>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent>
                                                                                {employee.fullname} - {SKILL_LABELS[skill]}: {value > 0 ? value.toFixed(1) : 'No score'}
                                                                            </TooltipContent>
                                                                        </Tooltip>
                                                                    </td>
                                                                );
                                                            })}
                                                            <td className="px-1 py-1.5 text-center">
                                                                <Badge variant="secondary">{employee.skill_avg.toFixed(1)}</Badge>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </ScrollArea>
                                    </SectionCard>

                                    <SectionCard title="Rating Distribution" icon={<Star className="h-4 w-4" />}>
                                        <RatingDistChart data={ratingDistChart} height={220} />
                                    </SectionCard>
                                </section>

                                <section className="space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Individual Performance</h2>
                                            <p className="text-sm text-[var(--color-text-muted)]">
                                                Showing {visibleEmployees.length} of {filteredEmployees.length} matching employees
                                            </p>
                                        </div>
                                    </div>

                                    <SectionCard
                                        title="Employee Finder"
                                        subtitle="Search, sort, and open employee deep-dives in a detail drawer."
                                        icon={<Users className="h-4 w-4" />}
                                        actions={
                                            <div className="flex items-center gap-2">
                                                <StatusBadge status={employeeFilter === 'online' ? 'online' : 'neutral'} dot={employeeFilter === 'online'}>
                                                    {employeeFilter}
                                                </StatusBadge>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="outline" size="sm">
                                                            Sort: {employeeSort}
                                                            <ChevronDown className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuRadioGroup value={employeeSort} onValueChange={(value) => setEmployeeSort(value as EmployeeSort)}>
                                                            <DropdownMenuRadioItem value="score">Leaderboard Score</DropdownMenuRadioItem>
                                                            <DropdownMenuRadioItem value="rating">Rating</DropdownMenuRadioItem>
                                                            <DropdownMenuRadioItem value="tickets">Tickets</DropdownMenuRadioItem>
                                                            <DropdownMenuRadioItem value="completion">Completion</DropdownMenuRadioItem>
                                                            <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
                                                        </DropdownMenuRadioGroup>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="outline" size="sm">
                                                            Filter
                                                            <ChevronDown className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => setEmployeeFilter('all')}>All</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => setEmployeeFilter('online')}>Online</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => setEmployeeFilter('offline')}>Offline</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        }
                                    >
                                        <div className="grid gap-4">
                                            <div className="relative rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-card)] shadow-[var(--elevation-1)]">
                                                <Command className="overflow-visible rounded-xl bg-transparent">
                                                    <CommandInput
                                                        className="h-12 text-[15px]"
                                                        placeholder="Search employees by name, email, or role..."
                                                        value={employeeQuery}
                                                        onValueChange={setEmployeeQuery}
                                                        onFocus={() => setSearchFocused(true)}
                                                        onBlur={() => {
                                                            window.setTimeout(() => setSearchFocused(false), 100);
                                                        }}
                                                    />

                                                    {(searchFocused || employeeQuery.trim()) && (
                                                        <div className="absolute left-2 right-2 top-[calc(100%+0.4rem)] z-20 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--elevation-2)]">
                                                            <CommandList className="max-h-52">
                                                                <CommandEmpty>No matching employees</CommandEmpty>
                                                                <CommandGroup heading="Suggestions">
                                                                    {employeeSuggestions.map((employee) => (
                                                                        <CommandItem
                                                                            key={employee.user_id}
                                                                            onSelect={() => {
                                                                                setEmployeeQuery(employee.fullname);
                                                                                setSearchFocused(false);
                                                                            }}
                                                                        >
                                                                            <div className="flex w-full items-center justify-between gap-3">
                                                                                <span className="truncate">{employee.fullname}</span>
                                                                                <span className="text-xs text-[var(--color-text-muted)]">{employee.role}</span>
                                                                            </div>
                                                                        </CommandItem>
                                                                    ))}
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </div>
                                                    )}
                                                </Command>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                {(analytics?.employees ?? []).slice(0, 5).map((employee) => (
                                                    <Button
                                                        key={`quick-${employee.user_id}`}
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 rounded-full border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] px-3 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                                                        onClick={() => setEmployeeQuery(employee.fullname)}
                                                    >
                                                        {employee.fullname}
                                                    </Button>
                                                ))}
                                            </div>

                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                                {visibleEmployees.map((employee) => {
                                                    const online = !!employeeStatuses[employee.user_id];
                                                    const rank = employeeRankMap.get(employee.user_id);
                                                    return (
                                                        <button
                                                            key={employee.user_id}
                                                            type="button"
                                                            onClick={() => setSelectedEmployee(employee)}
                                                            className="group rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--surface-card)] p-3 text-left shadow-[var(--elevation-1)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--elevation-2)]"
                                                        >
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="relative">
                                                                        <Avatar src={employee.avatar_url} name={employee.fullname} size="md" />
                                                                        {isSuperAdmin ? (
                                                                            <span
                                                                                className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary-600)] text-white opacity-0 transition-opacity group-hover:opacity-100"
                                                                                onClick={(event) => {
                                                                                    event.preventDefault();
                                                                                    event.stopPropagation();
                                                                                    handleAvatarClick(employee.user_id);
                                                                                }}
                                                                            >
                                                                                <Camera className="h-3 w-3" />
                                                                            </span>
                                                                        ) : null}
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-semibold text-[var(--color-text-primary)]">{employee.fullname}</p>
                                                                        <p className="text-xs capitalize text-[var(--color-text-muted)]">{employee.role}</p>
                                                                    </div>
                                                                </div>
                                                                <StatusBadge status={online ? 'online' : 'offline'} size="sm" dot>
                                                                    {online ? 'Online' : 'Offline'}
                                                                </StatusBadge>
                                                            </div>

                                                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                                                <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] px-2 py-1.5">
                                                                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{employee.total_tickets}</p>
                                                                    <p className="text-[11px] text-[var(--color-text-muted)]">Tickets</p>
                                                                </div>
                                                                <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] px-2 py-1.5">
                                                                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{employee.avg_rating_5.toFixed(1)}</p>
                                                                    <p className="text-[11px] text-[var(--color-text-muted)]">Rating</p>
                                                                </div>
                                                                <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--surface-elevated)] px-2 py-1.5">
                                                                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{employee.completion_rate.toFixed(0)}%</p>
                                                                    <p className="text-[11px] text-[var(--color-text-muted)]">Complete</p>
                                                                </div>
                                                            </div>

                                                            <div className="mt-3 flex items-center justify-between">
                                                                <Badge variant="secondary">Skill {employee.skill_avg.toFixed(1)}</Badge>
                                                                {rank ? <Badge variant="default">Rank #{rank}</Badge> : <Badge variant="outline">Unranked</Badge>}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {filteredEmployees.length > 8 ? (
                                                <div className="flex justify-end">
                                                    <Button variant="outline" onClick={() => setShowAllEmployees((prev) => !prev)}>
                                                        {showAllEmployees ? 'Show Top 8' : `Show All (${filteredEmployees.length})`}
                                                    </Button>
                                                </div>
                                            ) : null}
                                        </div>
                                    </SectionCard>
                                </section>
                            </>
                        )}
                    </div>

                    <EmployeeDetailSheet
                        open={!!selectedEmployee}
                        onOpenChange={(open) => {
                            if (!open) setSelectedEmployee(null);
                        }}
                        employee={selectedEmployee}
                        isOnline={selectedEmployee ? !!employeeStatuses[selectedEmployee.user_id] : false}
                        skillKeys={skillKeys}
                        skillLabels={SKILL_LABELS}
                    />

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                </main>
            </TooltipProvider>
        </AdminShell>
    );
}
