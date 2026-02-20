'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { useAuth } from '@/contexts/AuthContext';
import {
    TrendingUp,
    Users,
    Star,
    CheckCircle2,
    Trophy,
    BarChart3,
    Target,

    RefreshCw,
    Camera
} from 'lucide-react';
import { useRef } from 'react';
import { Avatar } from '@/components/Avatar';

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
    poor: 'var(--performance-dist-poor)',
    fair: 'var(--performance-dist-fair)',
    good: 'var(--performance-dist-good)',
    great: 'var(--performance-dist-great)',
    excellent: 'var(--performance-dist-excellent)',
};

const PERIODS = [
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' },
];

// ═══════════════════════════════════════════════
// SVG Chart Components (Zero Dependencies)
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

function RadarChartSVG({
    labels,
    values,
    size = 160,
    color = 'var(--performance-accent)',
}: {
    labels: string[];
    values: number[];
    size?: number;
    color?: string;
}) {
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 30;
    const n = labels.length;
    const angleStep = (2 * Math.PI) / n;
    const gridColor = 'var(--performance-chart-grid)';
    const labelColor = 'var(--performance-chart-label)';
    const labelRadius = r + 10;

    const getPoint = (i: number, val: number) => {
        const angle = (i * angleStep) - Math.PI / 2;
        const norm = Math.min(val / 10, 1);
        return {
            x: cx + norm * r * Math.cos(angle),
            y: cy + norm * r * Math.sin(angle),
        };
    };

    // Grid levels
    const levels = [0.25, 0.5, 0.75, 1.0];

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="performance-radar-chart drop-shadow-sm">
            {/* Grid */}
            {levels.map((level) => {
                const pts = Array.from({ length: n }, (_, i) => {
                    const angle = (i * angleStep) - Math.PI / 2;
                    return `${cx + level * r * Math.cos(angle)},${cy + level * r * Math.sin(angle)}`;
                });
                return (
                    <polygon
                        key={level}
                        points={pts.join(' ')}
                        fill="none"
                        stroke={gridColor}
                        strokeWidth={0.5}
                    />
                );
            })}
            {/* Axes */}
            {Array.from({ length: n }, (_, i) => {
                const angle = (i * angleStep) - Math.PI / 2;
                return (
                    <line
                        key={i}
                        x1={cx}
                        y1={cy}
                        x2={cx + r * Math.cos(angle)}
                        y2={cy + r * Math.sin(angle)}
                        stroke={gridColor}
                        strokeWidth={0.5}
                    />
                );
            })}
            {/* Data polygon */}
            <polygon
                points={values.map((v, i) => {
                    const p = getPoint(i, v);
                    return `${p.x},${p.y}`;
                }).join(' ')}
                fill={color}
                fillOpacity={0.2}
                stroke={color}
                strokeWidth={2}
            />
            {/* Data points */}
            {values.map((v, i) => {
                const p = getPoint(i, v);
                return (
                    <g key={i}>
                        <circle cx={p.x} cy={p.y} r={3} fill={color} />
                        <title>{`${labels[i]}: ${v.toFixed(1)}`}</title>
                    </g>
                );
            })}
            {/* Labels */}
            {labels.map((label, i) => {
                const angle = (i * angleStep) - Math.PI / 2;
                const lx = cx + labelRadius * Math.cos(angle);
                const ly = cy + labelRadius * Math.sin(angle);
                const anchor = Math.cos(angle) > 0.28 ? 'start' : Math.cos(angle) < -0.28 ? 'end' : 'middle';
                return (
                    <text
                        key={i}
                        x={lx}
                        y={ly}
                        textAnchor={anchor}
                        dominantBaseline="central"
                        fill={labelColor}
                        className="text-[10px] font-semibold"
                    >
                        {label}
                    </text>
                );
            })}
        </svg>
    );
}

function AreaChartSVG({
    data,
    width = 500,
    height = 180,
    xAxisLabel = 'Date',
    yAxisLabel = 'Average Rating (/5)',
}: {
    data: { label: string; value: number | null }[];
    width?: number;
    height?: number;
    xAxisLabel?: string;
    yAxisLabel?: string;
}) {
    const filtered = data.filter((d) => d.value !== null) as { label: string; value: number }[];
    if (filtered.length < 2) {
        return (
            <div style={{ width, height, color: 'var(--performance-muted)' }} className="flex items-center justify-center text-sm">
                Not enough data
            </div>
        );
    }

    const padL = 50;
    const padR = 12;
    const padT = 16;
    const padB = 38;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;
    const maxVal = Math.max(...filtered.map((d) => d.value), 1);
    const minVal = Math.min(...filtered.map((d) => d.value), 0);
    const range = maxVal - minVal || 1;
    const gradientId = 'performance-area-gradient';

    const points = filtered.map((d, i) => ({
        x: padL + (i / (filtered.length - 1)) * chartW,
        y: padT + chartH - ((d.value - minVal) / range) * chartH,
        label: d.label,
        value: d.value,
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const areaPath = `${linePath} L${points[points.length - 1].x},${padT + chartH} L${points[0].x},${padT + chartH} Z`;

    // Y-axis ticks
    const yTicks = 4;
    const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minVal + (i / yTicks) * range);

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--performance-accent)" stopOpacity={0.34} />
                    <stop offset="100%" stopColor="var(--performance-accent)" stopOpacity={0.02} />
                </linearGradient>
            </defs>
            {/* Y grid lines + labels */}
            {yTickVals.map((val, i) => {
                const y = padT + chartH - ((val - minVal) / range) * chartH;
                return (
                    <g key={i}>
                        <line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke="var(--performance-chart-grid)" strokeWidth={1} />
                        <text x={padL - 6} y={y + 3} textAnchor="end" fill="var(--performance-chart-label)" className="text-[10px]">
                            {val.toFixed(1)}
                        </text>
                    </g>
                );
            })}
            {/* Area + Line */}
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} fill="none" stroke="var(--performance-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {/* Data points */}
            {points.map((p, i) => (
                <g key={i}>
                    <circle cx={p.x} cy={p.y} r={3} fill="var(--performance-accent)" stroke="var(--performance-surface-elevated)" strokeWidth={1.5} />
                    <title>{`${p.label}: ${p.value.toFixed(2)}`}</title>
                </g>
            ))}
            {/* X-axis labels (show max 8) */}
            {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 8)) === 0 || i === points.length - 1).map((p, i) => (
                <text key={i} x={p.x} y={height - 6} textAnchor="middle" fill="var(--performance-chart-label)" className="text-[9px]">
                    {p.label.length > 5 ? p.label.slice(5) : p.label}
                </text>
            ))}
            <text x={padL + chartW / 2} y={height - 20} textAnchor="middle" fill="var(--performance-chart-label)" className="text-[10px] font-semibold">
                {xAxisLabel}
            </text>
            <text
                x={14}
                y={padT + chartH / 2}
                textAnchor="middle"
                transform={`rotate(-90 14 ${padT + chartH / 2})`}
                fill="var(--performance-chart-label)"
                className="text-[10px] font-semibold"
            >
                {yAxisLabel}
            </text>
        </svg>
    );
}

function BarChartSVG({
    data,
    width = 500,
    height = 200,
    xAxisLabel = 'Value',
    valueFormatter,
}: {
    data: { label: string; value: number; color: string }[];
    width?: number;
    height?: number;
    xAxisLabel?: string;
    valueFormatter?: (value: number) => string;
}) {
    if (data.length === 0) return null;

    const padL = 60;
    const padR = 16;
    const padT = 8;
    const padB = 28;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;
    const maxVal = Math.max(...data.map((d) => d.value), 1);
    const barH = Math.min(28, (chartH - (data.length - 1) * 6) / data.length);
    const gap = 6;

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
            {data.map((d, i) => {
                const y = padT + i * (barH + gap);
                const w = (d.value / maxVal) * chartW;
                return (
                    <g key={i}>
                        {/* Background track */}
                        <rect x={padL} y={y} width={chartW} height={barH} rx={4} fill="var(--performance-chart-track)" />
                        {/* Bar */}
                        <rect x={padL} y={y} width={w} height={barH} rx={4} fill={d.color} opacity={0.85} />
                        {/* Label */}
                        <text x={padL - 6} y={y + barH / 2 + 1} textAnchor="end" dominantBaseline="central" fill="var(--performance-chart-label)" className="text-[11px] font-medium">
                            {d.label}
                        </text>
                        {/* Value */}
                        <text x={padL + w + 6} y={y + barH / 2 + 1} dominantBaseline="central" fill="var(--performance-chart-label)" className="text-[10px] font-semibold">
                            {valueFormatter ? valueFormatter(d.value) : d.value}
                        </text>
                        <title>{`${d.label}: ${valueFormatter ? valueFormatter(d.value) : d.value}`}</title>
                    </g>
                );
            })}
            <text x={padL + chartW} y={height - 8} textAnchor="end" fill="var(--performance-chart-label)" className="text-[10px] font-semibold">
                {xAxisLabel}
            </text>
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
            label: t.date,
            value: t.avg_rating_5,
        }));
    }, [analytics]);

    const ratingDistChart = useMemo(() => {
        if (!analytics?.rating_distribution) return [];
        return analytics.rating_distribution.map((b) => ({
            label: b.label,
            value: b.count,
            color: RATING_DISTRIBUTION_COLOR_BY_LABEL[b.label.trim().toLowerCase()] ?? 'var(--performance-dist-default)',
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
                                <div className="performance-period-switch">
                                    {PERIODS.map((p) => (
                                        <button
                                            key={p.key}
                                            onClick={() => setPeriod(p.key)}
                                            className={`performance-period-btn ${period === p.key ? 'is-active' : ''}`}
                                            title={`View metrics for last ${p.label}`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
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
                                        <RadarChartSVG
                                            labels={skillKeys.slice(0, 6).map((k) => SKILL_CHART_LABELS[k])}
                                            values={skillKeys.slice(0, 6).map((k) => topPerformerEmployee.skills[k] || 0)}
                                            size={168}
                                            color="var(--performance-spotlight-radar)"
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
                            <AreaChartSVG data={trendChartData} width={520} height={188} xAxisLabel="Date" yAxisLabel="Avg Rating (/5)" />
                        </div>

                        <div className="performance-card performance-panel performance-fade-up" style={{ animationDelay: '340ms' }}>
                            <div className="performance-panel-head">
                                <div className="performance-panel-title-wrap">
                                    <Users className="performance-panel-icon" />
                                    <h2 className="performance-panel-title">Top Employees by Rating</h2>
                                </div>
                            </div>
                            <BarChartSVG
                                data={topEmployeesForComparison.map((e) => ({
                                    label: e.fullname.split(' ')[0],
                                    value: e.avg_rating_10,
                                    color: 'var(--performance-accent)',
                                }))}
                                width={520}
                                height={Math.max(140, topEmployeesForComparison.length * 34 + 18)}
                                xAxisLabel="Rating (0 to 10)"
                                valueFormatter={(value) => value.toFixed(2)}
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
                            <BarChartSVG
                                data={ratingDistChart}
                                width={320}
                                height={200}
                                xAxisLabel="Number of Employees"
                            />
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
                                        <RadarChartSVG
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
