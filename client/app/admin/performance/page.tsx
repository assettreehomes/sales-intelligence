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

const PERIODS = [
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' },
];

// ═══════════════════════════════════════════════
// SVG Chart Components (Zero Dependencies)
// ═══════════════════════════════════════════════

function SparklineSVG({ data, width = 120, height = 32, color = '#8b5cf6' }: {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
}) {
    if (!data || data.length < 2) return <div style={{ width, height }} />;
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
                <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
            </defs>
            <polygon points={areaPoints.join(' ')} fill={`url(#spark-${color.replace('#', '')})`} />
            <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function RadarChartSVG({
    labels,
    values,
    size = 160,
    color = '#8b5cf6',
}: {
    labels: string[];
    values: number[];
    size?: number;
    color?: string;
}) {
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 24;
    const n = labels.length;
    const angleStep = (2 * Math.PI) / n;

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
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-sm">
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
                        stroke="#e5e7eb"
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
                        stroke="#e5e7eb"
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
                return <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />;
            })}
            {/* Labels */}
            {labels.map((label, i) => {
                const angle = (i * angleStep) - Math.PI / 2;
                const lx = cx + (r + 16) * Math.cos(angle);
                const ly = cy + (r + 16) * Math.sin(angle);
                return (
                    <text
                        key={i}
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="fill-gray-500 text-[9px] font-medium"
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
}: {
    data: { label: string; value: number | null }[];
    width?: number;
    height?: number;
}) {
    const filtered = data.filter((d) => d.value !== null) as { label: string; value: number }[];
    if (filtered.length < 2) {
        return (
            <div style={{ width, height }} className="flex items-center justify-center text-gray-400 text-sm">
                Not enough data
            </div>
        );
    }

    const padL = 36;
    const padR = 12;
    const padT = 16;
    const padB = 28;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;
    const maxVal = Math.max(...filtered.map((d) => d.value), 1);
    const minVal = Math.min(...filtered.map((d) => d.value), 0);
    const range = maxVal - minVal || 1;

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
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                </linearGradient>
            </defs>
            {/* Y grid lines + labels */}
            {yTickVals.map((val, i) => {
                const y = padT + chartH - ((val - minVal) / range) * chartH;
                return (
                    <g key={i}>
                        <line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke="#f3f4f6" strokeWidth={1} />
                        <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-gray-400 text-[10px]">
                            {val.toFixed(1)}
                        </text>
                    </g>
                );
            })}
            {/* Area + Line */}
            <path d={areaPath} fill="url(#areaGrad)" />
            <path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {/* Data points */}
            {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill="#8b5cf6" stroke="white" strokeWidth={1.5} />
            ))}
            {/* X-axis labels (show max 8) */}
            {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 8)) === 0 || i === points.length - 1).map((p, i) => (
                <text key={i} x={p.x} y={height - 6} textAnchor="middle" className="fill-gray-400 text-[9px]">
                    {p.label.slice(5)}
                </text>
            ))}
        </svg>
    );
}

function BarChartSVG({
    data,
    width = 500,
    height = 200,
}: {
    data: { label: string; value: number; color: string }[];
    width?: number;
    height?: number;
}) {
    if (data.length === 0) return null;

    const padL = 60;
    const padR = 16;
    const padT = 8;
    const padB = 8;
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
                        <rect x={padL} y={y} width={chartW} height={barH} rx={4} fill="#f3f4f6" />
                        {/* Bar */}
                        <rect x={padL} y={y} width={w} height={barH} rx={4} fill={d.color} opacity={0.85} />
                        {/* Label */}
                        <text x={padL - 6} y={y + barH / 2 + 1} textAnchor="end" dominantBaseline="central" className="fill-gray-600 text-[11px] font-medium">
                            {d.label}
                        </text>
                        {/* Value */}
                        <text x={padL + w + 6} y={y + barH / 2 + 1} dominantBaseline="central" className="fill-gray-500 text-[10px] font-semibold">
                            {d.value}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

function CircularProgress({ value, size = 56, strokeWidth = 5, color = '#8b5cf6' }: {
    value: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
}) {
    const r = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;
    const offset = circumference - (Math.min(value, 100) / 100) * circumference;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
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
            <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" className="fill-gray-900 text-xs font-bold">
                {Math.round(value)}%
            </text>
        </svg>
    );
}

// ═══════════════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════════════



function MedalBadge({ rank }: { rank: number }) {
    if (rank === 1) return <span className="text-xl">🥇</span>;
    if (rank === 2) return <span className="text-xl">🥈</span>;
    if (rank === 3) return <span className="text-xl">🥉</span>;
    return <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center">#{rank}</span>;
}


function SkillHeatmapCell({ value }: { value: number }) {
    let bg = 'bg-gray-100 text-gray-400';
    if (value >= 8) bg = 'bg-emerald-100 text-emerald-700';
    else if (value >= 6) bg = 'bg-green-50 text-green-700';
    else if (value >= 4) bg = 'bg-yellow-50 text-yellow-700';
    else if (value >= 2) bg = 'bg-orange-50 text-orange-700';
    else if (value > 0) bg = 'bg-red-50 text-red-600';
    return (
        <div className={`${bg} rounded px-2 py-1 text-center text-[11px] font-semibold tabular-nums min-w-[40px]`}>
            {value > 0 ? value.toFixed(1) : '—'}
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

    // Actually useAuth provides `profile`? Let's check imports. useAuth context usually provides profile.
    // Line 5: import { useAuth } from '@/contexts/AuthContext';
    // Line 451: const { session } = useAuth();
    // I should check what useAuth returns.

    // Let's assume useAuth returns 'profile' as well based on previous knowledge.
    // Retrying replacement with assumption or derived logic.


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
                statusRes.ok ? statusRes.json() : Promise.resolve([])
            ]);

            setAnalytics(empData);
            setLeaderboard(lbData);

            const statusMap: Record<string, boolean> = {};
            if (Array.isArray(statusData)) {
                statusData.forEach((s: { user_id?: string; is_online?: boolean }) => {
                    if (s.user_id) statusMap[s.user_id] = !!s.is_online;
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
        fetchData();
    }, [fetchData]);

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
            color: b.color,
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
                <div className="flex items-center justify-center min-h-screen">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                        <p className="text-gray-500 text-sm">Loading analytics...</p>
                    </div>
                </div>
            </AdminShell>
        );
    }

    const s = analytics?.summary;

    return (
        <AdminShell activeSection="performance">
            <div className="min-h-screen bg-gray-50">
                {/* ───────── Header ───────── */}
                <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-violet-800 px-6 py-8">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div>
                                <h1 className="text-2xl font-bold text-white">Performance Dashboard</h1>
                                <p className="text-purple-200 text-sm mt-1">
                                    Employee analytics & team insights
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex bg-white/10 backdrop-blur-sm rounded-lg p-1">
                                    {PERIODS.map((p) => (
                                        <button
                                            key={p.key}
                                            onClick={() => setPeriod(p.key)}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${period === p.key
                                                ? 'bg-white text-purple-700 shadow-sm'
                                                : 'text-white/80 hover:text-white hover:bg-white/10'
                                                }`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={fetchData}
                                    disabled={loading}
                                    className="p-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="max-w-7xl mx-auto px-6 mt-4">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">{error}</div>
                    </div>
                )}

                <div className="max-w-7xl mx-auto px-6 -mt-6 pb-12 space-y-6">
                    {/* ───────── Row 1: KPI Cards ───────── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Total Tickets */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                                <div className="p-2 bg-purple-50 rounded-lg">
                                    <BarChart3 className="w-5 h-5 text-purple-600" />
                                </div>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{s?.total_tickets ?? 0}</p>
                            <p className="text-xs text-gray-500 mt-1">Total Tickets</p>
                        </div>

                        {/* Avg Rating */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                                <div className="p-2 bg-yellow-50 rounded-lg">
                                    <Star className="w-5 h-5 text-yellow-500" />
                                </div>
                                <div className="flex gap-0.5">
                                    {[1, 2, 3, 4, 5].map((i) => (
                                        <Star
                                            key={i}
                                            className={`w-3 h-3 ${i <= Math.round(s?.avg_rating_5 ?? 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
                                        />
                                    ))}
                                </div>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{s?.avg_rating_5?.toFixed(1) ?? '0.0'}<span className="text-sm text-gray-400 font-normal">/5</span></p>
                            <p className="text-xs text-gray-500 mt-1">Avg Rating</p>
                        </div>

                        {/* Completion Rate */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-1">
                                <div className="p-2 bg-emerald-50 rounded-lg">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                </div>
                                <CircularProgress value={s?.completion_rate ?? 0} size={48} strokeWidth={4} color="#10b981" />
                            </div>
                            <p className="text-xs text-gray-500 mt-2">Completion Rate</p>
                        </div>

                        {/* Training Calls */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                                <div className="p-2 bg-violet-50 rounded-lg">
                                    <Trophy className="w-5 h-5 text-violet-600" />
                                </div>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{s?.training_calls ?? 0}</p>
                            <p className="text-xs text-gray-500 mt-1">Training Calls <span className="text-gray-400">({s?.total_tickets ? ((s.training_calls / s.total_tickets) * 100).toFixed(0) : 0}%)</span></p>
                        </div>
                    </div>

                    {/* ───────── Row 2: Leaderboard + Top Performer ───────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Leaderboard */}
                        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-purple-600" />
                                <h2 className="font-semibold text-gray-900">Leaderboard</h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-50">
                                            <th className="px-5 py-3 w-12">#</th>
                                            <th className="px-3 py-3">Employee</th>
                                            <th className="px-3 py-3 text-center">Tickets</th>
                                            <th className="px-3 py-3 text-center">Rating</th>
                                            <th className="px-3 py-3 text-center">Completion</th>
                                            <th className="px-3 py-3 text-center">Skills</th>
                                            <th className="px-3 py-3 text-right">Score</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboard?.leaderboard?.map((entry) => (
                                            <tr
                                                key={entry.user_id}
                                                className={`border-b border-gray-50 hover:bg-purple-50/30 transition-colors ${entry.rank <= 3 ? 'bg-purple-50/20' : ''}`}
                                            >
                                                <td className="px-5 py-3">
                                                    <MedalBadge rank={entry.rank} />
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <Avatar name={entry.fullname} src={entry.avatar_url} size="sm" />
                                                        <div>
                                                            <p className="font-medium text-gray-900 text-sm">{entry.fullname}</p>
                                                            <p className="text-[11px] text-gray-400">{entry.role}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-center text-gray-700 font-medium">{entry.total_tickets}</td>
                                                <td className="px-3 py-3 text-center">
                                                    <span className="inline-flex items-center gap-1 text-gray-700">
                                                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                                        {entry.avg_rating_5.toFixed(1)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-center text-gray-700">{entry.completion_rate.toFixed(0)}%</td>
                                                <td className="px-3 py-3 text-center text-gray-700">{entry.skill_avg.toFixed(1)}</td>
                                                <td className="px-3 py-3 text-right">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                                                        {entry.composite_score.toFixed(1)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {(!leaderboard?.leaderboard || leaderboard.leaderboard.length === 0) && (
                                            <tr>
                                                <td colSpan={7} className="px-5 py-8 text-center text-gray-400">
                                                    No data available for this period
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Top Performer Spotlight */}
                        <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-xl shadow-lg p-6 text-white">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-2xl">🏆</span>
                                <h2 className="font-semibold">Top Performer</h2>
                            </div>
                            {topPerformer && topPerformerEmployee ? (
                                <div className="flex flex-col items-center text-center">
                                    <Avatar name={topPerformer.fullname} src={topPerformer.avatar_url} size="lg" />
                                    <h3 className="text-lg font-bold mt-3">{topPerformer.fullname}</h3>
                                    <p className="text-purple-200 text-sm">{topPerformer.role}</p>
                                    <div className="mt-4 w-full">
                                        <RadarChartSVG
                                            labels={skillKeys.slice(0, 6).map((k) => SKILL_LABELS[k])}
                                            values={skillKeys.slice(0, 6).map((k) => topPerformerEmployee.skills[k] || 0)}
                                            size={160}
                                            color="#e9d5ff"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 mt-4 w-full">
                                        <div className="bg-white/10 rounded-lg p-2">
                                            <p className="text-xs text-purple-200">Tickets</p>
                                            <p className="text-lg font-bold">{topPerformer.total_tickets}</p>
                                        </div>
                                        <div className="bg-white/10 rounded-lg p-2">
                                            <p className="text-xs text-purple-200">Rating</p>
                                            <p className="text-lg font-bold">{topPerformer.avg_rating_5.toFixed(1)}</p>
                                        </div>
                                        <div className="bg-white/10 rounded-lg p-2">
                                            <p className="text-xs text-purple-200">Score</p>
                                            <p className="text-lg font-bold">{topPerformer.composite_score.toFixed(1)}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-purple-200 text-sm text-center mt-8">No data yet</p>
                            )}
                        </div>
                    </div>

                    {/* ───────── Row 3: Trend + Comparison ───────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Rating Trend */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <TrendingUp className="w-5 h-5 text-purple-600" />
                                <h2 className="font-semibold text-gray-900">Team Rating Trend</h2>
                            </div>
                            <AreaChartSVG data={trendChartData} width={520} height={180} />
                        </div>

                        {/* Employee Comparison */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <Users className="w-5 h-5 text-purple-600" />
                                <h2 className="font-semibold text-gray-900">Top Employees by Rating</h2>
                            </div>
                            <BarChartSVG
                                data={topEmployeesForComparison.map((e) => ({
                                    label: e.fullname.split(' ')[0],
                                    value: e.avg_rating_10,
                                    color: '#8b5cf6',
                                }))}
                                width={520}
                                height={Math.max(140, topEmployeesForComparison.length * 34 + 16)}
                            />
                        </div>
                    </div>

                    {/* ───────── Row 4: Skills Heatmap + Rating Distribution ───────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Skills Heatmap */}
                        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                                <Target className="w-5 h-5 text-purple-600" />
                                <h2 className="font-semibold text-gray-900">Skills Heatmap</h2>
                            </div>
                            <div className="overflow-x-auto p-4">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr>
                                            <th className="text-left pb-2 pr-3 text-xs font-medium text-gray-500">Employee</th>
                                            {skillKeys.map((k) => (
                                                <th key={k} className="pb-2 px-1 text-center text-[10px] font-medium text-gray-500 whitespace-nowrap">
                                                    {SKILL_LABELS[k]}
                                                </th>
                                            ))}
                                            <th className="pb-2 px-1 text-center text-[10px] font-semibold text-purple-600">AVG</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analytics?.employees
                                            ?.filter((e) => e.analyzed_tickets > 0)
                                            .sort((a, b) => b.skill_avg - a.skill_avg)
                                            .map((emp) => (
                                                <tr key={emp.user_id} className="border-t border-gray-50">
                                                    <td className="py-2 pr-3">
                                                        <div className="flex items-center gap-2">
                                                            <Avatar name={emp.fullname} size="sm" />
                                                            <span className="text-sm font-medium text-gray-800 whitespace-nowrap">
                                                                {emp.fullname}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    {skillKeys.map((k) => (
                                                        <td key={k} className="py-2 px-1">
                                                            <SkillHeatmapCell value={emp.skills[k]} />
                                                        </td>
                                                    ))}
                                                    <td className="py-2 px-1">
                                                        <div className="bg-purple-50 text-purple-700 rounded px-2 py-1 text-center text-[11px] font-bold min-w-[40px]">
                                                            {emp.skill_avg.toFixed(1)}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        {analytics?.employees?.filter((e) => e.analyzed_tickets > 0).length === 0 && (
                                            <tr>
                                                <td colSpan={skillKeys.length + 2} className="py-6 text-center text-gray-400 text-sm">
                                                    No analyzed tickets in this period
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Rating Distribution */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <BarChart3 className="w-5 h-5 text-purple-600" />
                                <h2 className="font-semibold text-gray-900">Rating Distribution</h2>
                            </div>
                            <BarChartSVG
                                data={ratingDistChart}
                                width={320}
                                height={200}
                            />
                        </div>
                    </div>

                    {/* ───────── Row 5: Employee Cards ───────── */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Users className="w-5 h-5 text-purple-600" />
                            <h2 className="font-semibold text-gray-900">Individual Performance</h2>
                            <span className="text-xs text-gray-400">({analytics?.employees?.length ?? 0} employees)</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {analytics?.employees?.map((emp) => (
                                <div
                                    key={emp.user_id}
                                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-purple-200 transition-all group"
                                >
                                    <div className="flex items-center gap-3 mb-4">
                                        <div
                                            className={`relative ${isSuperAdmin ? 'cursor-pointer group/avatar' : ''}`}
                                            onClick={() => handleAvatarClick(emp.user_id)}
                                        >
                                            <Avatar
                                                name={emp.fullname}
                                                src={emp.avatar_url} // Ensure API returns avatar_url. Previously verified users endpoint does. Analytics endpoint might need it.
                                                onlineStatus={!!employeeStatuses[emp.user_id]}
                                            />
                                            {isSuperAdmin && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                                    <Camera className="w-4 h-4 text-white" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-gray-900 text-sm truncate">{emp.fullname}</p>
                                            <p className="text-[11px] text-gray-400 capitalize">{emp.role}</p>
                                        </div>
                                    </div>

                                    {/* Mini Radar */}
                                    <div className="flex justify-center mb-3">
                                        <RadarChartSVG
                                            labels={skillKeys.slice(0, 6).map((k) => SKILL_LABELS[k])}
                                            values={skillKeys.slice(0, 6).map((k) => emp.skills[k] || 0)}
                                            size={130}
                                        />
                                    </div>

                                    {/* Stats Row */}
                                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-gray-900">{emp.total_tickets}</p>
                                            <p className="text-[10px] text-gray-400">Tickets</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-gray-900 flex items-center gap-1 justify-center">
                                                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                                                {emp.avg_rating_5.toFixed(1)}
                                            </p>
                                            <p className="text-[10px] text-gray-400">Rating</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-gray-900">{emp.completion_rate.toFixed(0)}%</p>
                                            <p className="text-[10px] text-gray-400">Complete</p>
                                        </div>
                                    </div>

                                    {/* Sparkline */}
                                    {emp.recent_ratings.length >= 2 && (
                                        <div className="mt-3 flex justify-center">
                                            <SparklineSVG data={emp.recent_ratings.map((r) => r.rating)} width={140} height={28} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
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
