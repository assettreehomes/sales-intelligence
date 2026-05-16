'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { API_URL, getToken } from '@/stores/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { OutcomeDonutChart, AuthenticityBarChart, DailyTrendChart } from '@/components/ui/charts';
import {
    Clock, Loader2, PhoneCall, Search, ShieldAlert, ShieldCheck,
    Users, TrendingUp, CheckCircle2, XCircle, RefreshCw,
    AlertTriangle, Trophy, ChevronDown, ChevronUp, Minus, Star,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────
type OutcomeCounts = { interested: number; not_interested: number; follow_up_required: number };
type AuthenticityCounts = { real: number; fake: number };
type PerformanceBucket = {
    id: string; label: string; email?: string | null;
    total_calls: number; analyzed_calls: number;
    avg_duration_seconds: number; avg_rating_10: number;
    outcome_counts: OutcomeCounts; authenticity_counts: AuthenticityCounts;
    team_leader?: { full_name: string; email?: string | null } | null;
};
type OutcomeDataQuality = {
    real: number; inferred: number; unclassified: number;
    total_analyzed: number; is_partial: boolean;
};
type PresalesPerformance = {
    period: string; summary: PerformanceBucket;
    agents: PerformanceBucket[]; teams: PerformanceBucket[];
    daily: { date: string; count: number }[];
    weekly: { week: string; count: number }[];
    outcome_data_quality?: OutcomeDataQuality;
};

// ── Helpers ─────────────────────────────────────────────────────────
function fmtDuration(s: number) {
    if (!s) return '0s';
    const m = Math.floor(s / 60); const sec = s % 60;
    return m ? `${m}m ${sec}s` : `${sec}s`;
}

const PERIODS = [
    { key: '7d', label: '7 Days' }, { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' }, { key: 'all', label: 'All Time' },
];

// ── Theme tokens ──────────────────────────────────────────────────────
function useT() {
    const { theme } = useTheme();
    const d = theme === 'dark';
    return {
        d,
        pageBg: d
            ? 'linear-gradient(160deg,#0d0820 0%,#100c28 50%,#0a0618 100%)'
            : 'linear-gradient(160deg,#f5f0ff 0%,#faf8ff 50%,#f0ebff 100%)',
        headerBg: d
            ? 'linear-gradient(135deg,rgba(109,40,217,0.18),rgba(139,92,246,0.08))'
            : 'linear-gradient(135deg,rgba(109,40,217,0.07),rgba(139,92,246,0.03))',
        headerBorder: d ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.15)',
        headerRadial: d
            ? 'radial-gradient(ellipse 60% 80% at 80% 50%, rgba(139,92,246,0.12), transparent)'
            : 'radial-gradient(ellipse 60% 80% at 80% 50%, rgba(139,92,246,0.06), transparent)',
        cardBg: d ? '#130d27' : '#ffffff',
        cardBorder: d ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.2)',
        divider: d ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.12)',
        rowBorder: d ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.08)',
        rowHover: d ? 'rgba(139,92,246,0.06)' : 'rgba(139,92,246,0.04)',
        textStrong: d ? '#ffffff' : '#1e1040',
        textMuted: d ? 'rgba(255,255,255,0.45)' : 'rgba(30,16,64,0.5)',
        textFaint: d ? 'rgba(255,255,255,0.3)' : 'rgba(30,16,64,0.3)',
        textSub: d ? 'rgba(255,255,255,0.35)' : 'rgba(30,16,64,0.4)',
        textBody: d ? 'rgba(255,255,255,0.6)' : 'rgba(30,16,64,0.65)',
        textTh: d ? 'rgba(255,255,255,0.4)' : 'rgba(30,16,64,0.45)',
        accentLabel: d ? '#a78bfa' : '#7c3aed',
        trackBg: d ? 'rgba(255,255,255,0.1)' : 'rgba(30,16,64,0.1)',
        toggleBorder: d ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.25)',
        toggleInactive: d ? 'rgba(255,255,255,0.5)' : 'rgba(30,16,64,0.5)',
        inputBg: d ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.06)',
        inputBorder: 'rgba(139,92,246,0.2)',
        inputColor: d ? '#fff' : '#1e1040',
        searchIcon: d ? 'rgba(255,255,255,0.3)' : 'rgba(30,16,64,0.3)',
        refreshBtn: d ? 'rgba(255,255,255,0.6)' : 'rgba(30,16,64,0.6)',
        disclaimerText: d ? 'rgba(255,255,255,0.7)' : 'rgba(30,16,64,0.7)',
        noData: d ? 'rgba(255,255,255,0.3)' : 'rgba(30,16,64,0.35)',
        kpiIconBg: (color?: string) => color ? `${color}1a` : d ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.1)',
    };
}

// ── KPI Card ─────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color }: {
    icon: React.ReactNode; label: string; value: string | number;
    sub?: string; color?: string;
}) {
    const t = useT();
    return (
        <div className="rounded-2xl p-5 flex flex-col gap-3 border"
            style={{ background: t.cardBg, borderColor: t.cardBorder }}>
            <div className="flex items-center justify-between">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{ background: t.kpiIconBg(color), color: color || '#8b5cf6' }}>
                    {icon}
                </span>
                {sub && <span className="text-xs font-medium" style={{ color: color || '#8b5cf6' }}>{sub}</span>}
            </div>
            <div>
                <p className="text-3xl font-bold tracking-tight" style={{ color: t.textStrong }}>{value}</p>
                <p className="mt-1 text-xs font-medium uppercase tracking-widest" style={{ color: t.textMuted }}>{label}</p>
            </div>
        </div>
    );
}

// ── Score Bar ─────────────────────────────────────────────────────────
function ScoreBar({ value }: { value: number }) {
    const t = useT();
    const color = value >= 7 ? '#10b981' : value >= 5 ? '#f59e0b' : '#ef4444';
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: t.trackBg }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${(value / 10) * 100}%`, background: color }} />
            </div>
            <span className="w-6 text-right text-xs font-semibold tabular-nums" style={{ color }}>{value.toFixed(1)}</span>
        </div>
    );
}

// ── Sortable Table ────────────────────────────────────────────────────
type SortKey = 'calls' | 'rating' | 'interested' | 'fake';

function AgentTeamTable({ rows, mode }: { rows: PerformanceBucket[]; mode: 'agent' | 'team' }) {
    const t = useT();
    const [sortKey, setSortKey] = useState<SortKey>('calls');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    function handleSort(key: SortKey) {
        if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        else { setSortKey(key); setSortDir('desc'); }
    }

    const sorted = useMemo(() => [...rows].sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        if (sortKey === 'calls') return (a.total_calls - b.total_calls) * dir;
        if (sortKey === 'rating') return ((a.avg_rating_10 || 0) - (b.avg_rating_10 || 0)) * dir;
        if (sortKey === 'interested') return ((a.outcome_counts.interested || 0) - (b.outcome_counts.interested || 0)) * dir;
        return ((a.authenticity_counts.fake || 0) - (b.authenticity_counts.fake || 0)) * dir;
    }), [rows, sortKey, sortDir]);

    function SortIcon({ col }: { col: string }) {
        if (col !== sortKey) return <Minus className="h-3 w-3 opacity-20" />;
        return sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />;
    }

    const thBase = 'px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none';
    const thStyle = { color: t.textTh, borderBottom: `1px solid ${t.divider}` };

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
                <thead>
                    <tr style={thStyle}>
                        <th className={thBase}>{mode === 'agent' ? 'Agent' : 'Team'}</th>
                        <th className={`${thBase} text-right`} onClick={() => handleSort('calls')}>
                            <span className="inline-flex items-center justify-end gap-1">Calls <SortIcon col="calls" /></span>
                        </th>
                        <th className={thBase}>Duration</th>
                        <th className={`${thBase} text-right`} onClick={() => handleSort('rating')}>
                            <span className="inline-flex items-center justify-end gap-1">Rating <SortIcon col="rating" /></span>
                        </th>
                        <th className={thBase} style={{ minWidth: 110 }}>Outcome Mix</th>
                        <th className={`${thBase} text-right`} onClick={() => handleSort('interested')}>
                            <span className="inline-flex items-center justify-end gap-1">Interested <SortIcon col="interested" /></span>
                        </th>
                        <th className={`${thBase} text-right`} onClick={() => handleSort('fake')}>
                            <span className="inline-flex items-center justify-end gap-1">Fake <SortIcon col="fake" /></span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map(row => {
                        const tot = (row.outcome_counts.interested || 0) + (row.outcome_counts.not_interested || 0) + (row.outcome_counts.follow_up_required || 0) || 1;
                        const intPct = ((row.outcome_counts.interested || 0) / tot) * 100;
                        const notPct = ((row.outcome_counts.not_interested || 0) / tot) * 100;
                        const flwPct = ((row.outcome_counts.follow_up_required || 0) / tot) * 100;
                        return (
                            <tr key={row.id} className="transition-colors group"
                                style={{ borderBottom: `1px solid ${t.rowBorder}` }}
                                onMouseEnter={e => (e.currentTarget.style.background = t.rowHover)}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                <td className="px-4 py-3">
                                    <p className="font-semibold" style={{ color: t.textStrong }}>{row.label}</p>
                                    <p className="text-xs mt-0.5" style={{ color: t.textSub }}>
                                        {mode === 'agent' ? (row.email || '—') : (row.team_leader?.full_name ? `Leader: ${row.team_leader.full_name}` : 'No leader')}
                                    </p>
                                </td>
                                <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: t.textStrong }}>
                                    {row.total_calls}
                                    <span className="block text-xs font-normal" style={{ color: t.textSub }}>{row.analyzed_calls} analyzed</span>
                                </td>
                                <td className="px-4 py-3 tabular-nums" style={{ color: t.textBody }}>{fmtDuration(row.avg_duration_seconds)}</td>
                                <td className="px-4 py-3 w-32">
                                    {row.avg_rating_10 ? <ScoreBar value={row.avg_rating_10} /> : <span style={{ color: t.textFaint }}>—</span>}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex h-1.5 rounded-full overflow-hidden" style={{ background: t.trackBg, minWidth: 80 }}>
                                        {intPct > 1 && <div style={{ width: `${intPct}%`, background: '#10b981' }} />}
                                        {notPct > 1 && <div style={{ width: `${notPct}%`, background: '#ef4444' }} />}
                                        {flwPct > 1 && <div style={{ width: `${flwPct}%`, background: '#f59e0b' }} />}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <Badge variant="success">{row.outcome_counts.interested || 0}</Badge>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {(row.authenticity_counts.fake || 0) > 0
                                        ? <Badge variant="destructive">{row.authenticity_counts.fake}</Badge>
                                        : <span className="text-xs" style={{ color: t.textFaint }}>0</span>}
                                </td>
                            </tr>
                        );
                    })}
                    {sorted.length === 0 && (
                        <tr><td colSpan={7} className="py-12 text-center text-sm" style={{ color: t.noData }}>No data for this period.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────
function PresalesPerformanceContent() {
    const t = useT();
    const [period, setPeriod] = useState('30d');
    const [data, setData] = useState<PresalesPerformance | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'agents' | 'teams'>('agents');
    const [query, setQuery] = useState('');

    async function load(pd = period) {
        setLoading(true); setError(null);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/analytics/presales-performance?period=${pd}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to load');
            setData(json);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { void load(period); }, [period]);

    const activeRows = useMemo(() => {
        const rows = view === 'agents' ? data?.agents || [] : data?.teams || [];
        const q = query.trim().toLowerCase();
        return q ? rows.filter(r => r.label.toLowerCase().includes(q) || String(r.email || '').toLowerCase().includes(q)) : rows;
    }, [data, query, view]);

    const s = data?.summary;
    const interested = s?.outcome_counts.interested || 0;
    const notInterested = s?.outcome_counts.not_interested || 0;
    const followUp = s?.outcome_counts.follow_up_required || 0;
    const outcomeTotal = interested + notInterested + followUp;
    const realCalls = s?.authenticity_counts.real || 0;
    const fakeCalls = s?.authenticity_counts.fake || 0;
    const authTotal = realCalls + fakeCalls || 1;
    const fakeRate = s?.total_calls ? Math.round((fakeCalls / s.total_calls) * 100) : 0;

    const cardBase = { background: t.cardBg, borderColor: t.cardBorder };
    const sectionHead = 'text-base font-semibold';
    const mutedText = { color: t.textMuted };

    return (
        <AdminShell activeSection="presalesPerformance">
            <div className="min-h-screen" style={{ background: t.pageBg }}>

                {/* Header */}
                <header className="relative overflow-hidden border-b px-6 py-8 md:px-10"
                    style={{ borderColor: t.headerBorder, background: t.headerBg }}>
                    <div className="absolute inset-0 pointer-events-none"
                        style={{ background: t.headerRadial }} />
                    <div className="relative mx-auto max-w-7xl">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: t.accentLabel }}>Pre-Sales Intelligence</p>
                                <h1 className="text-3xl font-bold" style={{ color: t.textStrong }}>Presales Dashboard</h1>
                                <p className="mt-1 text-sm" style={mutedText}>Outcome quality, agent rankings, and call authenticity for TeleCMI calls.</p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: t.toggleBorder }}>
                                    {PERIODS.map(p => (
                                        <button key={p.key} onClick={() => setPeriod(p.key)}
                                            className="px-4 py-2 text-sm font-semibold transition-colors"
                                            style={period === p.key
                                                ? { background: '#7c3aed', color: '#fff' }
                                                : { background: 'transparent', color: t.toggleInactive }}>
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                                <button onClick={() => load(period)} disabled={loading}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors"
                                    style={{ borderColor: t.toggleBorder, color: t.refreshBtn }}>
                                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                </button>
                                <NotificationBell />
                            </div>
                        </div>
                    </div>
                </header>

                <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 space-y-6">
                    {loading ? (
                        <div className="flex min-h-80 items-center justify-center">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#8b5cf6' }} />
                                <p className="text-sm" style={mutedText}>Loading presales data…</p>
                            </div>
                        </div>
                    ) : error ? (
                        <div className="flex min-h-80 flex-col items-center justify-center gap-4">
                            <XCircle className="h-12 w-12" style={{ color: '#ef4444' }} />
                            <p className="font-semibold" style={{ color: t.textStrong }}>Unable to load presales performance</p>
                            <p className="text-sm" style={mutedText}>{error}</p>
                            <button onClick={() => load(period)} className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                                style={{ background: '#7c3aed' }}>Try Again</button>
                        </div>
                    ) : data ? (
                        <>
                            {/* ── Data quality disclaimer ── */}
                            {data.outcome_data_quality?.is_partial && (data.outcome_data_quality.inferred ?? 0) > 0 && (
                                <div className="flex items-start gap-3 rounded-xl border px-4 py-3"
                                    style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' }}>
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#f59e0b' }} />
                                    <div className="text-sm" style={{ color: t.disclaimerText }}>
                                        <span className="font-semibold" style={{ color: '#f59e0b' }}>Estimated outcome data — </span>
                                        {data.outcome_data_quality.real > 0
                                            ? `${data.outcome_data_quality.real} calls have verified AI outcomes. `
                                            : ''}
                                        {data.outcome_data_quality.inferred} historical calls use <strong>interest level</strong> (high/medium/low) as an outcome proxy, and <strong>speaker count</strong> to estimate authenticity — the original AI classifications were not persisted for these calls.
                                        {data.outcome_data_quality.unclassified > 0 && ` ${data.outcome_data_quality.unclassified} calls could not be classified.`}
                                        {' '}All new calls going forward will have verified AI data.
                                    </div>
                                </div>
                            )}

                            {/* ── KPIs ── */}
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <KpiCard icon={<PhoneCall className="h-5 w-5" />} label="Total Calls" value={s?.total_calls ?? 0}
                                    sub={`${s?.analyzed_calls ?? 0} analyzed`} />
                                <KpiCard icon={<CheckCircle2 className="h-5 w-5" />} label="Interested" value={interested}
                                    sub={outcomeTotal ? `${Math.round((interested / outcomeTotal) * 100)}% of outcomes` : '0%'}
                                    color="#10b981" />
                                <KpiCard icon={<AlertTriangle className="h-5 w-5" />} label="Follow-up Required" value={followUp}
                                    sub={outcomeTotal ? `${Math.round((followUp / outcomeTotal) * 100)}% of outcomes` : '0%'}
                                    color="#f59e0b" />
                                <KpiCard icon={<ShieldAlert className="h-5 w-5" />} label="Fake / Invalid Calls" value={fakeCalls}
                                    sub={`${fakeRate}% of total`} color="#ef4444" />
                            </div>

                            {/* ── Charts Row ── */}
                            <div className="grid gap-4 lg:grid-cols-3">
                                {/* Outcome Donut */}
                                <div className="rounded-2xl border p-5" style={cardBase}>
                                    <p className={sectionHead} style={{ color: t.textStrong }}>Outcome Breakdown
                                        {(data.outcome_data_quality?.inferred ?? 0) > 0 && (
                                            <span className="ml-2 text-[10px] font-medium rounded-full px-2 py-0.5 align-middle"
                                                style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>estimated</span>
                                        )}
                                    </p>
                                    <p className="mt-0.5 text-xs mb-4" style={mutedText}>{outcomeTotal} classified calls</p>
                                    <OutcomeDonutChart interested={interested} not_interested={notInterested} follow_up_required={followUp} height={200} />
                                    {/* Legend stats */}
                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                        {[
                                            { label: 'Interested', val: interested, color: '#10b981' },
                                            { label: 'Not Int.', val: notInterested, color: '#ef4444' },
                                            { label: 'Follow-up', val: followUp, color: '#f59e0b' },
                                        ].map(item => (
                                            <div key={item.label} className="rounded-xl p-2.5 text-center"
                                                style={{ background: `${item.color}12`, border: `1px solid ${item.color}30` }}>
                                                <p className="text-lg font-bold" style={{ color: item.color }}>{item.val}</p>
                                                <p className="text-[10px] font-medium mt-0.5" style={{ color: t.textMuted }}>{item.label}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Authenticity */}
                                <div className="rounded-2xl border p-5" style={cardBase}>
                                    <p className={sectionHead} style={{ color: t.textStrong }}>Call Authenticity</p>
                                    <p className="mt-0.5 text-xs mb-4" style={mutedText}>{realCalls + fakeCalls} analyzed calls</p>
                                    <AuthenticityBarChart real={realCalls} fake={fakeCalls} height={160} />
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <div className="rounded-xl p-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                            <div className="flex items-center gap-1.5 mb-1"><ShieldCheck className="h-4 w-4 text-emerald-400" /><span className="text-xs font-semibold text-emerald-400">Real</span></div>
                                            <p className="text-2xl font-bold" style={{ color: t.textStrong }}>{realCalls}</p>
                                            <p className="text-[10px] mt-0.5" style={mutedText}>{Math.round((realCalls / authTotal) * 100)}%</p>
                                        </div>
                                        <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                            <div className="flex items-center gap-1.5 mb-1"><ShieldAlert className="h-4 w-4 text-red-400" /><span className="text-xs font-semibold text-red-400">Fake</span></div>
                                            <p className="text-2xl font-bold" style={{ color: t.textStrong }}>{fakeCalls}</p>
                                            <p className="text-[10px] mt-0.5" style={mutedText}>{Math.round((fakeCalls / authTotal) * 100)}%</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Avg Duration */}
                                <div className="rounded-2xl border p-5 flex flex-col gap-4" style={cardBase}>
                                    <div>
                                        <p className={sectionHead} style={{ color: t.textStrong }}>Avg Call Duration</p>
                                        <p className="mt-0.5 text-xs" style={mutedText}>Per analyzed call</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Clock className="h-10 w-10 shrink-0" style={{ color: '#8b5cf6' }} />
                                        <p className="text-5xl font-bold" style={{ color: t.textStrong }}>{fmtDuration(s?.avg_duration_seconds ?? 0)}</p>
                                    </div>
                                    <div className="mt-auto space-y-3">
                                        {[
                                            { label: 'Total calls', val: s?.total_calls ?? 0 },
                                            { label: 'Analyzed', val: s?.analyzed_calls ?? 0 },
                                        ].map(item => (
                                            <div key={item.label} className="flex justify-between items-center text-sm">
                                                <span style={mutedText}>{item.label}</span>
                                                <span className="font-semibold" style={{ color: t.textStrong }}>{item.val}</span>
                                            </div>
                                        ))}
                                        {(s?.avg_rating_10 ?? 0) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span style={mutedText}>Avg Rating</span>
                                                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: t.textStrong }}>
                                                    <Star className="h-3.5 w-3.5 fill-current" style={{ color: '#8b5cf6' }} />
                                                    {s!.avg_rating_10.toFixed(1)} / 10
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ── Daily Trend ── */}
                            <div className="rounded-2xl border p-5" style={cardBase}>
                                <div className="flex items-center gap-2 mb-4">
                                    <TrendingUp className="h-4 w-4" style={{ color: '#8b5cf6' }} />
                                    <p className={sectionHead} style={{ color: t.textStrong }}>Daily Call Trend</p>
                                    <span className="ml-auto text-xs" style={mutedText}>Last 30 days</span>
                                </div>
                                {data.daily?.length > 0
                                    ? <DailyTrendChart data={data.daily} height={160} />
                                    : <p className="py-8 text-center text-sm" style={mutedText}>No daily data.</p>}
                            </div>

                            {/* ── Agent / Team Table ── */}
                            <div className="rounded-2xl border" style={cardBase}>
                                <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between border-b"
                                    style={{ borderColor: t.divider }}>
                                    <div className="flex items-center gap-2">
                                        <Trophy className="h-4 w-4" style={{ color: '#8b5cf6' }} />
                                        <p className={sectionHead} style={{ color: t.textStrong }}>{view === 'agents' ? 'Agent Performance' : 'Team Performance'}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {/* Toggle */}
                                        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: t.toggleBorder }}>
                                            {(['agents', 'teams'] as const).map(v => (
                                                <button key={v} onClick={() => setView(v)}
                                                    className="px-4 py-1.5 text-sm font-semibold transition-colors"
                                                    style={view === v
                                                        ? { background: '#7c3aed', color: '#fff' }
                                                        : { background: 'transparent', color: t.toggleInactive }}>
                                                    {v === 'agents' ? 'Agents' : 'Teams'}
                                                </button>
                                            ))}
                                        </div>
                                        {/* Search */}
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.searchIcon }} />
                                            <input value={query} onChange={e => setQuery(e.target.value)}
                                                placeholder={`Search ${view}…`}
                                                className="rounded-xl py-1.5 pl-8 pr-3 text-sm outline-none"
                                                style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.inputColor }} />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-1">
                                    <AgentTeamTable rows={activeRows} mode={view === 'agents' ? 'agent' : 'team'} />
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>
            </div>
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
