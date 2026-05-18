'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { useAuth } from '@/contexts/AuthContext';
import { RatingTrendChart, HorizontalBarChart, SkillRadarChart, RatingDistChart } from '@/components/ui/charts';
import {
    TrendingUp,
    Users,
    Star,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Trophy,
    BarChart3,
    Target,
    RefreshCw,
    Camera
} from 'lucide-react';
import { useRef } from 'react';
import { Avatar } from '@/components/Avatar';
import { SegmentedToggle } from '@/components/SegmentedToggle';

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

interface RecentRating {
    date: string;
    rating: number;
}

interface Employee {
    user_id: string;
    fullname: string;
    email: string;
    role: string;
    avatar_url?: string | null;
    total_tickets: number;
    analyzed_tickets: number;
    failed_tickets: number;
    training_calls: number;
    completion_rate: number;
    avg_rating_10: number;
    avg_rating_5: number;
    skills: EmployeeSkills;
    skill_avg: number;
    recent_ratings: RecentRating[];
    visit_types: Record<string, number>;
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

const SKILL_LABELS: Record<string, string> = {
    politeness: 'Politeness',
    confidence: 'Confidence',
    interest: 'Interest',
    rapport_building: 'Rapport',
    objection_handling: 'Objections',
    closing_techniques: 'Closing',
    product_knowledge: 'Product',
    professionalism: 'Professionalism',
};

const SKILL_CHART_LABELS: Record<string, string> = {
    politeness: 'Polite',
    confidence: 'Conf.',
    interest: 'Interest',
    rapport_building: 'Rapport',
    objection_handling: 'Object.',
    closing_techniques: 'Closing',
    product_knowledge: 'Product',
    professionalism: 'Prof.',
};

const RATING_DISTRIBUTION_COLOR_BY_LABEL: Record<string, string> = {
    poor:      '#ef4444',
    fair:      '#f59e0b',
    good:      '#10b981',
    great:     '#3b82f6',
    excellent: '#8b5cf6',
};

const PERIODS = [
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' },
];

// ═══════════════════════════════════════════════
// SVG Micro Components
// ═══════════════════════════════════════════════

function SparklineSVG({ data, width = 120, height = 32, color = 'var(--performance-accent)' }: {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
}) {
    if (!data || data.length < 2) return <div style={{ width, height }} />;
    const colorKey = color.replace(/[^a-zA-Z0-9_-]/g, '');
    const gradientId = `spark-${colorKey || 'accent'}`;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const padding = 2;
    const points = data.map((v, i) => {
        const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
        const y = height - padding - ((v - min) / range) * (height - 2 * padding);
        return `${x},${y}`;
    });
    const areaPoints = [...points, `${width - padding},${height - padding}`, `${padding},${height - padding}`];
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
            </defs>
            <polygon points={areaPoints.join(' ')} fill={`url(#${gradientId})`} />
            <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}


function CircularProgress({ value, size = 56, strokeWidth = 5, color = 'var(--performance-accent)' }: {
    value: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
}) {
    const r = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;
    const offset = circumference - (Math.min(value, 100) / 100) * circumference;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="performance-circular-progress">
            <title>{`Completion: ${Math.round(value)}%`}</title>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--performance-chart-track)" strokeWidth={strokeWidth} />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                className="transition-all duration-700"
            />
            <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fill="var(--performance-text-strong)" className="text-xs font-bold">
                {Math.round(value)}%
            </text>
        </svg>
    );
}

// ═══════════════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════════════



function MedalBadge({ rank }: { rank: number }) {
    if (rank === 1) return <span className="performance-medal is-gold">1</span>;
    if (rank === 2) return <span className="performance-medal is-silver">2</span>;
    if (rank === 3) return <span className="performance-medal is-bronze">3</span>;
    return <span className="performance-medal is-neutral">#{rank}</span>;
}


function SkillHeatmapCell({ value, label }: { value: number; label?: string }) {
    let tier = 'is-empty';
    if (value >= 8) tier = 'is-elite';
    else if (value >= 6) tier = 'is-strong';
    else if (value >= 4) tier = 'is-steady';
    else if (value >= 2) tier = 'is-low';
    else if (value > 0) tier = 'is-risk';
    const displayValue = value > 0 ? value.toFixed(1) : '--';
    const title = label ? `${label}: ${displayValue}` : displayValue;
    return (
        <div className={`performance-skill-cell ${tier}`} title={title}>
            {displayValue}
        </div>
    );
}

// ═══════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════

export default function PerformancePage() {
    const { session, profile } = useAuth();
    const [period, setPeriod] = useState('30d');
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [employeeStatuses, setEmployeeStatuses] = useState<Record<string, boolean>>({});

    // Avatar upload logic
    const [uploadingUserId, setUploadingUserId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isSuperAdmin = profile?.role === 'superadmin';

    const handleAvatarClick = (userId: string) => {
        if (!isSuperAdmin) return;
        setUploadingUserId(userId);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !uploadingUserId) return;

        try {
            const formData = new FormData();
            formData.append('avatar', file);

            const token = session?.access_token;
            if (!token) return;

            const res = await fetch(`${API_URL}/users/${uploadingUserId}/avatar`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!res.ok) throw new Error('Failed to upload avatar');

            // Refresh data
            await fetchData();
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';
            setUploadingUserId(null);
        } catch (err) {
            console.error('Avatar upload error:', err);
            setError('Failed to upload avatar');
        }
    };

    const fetchData = useCallback(async () => {
        if (!session?.access_token) return;
        setLoading(true);
        setError('');

        try {
            const headers = {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
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

            // API returns { statuses: [{ user: { id }, status: { is_online } }] }
            const statusMap: Record<string, boolean> = {};
            const rawStatuses = statusData?.statuses;
            if (Array.isArray(rawStatuses)) {
                rawStatuses.forEach((s: { user?: { id?: string }; status?: { is_online?: boolean } }) => {
                    const uid = s.user?.id;
                    if (uid) statusMap[uid] = !!s.status?.is_online;
                });
            }
            setEmployeeStatuses(statusMap);
        } catch (err) {
            console.error('Analytics fetch error:', err);
            setError('Failed to load analytics data');
        } finally {
            setLoading(false);
        }
    }, [session, period]);

    useEffect(() => {
        void fetchData();
        // Refresh status every 10s so the online dot stays current
        const statusInterval = setInterval(async () => {
            if (!session?.access_token) return;
            const res = await fetch(`${API_URL}/employee/status`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            const map: Record<string, boolean> = {};
            const rawStatuses = data?.statuses;
            if (Array.isArray(rawStatuses)) {
                rawStatuses.forEach((s: { user?: { id?: string }; status?: { is_online?: boolean } }) => {
                    const uid = s.user?.id;
                    if (uid) map[uid] = !!s.status?.is_online;
                });
            }
            setEmployeeStatuses(map);
        }, 10_000);
        return () => clearInterval(statusInterval);
    }, [fetchData, session]);

    const skillKeys = useMemo(() => Object.keys(SKILL_LABELS), []);

    const topPerformer = leaderboard?.leaderboard?.[0] ?? null;
    const topPerformerEmployee = analytics?.employees?.find(
        (e) => e.user_id === topPerformer?.user_id
    );

    // Chart data
    const trendChartData = useMemo(() => {
        if (!analytics?.trend) return [];
        return analytics.trend.map((t) => ({
            date: t.date,
            rating: t.avg_rating_5,
            tickets: t.tickets,
        }));
    }, [analytics]);

    const ratingDistChart = useMemo(() => {
        if (!analytics?.rating_distribution) return [];
        return analytics.rating_distribution.map((b) => ({
            label: b.label,
            count: b.count,
            color: RATING_DISTRIBUTION_COLOR_BY_LABEL[b.label.trim().toLowerCase()] ?? '#6d28d9',
        }));
    }, [analytics]);

    // Top 6 employees for comparison bars
    const topEmployeesForComparison = useMemo(() => {
        if (!analytics?.employees) return [];
        return analytics.employees
            .filter((e) => e.analyzed_tickets > 0)
            .sort((a, b) => b.avg_rating_10 - a.avg_rating_10)
            .slice(0, 6);
    }, [analytics]);

    if (loading && !analytics) {
        return (
            <AdminShell activeSection="performance">
                <div className="performance-dashboard min-h-screen">
                    <div className="performance-shell performance-loading">
                        <div className="performance-loading-spinner" />
                        <p className="performance-loading-text">Loading analytics...</p>
                    </div>
                </div>
            </AdminShell>
        );
    }

    const s = analytics?.summary;

    return (
        <AdminShell activeSection="performance">
            <div className="performance-dashboard min-h-screen">
                <header className="performance-hero">
                    <div className="performance-hero-glow is-left" />
                    <div className="performance-hero-glow is-right" />
                    <div className="performance-shell">
                        <div className="performance-hero-row">
                            <div className="performance-hero-copy performance-fade-up">
                                <p className="performance-eyebrow">Team Operations Intelligence</p>
                                <h1 className="performance-title">Performance Dashboard</h1>
                                <p className="performance-subtitle">Track coaching impact, quality trends, and individual momentum in one place.</p>
                            </div>
                            <div className="performance-controls performance-fade-up" style={{ animationDelay: '80ms' }}>
                                <SegmentedToggle
                                    value={period}
                                    onChange={setPeriod}
                                    shape="pill"
                                    className="segmented-toggle--performance"
                                    ariaLabel="Performance time period"
                                    options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
                                />
                                <button
                                    onClick={fetchData}
                                    disabled={loading}
                                    className="performance-refresh-btn"
                                    aria-label="Refresh analytics data"
                                    title="Refresh dashboard data"
                                >
                                    <RefreshCw className={`perf-refresh-icon w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {error && (
                    <div className="performance-shell">
                        <div className="performance-alert">{error}</div>
                    </div>
                )}

                <div className="performance-shell performance-content">
                    <section className="performance-kpi-grid">
                        <article className="performance-card performance-kpi-card performance-fade-up" style={{ animationDelay: '100ms' }} title="Total number of tickets in selected period">
                            <div className="performance-kpi-top">
                                <span className="performance-kpi-icon is-tickets">
                                    <BarChart3 className="w-5 h-5" />
                                </span>
                                <span className="performance-kpi-meta">Workload</span>
                            </div>
                            <p className="performance-kpi-value">{s?.total_tickets ?? 0}</p>
                            <p className="performance-kpi-label">Total Tickets</p>
                        </article>

                        <article className="performance-card performance-kpi-card performance-fade-up" style={{ animationDelay: '140ms' }} title="Average ticket quality rating (out of 5)">
                            <div className="performance-kpi-top">
                                <span className="performance-kpi-icon is-rating">
                                    <Star className="w-5 h-5" />
                                </span>
                                <div className="performance-stars">
                                    {[1, 2, 3, 4, 5].map((i) => (
                                        <Star
                                            key={i}
                                            className={`w-3 h-3 ${i <= Math.round(s?.avg_rating_5 ?? 0) ? 'fill-current' : ''}`}
                                            style={{ color: i <= Math.round(s?.avg_rating_5 ?? 0) ? 'var(--performance-rating-star)' : 'var(--performance-rating-star-muted)' }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <p className="performance-kpi-value">
                                {s?.avg_rating_5?.toFixed(1) ?? '0.0'}
                                <span className="performance-kpi-unit">/5</span>
                            </p>
                            <p className="performance-kpi-label">Average Rating</p>
                        </article>

                        <article className="performance-card performance-kpi-card performance-fade-up" style={{ animationDelay: '180ms' }} title="Percent of tickets completed by AI analysis">
                            <div className="performance-kpi-top">
                                <span className="performance-kpi-icon is-completion">
                                    <CheckCircle2 className="w-5 h-5" />
                                </span>
                                <CircularProgress value={s?.completion_rate ?? 0} size={52} strokeWidth={4.5} color="var(--performance-completion)" />
                            </div>
                            <p className="performance-kpi-value">{(s?.completion_rate ?? 0).toFixed(0)}%</p>
                            <p className="performance-kpi-label">Completion Rate</p>
                        </article>

                        <article className="performance-card performance-kpi-card performance-fade-up" style={{ animationDelay: '220ms' }} title="Number of calls sent for coaching">
                            <div className="performance-kpi-top">
                                <span className="performance-kpi-icon is-training">
                                    <Trophy className="w-5 h-5" />
                                </span>
                                <span className="performance-kpi-meta">Coaching Calls</span>
                            </div>
                            <p className="performance-kpi-value">{s?.training_calls ?? 0}</p>
                            <p className="performance-kpi-label">
                                {s?.total_tickets ? ((s.training_calls / s.total_tickets) * 100).toFixed(0) : 0}% of total ticket flow
                            </p>
                        </article>
                    </section>

                    <section className="grid gap-3 md:grid-cols-3">
                        {(() => {
                            const interested = s?.outcome_counts?.interested ?? 0;
                            const notInterested = s?.outcome_counts?.not_interested ?? 0;
                            const followUp = s?.outcome_counts?.follow_up_required ?? 0;
                            const total = interested + notInterested + followUp;
                            const pct = (v: number) => total ? ((v / total) * 100).toFixed(0) : '0';
                            return (
                                <>
                                    <article className="performance-card performance-kpi-card performance-fade-up" style={{ animationDelay: '260ms' }}>
                                        <div className="performance-kpi-top">
                                            <span className="performance-kpi-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
                                                <CheckCircle2 className="w-5 h-5" />
                                            </span>
                                            <span className="performance-kpi-meta" style={{ color: '#059669' }}>{pct(interested)}% of outcomes</span>
                                        </div>
                                        <p className="performance-kpi-value">{interested}</p>
                                        <p className="performance-kpi-label">Interested</p>
                                    </article>
                                    <article className="performance-card performance-kpi-card performance-fade-up" style={{ animationDelay: '300ms' }}>
                                        <div className="performance-kpi-top">
                                            <span className="performance-kpi-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#dc2626' }}>
                                                <XCircle className="w-5 h-5" />
                                            </span>
                                            <span className="performance-kpi-meta" style={{ color: '#dc2626' }}>{pct(notInterested)}% of outcomes</span>
                                        </div>
                                        <p className="performance-kpi-value">{notInterested}</p>
                                        <p className="performance-kpi-label">Not Interested</p>
                                    </article>
                                    <article className="performance-card performance-kpi-card performance-fade-up" style={{ animationDelay: '340ms' }}>
                                        <div className="performance-kpi-top">
                                            <span className="performance-kpi-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706' }}>
                                                <AlertTriangle className="w-5 h-5" />
                                            </span>
                                            <span className="performance-kpi-meta" style={{ color: '#d97706' }}>{pct(followUp)}% of outcomes</span>
                                        </div>
                                        <p className="performance-kpi-value">{followUp}</p>
                                        <p className="performance-kpi-label">Follow-Up Required</p>
                                    </article>
                                </>
                            );
                        })()}
                    </section>

                    <section className="performance-main-grid">
                        <div className="performance-card performance-panel performance-fade-up" style={{ animationDelay: '240ms' }}>
                            <div className="performance-panel-head">
                                <div className="performance-panel-title-wrap">
                                    <Trophy className="performance-panel-icon" />
                                    <h2 className="performance-panel-title">Leaderboard</h2>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="performance-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Employee</th>
                                            <th className="text-center">Tickets</th>
                                            <th className="text-center">Rating</th>
                                            <th className="text-center">Completion</th>
                                            <th className="text-center">Skills</th>
                                            <th className="text-right">Score</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboard?.leaderboard?.map((entry) => (
                                            <tr
                                                key={entry.user_id}
                                                className={`performance-table-row ${entry.rank <= 3 ? 'is-podium' : ''}`}
                                                title={`${entry.fullname}: ${entry.composite_score.toFixed(1)} score`}
                                            >
                                                <td><MedalBadge rank={entry.rank} /></td>
                                                <td>
                                                    <div className="performance-table-user">
                                                        <Avatar name={entry.fullname} src={entry.avatar_url} size="sm" />
                                                        <div className="min-w-0">
                                                            <p className="performance-table-user-name">{entry.fullname}</p>
                                                            <p className="performance-table-user-role">{entry.role}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="text-center performance-table-value">{entry.total_tickets}</td>
                                                <td className="text-center performance-table-value">
                                                    <span className="inline-flex items-center gap-1">
                                                        <Star className="w-3 h-3 fill-current" style={{ color: 'var(--performance-rating-star)' }} />
                                                        {entry.avg_rating_5.toFixed(1)}
                                                    </span>
                                                </td>
                                                <td className="text-center performance-table-value">{entry.completion_rate.toFixed(0)}%</td>
                                                <td className="text-center performance-table-value">{entry.skill_avg.toFixed(1)}</td>
                                                <td className="text-right">
                                                    <span className="performance-score-pill" title="Composite performance score">
                                                        {entry.composite_score.toFixed(1)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {(!leaderboard?.leaderboard || leaderboard.leaderboard.length === 0) && (
                                            <tr>
                                                <td colSpan={7} className="performance-empty">No data available for this period</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <aside className="performance-spotlight performance-fade-up" style={{ animationDelay: '280ms' }}>
                            <div className="performance-spotlight-head">
                                <Trophy className="w-5 h-5" />
                                <h2>Top Performer</h2>
                            </div>
                            {topPerformer && topPerformerEmployee ? (
                                <div className="flex flex-col items-center text-center">
                                    <Avatar name={topPerformer.fullname} src={topPerformer.avatar_url} size="lg" />
                                    <h3 className="performance-spotlight-name">{topPerformer.fullname}</h3>
                                    <p className="performance-spotlight-role">{topPerformer.role}</p>
                                    <div className="performance-spotlight-chart">
                                        <SkillRadarChart
                                            labels={skillKeys.slice(0, 6).map((k) => SKILL_CHART_LABELS[k])}
                                            values={skillKeys.slice(0, 6).map((k) => topPerformerEmployee.skills[k] || 0)}
                                            size={168}
                                            color="#8b5cf6"
                                        />
                                    </div>
                                    <div className="performance-spotlight-stats">
                                        <div className="performance-spotlight-stat" title="Total tickets handled">
                                            <p className="performance-spotlight-stat-label">Tickets</p>
                                            <p className="performance-spotlight-stat-value">{topPerformer.total_tickets}</p>
                                        </div>
                                        <div className="performance-spotlight-stat" title="Average rating (out of 5)">
                                            <p className="performance-spotlight-stat-label">Rating</p>
                                            <p className="performance-spotlight-stat-value">{topPerformer.avg_rating_5.toFixed(1)}</p>
                                        </div>
                                        <div className="performance-spotlight-stat" title="Composite performance score">
                                            <p className="performance-spotlight-stat-label">Score</p>
                                            <p className="performance-spotlight-stat-value">{topPerformer.composite_score.toFixed(1)}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="performance-spotlight-empty">No data yet for this period.</p>
                            )}
                        </aside>
                    </section>

                    <section className="performance-dual-grid">
                        <div className="performance-card performance-panel performance-fade-up" style={{ animationDelay: '300ms' }}>
                            <div className="performance-panel-head">
                                <div className="performance-panel-title-wrap">
                                    <TrendingUp className="performance-panel-icon" />
                                    <h2 className="performance-panel-title">Team Rating Trend</h2>
                                </div>
                            </div>
                            <RatingTrendChart data={trendChartData} height={188} />
                        </div>

                        <div className="performance-card performance-panel performance-fade-up" style={{ animationDelay: '340ms' }}>
                            <div className="performance-panel-head">
                                <div className="performance-panel-title-wrap">
                                    <Users className="performance-panel-icon" />
                                    <h2 className="performance-panel-title">Top Employees by Rating</h2>
                                </div>
                            </div>
                            <HorizontalBarChart
                                data={topEmployeesForComparison.map((e) => ({
                                    name: e.fullname.split(' ')[0],
                                    value: e.avg_rating_10,
                                }))}
                                height={Math.max(140, topEmployeesForComparison.length * 40 + 24)}
                                maxValue={10}
                            />
                        </div>
                    </section>

                    <section className="performance-wide-grid">
                        <div className="performance-card performance-panel performance-fade-up performance-panel-heatmap" style={{ animationDelay: '360ms' }}>
                            <div className="performance-panel-head">
                                <div className="performance-panel-title-wrap">
                                    <Target className="performance-panel-icon" />
                                    <h2 className="performance-panel-title">Skills Heatmap</h2>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="performance-heatmap-table">
                                    <thead>
                                        <tr>
                                            <th className="text-left">Employee</th>
                                            {skillKeys.map((k) => (
                                                <th key={k}>{SKILL_LABELS[k]}</th>
                                            ))}
                                            <th className="performance-heatmap-avg-head">AVG</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analytics?.employees
                                            ?.filter((e) => e.analyzed_tickets > 0)
                                            .sort((a, b) => b.skill_avg - a.skill_avg)
                                            .map((emp) => (
                                                <tr key={emp.user_id} className="performance-heatmap-row">
                                                    <td>
                                                        <div className="performance-heatmap-user">
                                                            <Avatar name={emp.fullname} size="sm" />
                                                            <span className="performance-heatmap-user-name">{emp.fullname}</span>
                                                        </div>
                                                    </td>
                                                    {skillKeys.map((k) => (
                                                        <td key={k}>
                                                            <SkillHeatmapCell value={emp.skills[k]} label={SKILL_LABELS[k]} />
                                                        </td>
                                                    ))}
                                                    <td>
                                                        <span className="performance-skill-avg" title={`Average skill score: ${emp.skill_avg.toFixed(1)}`}>
                                                            {emp.skill_avg.toFixed(1)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        {analytics?.employees?.filter((e) => e.analyzed_tickets > 0).length === 0 && (
                                            <tr>
                                                <td colSpan={skillKeys.length + 2} className="performance-empty">No analyzed tickets in this period</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="performance-card performance-panel performance-fade-up" style={{ animationDelay: '400ms' }}>
                            <div className="performance-panel-head">
                                <div className="performance-panel-title-wrap">
                                    <BarChart3 className="performance-panel-icon" />
                                    <h2 className="performance-panel-title">Rating Distribution</h2>
                                </div>
                            </div>
                            <RatingDistChart data={ratingDistChart} height={200} />
                        </div>
                    </section>

                    <section className="performance-fade-up" style={{ animationDelay: '440ms' }}>
                        <div className="performance-section-head">
                            <div className="performance-panel-title-wrap">
                                <Users className="performance-panel-icon" />
                                <h2 className="performance-panel-title">Individual Performance</h2>
                            </div>
                            <span className="performance-employee-count">({analytics?.employees?.length ?? 0} employees)</span>
                        </div>
                        <div className="performance-employee-grid">
                            {analytics?.employees?.map((emp, index) => (
                                <article
                                    key={emp.user_id}
                                    className="performance-card performance-employee-card group performance-fade-up"
                                    style={{ animationDelay: `${480 + Math.min(index, 6) * 40}ms` }}
                                    title={`${emp.fullname}: ${emp.avg_rating_5.toFixed(1)} rating, ${emp.completion_rate.toFixed(0)}% completion`}
                                >
                                    <div className="performance-employee-head">
                                        <div
                                            className={`relative ${isSuperAdmin ? 'cursor-pointer group/avatar' : ''}`}
                                            onClick={() => handleAvatarClick(emp.user_id)}
                                        >
                                            <Avatar
                                                name={emp.fullname}
                                                src={emp.avatar_url}
                                                onlineStatus={!!employeeStatuses[emp.user_id]}
                                            />
                                            {isSuperAdmin && (
                                                <div className="performance-avatar-overlay">
                                                    <Camera className="w-4 h-4 text-white" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="performance-employee-name">{emp.fullname}</p>
                                            <p className="performance-employee-role">{emp.role}</p>
                                        </div>
                                    </div>

                                    <div className="flex justify-center mb-3">
                                        <SkillRadarChart
                                            labels={skillKeys.slice(0, 6).map((k) => SKILL_CHART_LABELS[k])}
                                            values={skillKeys.slice(0, 6).map((k) => emp.skills[k] || 0)}
                                            size={134}
                                        />
                                    </div>

                                    <div className="performance-employee-stats">
                                        <div className="performance-employee-stat">
                                            <p className="performance-employee-stat-value">{emp.total_tickets}</p>
                                            <p className="performance-employee-stat-label">Tickets</p>
                                        </div>
                                        <div className="performance-employee-stat">
                                            <p className="performance-employee-stat-value inline-flex items-center justify-center gap-1">
                                                <Star className="w-3.5 h-3.5 fill-current" style={{ color: 'var(--performance-rating-star)' }} />
                                                {emp.avg_rating_5.toFixed(1)}
                                            </p>
                                            <p className="performance-employee-stat-label">Rating</p>
                                        </div>
                                        <div className="performance-employee-stat">
                                            <p className="performance-employee-stat-value">{emp.completion_rate.toFixed(0)}%</p>
                                            <p className="performance-employee-stat-label">Complete</p>
                                        </div>
                                    </div>

                                    {emp.recent_ratings.length >= 2 && (
                                        <div className="performance-employee-sparkline">
                                            <SparklineSVG data={emp.recent_ratings.map((r) => r.rating)} width={152} height={30} />
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                    </section>
                </div>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                />
            </div>
        </AdminShell>
    );
}
