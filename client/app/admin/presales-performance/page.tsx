'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { API_URL, getToken } from '@/stores/authStore';
import { BarChart3, Clock, Loader2, PhoneCall, Search, ShieldCheck, Users } from 'lucide-react';

type OutcomeCounts = {
    interested: number;
    not_interested: number;
    follow_up_required: number;
};

type AuthenticityCounts = {
    real: number;
    fake: number;
};

type PerformanceBucket = {
    id: string;
    label: string;
    email?: string | null;
    total_calls: number;
    analyzed_calls: number;
    avg_duration_seconds: number;
    avg_rating_10: number;
    outcome_counts: OutcomeCounts;
    authenticity_counts: AuthenticityCounts;
    team_leader?: { full_name: string; email?: string | null } | null;
};

type PresalesPerformance = {
    period: string;
    summary: PerformanceBucket;
    agents: PerformanceBucket[];
    teams: PerformanceBucket[];
    daily: { date: string; count: number }[];
    weekly: { week: string; count: number }[];
};

function fmtDuration(seconds: number) {
    if (!seconds) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m ? `${m}m ${s}s` : `${s}s`;
}

function OutcomeStrip({ counts }: { counts: OutcomeCounts }) {
    const total = (counts.interested || 0) + (counts.not_interested || 0) + (counts.follow_up_required || 0);
    const pct = (value: number) => total ? Math.max(4, (value / total) * 100) : 0;
    return (
        <div className="min-w-72 space-y-2">
            <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                <span className="bg-emerald-500" style={{ width: `${pct(counts.interested || 0)}%` }} />
                <span className="bg-red-400" style={{ width: `${pct(counts.not_interested || 0)}%` }} />
                <span className="bg-amber-400" style={{ width: `${pct(counts.follow_up_required || 0)}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
                <span className="rounded-lg bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">Int {counts.interested || 0}</span>
                <span className="rounded-lg bg-red-50 px-2 py-1 font-semibold text-red-700">Not {counts.not_interested || 0}</span>
                <span className="rounded-lg bg-amber-50 px-2 py-1 font-semibold text-amber-700">Follow {counts.follow_up_required || 0}</span>
            </div>
        </div>
    );
}

function BucketTable({ title, rows, mode }: { title: string; rows: PerformanceBucket[]; mode: 'agent' | 'team' }) {
    return (
        <div>
            <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                    <thead>
                        <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="py-3 pr-4">{mode === 'agent' ? 'Agent' : 'Team'}</th>
                            <th className="py-3 pr-4">Calls</th>
                            <th className="py-3 pr-4">Avg Duration</th>
                            <th className="py-3 pr-4">Rating</th>
                            <th className="py-3 pr-4">Outcomes</th>
                            <th className="py-3 pr-4">Fake</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map(row => (
                            <tr key={row.id}>
                                <td className="py-3 pr-4">
                                    <p className="font-semibold text-slate-900">{row.label}</p>
                                    <p className="text-xs text-slate-500">
                                        {mode === 'agent' ? row.email || 'No email' : row.team_leader?.full_name ? `Leader: ${row.team_leader.full_name}` : 'No leader mapped'}
                                    </p>
                                </td>
                                <td className="py-3 pr-4 font-medium text-slate-700">{row.total_calls}</td>
                                <td className="py-3 pr-4 text-slate-700">{fmtDuration(row.avg_duration_seconds)}</td>
                                <td className="py-3 pr-4 text-slate-700">{row.avg_rating_10 ? row.avg_rating_10.toFixed(1) : '-'}</td>
                                <td className="py-3 pr-4"><OutcomeStrip counts={row.outcome_counts} /></td>
                                <td className="py-3 pr-4">
                                    <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                                        {row.authenticity_counts.fake || 0}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {rows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No presales calls in this period.</p>}
        </div>
    );
}

function PresalesPerformanceContent() {
    const [period, setPeriod] = useState('30d');
    const [data, setData] = useState<PresalesPerformance | null>(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'agents' | 'teams'>('agents');
    const [query, setQuery] = useState('');
    const [sortBy, setSortBy] = useState<'calls' | 'interested' | 'not_interested' | 'fake'>('calls');

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const token = await getToken();
                const res = await fetch(`${API_URL}/analytics/presales-performance?period=${period}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to load presales performance');
                if (!cancelled) setData(json);
            } catch (error) {
                console.error(error);
                if (!cancelled) setData(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [period]);

    const maxDaily = useMemo(() => Math.max(...(data?.daily || []).map(d => d.count), 1), [data]);
    const activeRows = useMemo(() => {
        const rows = view === 'agents' ? data?.agents || [] : data?.teams || [];
        const q = query.trim().toLowerCase();
        return rows
            .filter(row => !q || row.label.toLowerCase().includes(q) || String(row.email || '').toLowerCase().includes(q))
            .sort((a, b) => {
                if (sortBy === 'interested') return (b.outcome_counts.interested || 0) - (a.outcome_counts.interested || 0);
                if (sortBy === 'not_interested') return (b.outcome_counts.not_interested || 0) - (a.outcome_counts.not_interested || 0);
                if (sortBy === 'fake') return (b.authenticity_counts.fake || 0) - (a.authenticity_counts.fake || 0);
                return b.total_calls - a.total_calls;
            });
    }, [data, query, sortBy, view]);
    const outcomeTotal = data
        ? (data.summary.outcome_counts.interested || 0) + (data.summary.outcome_counts.not_interested || 0) + (data.summary.outcome_counts.follow_up_required || 0)
        : 0;

    return (
        <AdminShell activeSection="presalesPerformance">
            <main className="min-h-screen bg-slate-50 p-5 md:p-8">
                <div className="mx-auto max-w-7xl space-y-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-900">Presales Performance</h1>
                            <p className="text-sm text-slate-500">Agent, team, outcome, duration, and fake-call analytics for TeleCMI calls.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                                <option value="7d">Last 7 days</option>
                                <option value="30d">Last 30 days</option>
                                <option value="90d">Last 90 days</option>
                                <option value="all">All time</option>
                            </select>
                            <NotificationBell />
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex min-h-96 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                            <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
                        </div>
                    ) : data ? (
                        <>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <PhoneCall className="mb-3 h-5 w-5 text-violet-600" />
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Calls</p>
                                    <p className="mt-1 text-3xl font-semibold text-slate-900">{data.summary.total_calls}</p>
                                </article>
                                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <BarChart3 className="mb-3 h-5 w-5 text-emerald-600" />
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Interested</p>
                                    <p className="mt-1 text-3xl font-semibold text-slate-900">{data.summary.outcome_counts.interested || 0}</p>
                                </article>
                                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <ShieldCheck className="mb-3 h-5 w-5 text-red-600" />
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fake Calls</p>
                                    <p className="mt-1 text-3xl font-semibold text-slate-900">{data.summary.authenticity_counts.fake || 0}</p>
                                </article>
                                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <Clock className="mb-3 h-5 w-5 text-amber-600" />
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg Duration</p>
                                    <p className="mt-1 text-3xl font-semibold text-slate-900">{fmtDuration(data.summary.avg_duration_seconds)}</p>
                                </article>
                            </div>

                            <section className="grid gap-3 lg:grid-cols-[1fr_420px]">
                                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                        <div>
                                            <h2 className="text-base font-semibold text-slate-900">Outcome Mix</h2>
                                            <p className="text-sm text-slate-500">{outcomeTotal} classified calls in this period</p>
                                        </div>
                                    </div>
                                    <OutcomeStrip counts={data.summary.outcome_counts} />
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <h2 className="text-base font-semibold text-slate-900">Authenticity</h2>
                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                        <div className="rounded-xl bg-emerald-50 p-4">
                                            <p className="text-xs font-semibold uppercase text-emerald-700">Real</p>
                                            <p className="mt-1 text-3xl font-semibold text-emerald-900">{data.summary.authenticity_counts.real || 0}</p>
                                        </div>
                                        <div className="rounded-xl bg-red-50 p-4">
                                            <p className="text-xs font-semibold uppercase text-red-700">Fake</p>
                                            <p className="mt-1 text-3xl font-semibold text-red-900">{data.summary.authenticity_counts.fake || 0}</p>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="mb-4 flex items-center gap-2">
                                    <Users className="h-5 w-5 text-violet-600" />
                                    <h2 className="text-base font-semibold text-slate-900">Daily Call Trend</h2>
                                </div>
                                <div className="flex h-32 items-end gap-1">
                                    {(data.daily || []).slice(-30).map(day => (
                                        <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                                            <div
                                                className="w-full rounded-t bg-violet-500"
                                                style={{ height: `${Math.max(8, (day.count / maxDaily) * 112)}px` }}
                                                title={`${day.date}: ${day.count} calls`}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                    <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1">
                                        <button onClick={() => setView('agents')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === 'agents' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}>Agents</button>
                                        <button onClick={() => setView('teams')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === 'teams' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}>Teams</button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agent or team" className="rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm" />
                                        </div>
                                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                                            <option value="calls">Sort by calls</option>
                                            <option value="interested">Sort by interested</option>
                                            <option value="not_interested">Sort by not interested</option>
                                            <option value="fake">Sort by fake</option>
                                        </select>
                                    </div>
                                </div>
                                <BucketTable title={view === 'agents' ? 'Agent-wise Reports' : 'Team-based Reports'} rows={activeRows} mode={view === 'agents' ? 'agent' : 'team'} />
                            </section>
                        </>
                    ) : (
                        <div className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center text-sm font-medium text-red-700">
                            Unable to load presales performance.
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
