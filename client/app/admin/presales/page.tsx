'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { usePresalesStore } from '@/stores/presalesStore';
import {
    AlertCircle,
    Search,
    SlidersHorizontal,
    Clock,
    Calendar,
    Star,
    ChevronLeft,
    ChevronRight,
    Loader2,
    ArrowDownAZ,
    ArrowUpAZ,
    ChevronDown,
    Users,
    Check,
    RefreshCcw,
    PhoneCall,
    PhoneIncoming,
    PhoneMissed,
    BadgeCheck,
    Flame,
    Thermometer,
    Snowflake,
} from 'lucide-react';
import { Avatar } from '@/components/Avatar';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatPhone(num: string | null): string {
    if (!num) return 'Unknown';
    const str = String(num).replace(/\D/g, '');
    if (str.length === 12 && str.startsWith('91')) {
        return `+91 ${str.slice(2, 7)} XXXXX`;
    }
    if (str.length === 10) {
        return `${str.slice(0, 5)} XXXXX`;
    }
    return str.slice(0, -5) + 'XXXXX';
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function StarRating({ rating }: { rating: number | null }) {
    if (rating === null) return <span className="text-slate-400 text-xs">—</span>;
    const stars = Math.round((rating / 10) * 5);
    return (
        <span className="flex items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
                <Star
                    key={i}
                    className={`w-3 h-3 ${i < stars ? 'text-amber-400 fill-amber-400' : 'text-slate-200 dark:text-slate-700'}`}
                />
            ))}
            <span className="ml-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                {(rating / 2).toFixed(1)}
            </span>
        </span>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { label: string; cls: string }> = {
        uploading:       { label: 'Uploading',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
        pending:         { label: 'Pending',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
        processing:      { label: 'Analyzing',  cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
        analyzed:        { label: 'Analyzed',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
        analysis_failed: { label: 'Failed',     cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
    };
    const cfg = map[status] || { label: status, cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}>
            {status === 'processing' && <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />}
            {cfg.label}
        </span>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function PresalesContent() {
    const router = useRouter();
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
    const agentDropdownRef = useRef<HTMLDivElement>(null);
    const [searchInput, setSearchInput] = useState('');

    const {
        tickets,
        employees,
        totalTickets,
        loading,
        syncing,
        filters,
        currentPage,
        ticketsPerPage,
        employeesLoaded,
        fetchTickets,
        fetchEmployees,
        syncTeleCMI,
        setFilter,
        clearFilters,
        setPage,
    } = usePresalesStore();

    // Initial fetch + re-fetch on filter/page change
    useEffect(() => {
        fetchTickets();
    }, [filters, currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!employeesLoaded) fetchEmployees();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Close agent dropdown on outside click
    useEffect(() => {
        function handle(e: MouseEvent) {
            if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
                setAgentDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    // Debounced search
    useEffect(() => {
        const t = setTimeout(() => setFilter('searchQuery', searchInput), 400);
        return () => clearTimeout(t);
    }, [searchInput, setFilter]);

    const totalPages = Math.ceil(totalTickets / ticketsPerPage);

    const statusOptions = [
        { value: 'all', label: 'All Status' },
        { value: 'uploading', label: 'Uploading' },
        { value: 'pending', label: 'Pending' },
        { value: 'processing', label: 'Analyzing' },
        { value: 'analyzed', label: 'Analyzed' },
        { value: 'analysis_failed', label: 'Failed' },
    ];

    const dateOptions = [
        { value: 'today', label: 'Today' },
        { value: '7days', label: 'Last 7 Days' },
        { value: '30days', label: 'Last 30 Days' },
        { value: '60days', label: 'Last 2 Months' },
        { value: 'custom', label: 'Custom Range' },
        { value: 'all', label: 'All Time' },
    ];

    const ratingOptions = [
        { value: 'all', label: 'All Ratings' },
        { value: '4plus', label: '4★ & Up' },
        { value: '3plus', label: '3★ & Up' },
        { value: '2plus', label: '2★ & Up' },
        { value: '1plus', label: '1★ & Up' },
    ];

    const selectedAgent = employees.find(e => e.id === filters.agentFilter);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <AdminShell activeSection="presales">
                <div className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-3">
                        <span className="rounded-lg bg-violet-100 p-2 dark:bg-violet-500/20">
                            <PhoneCall className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                        </span>
                        <div>
                            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Pre-Sales Calls</h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400">TeleCMI recordings · AI-analyzed</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => syncTeleCMI()}
                            disabled={syncing}
                            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60 dark:bg-violet-500 dark:hover:bg-violet-400"
                        >
                            {syncing
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Syncing…</>
                                : <><RefreshCcw className="w-4 h-4" /> Sync TeleCMI</>
                            }
                        </button>
                        <NotificationBell />
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    {/* Search + Filter bar */}
                    <div className="flex flex-wrap gap-3">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search by number or name…"
                                value={searchInput}
                                onChange={e => setSearchInput(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            />
                        </div>

                        <select
                            value={filters.statusFilter}
                            onChange={e => setFilter('statusFilter', e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                            {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>

                        <select
                            value={filters.dateFilter}
                            onChange={e => setFilter('dateFilter', e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                            {dateOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>

                        <select
                            value={filters.ratingFilter}
                            onChange={e => setFilter('ratingFilter', e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                            {ratingOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>

                        {/* Agent dropdown */}
                        <div className="relative" ref={agentDropdownRef}>
                            <button
                                onClick={() => setAgentDropdownOpen(o => !o)}
                                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            >
                                <Users className="w-4 h-4 text-slate-400" />
                                {selectedAgent ? selectedAgent.fullname : 'All Agents'}
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                            {agentDropdownOpen && (
                                <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                    <div className="max-h-52 overflow-y-auto py-1">
                                        {[{ id: 'all', fullname: 'All Agents' }, ...employees].map(emp => (
                                            <button
                                                key={emp.id}
                                                onClick={() => { setFilter('agentFilter', emp.id); setAgentDropdownOpen(false); }}
                                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                                            >
                                                <span className="text-slate-700 dark:text-slate-200">{emp.fullname}</span>
                                                {filters.agentFilter === emp.id && <Check className="w-3.5 h-3.5 text-violet-600" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setFilter('sortOrder', filters.sortOrder === 'desc' ? 'asc' : 'desc')}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                            {filters.sortOrder === 'desc'
                                ? <ArrowDownAZ className="w-4 h-4 text-slate-400" />
                                : <ArrowUpAZ className="w-4 h-4 text-slate-400" />}
                        </button>

                        {(filters.statusFilter !== 'all' || filters.dateFilter !== '30days' || filters.agentFilter !== 'all' || filters.searchQuery) && (
                            <button
                                onClick={() => { clearFilters(); setSearchInput(''); }}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {/* Custom date range */}
                    {filters.dateFilter === 'custom' && (
                        <div className="flex gap-3">
                            <input type="date" value={filters.customDateFrom} onChange={e => setFilter('customDateFrom', e.target.value)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
                            <input type="date" value={filters.customDateTo} onChange={e => setFilter('customDateTo', e.target.value)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
                        </div>
                    )}

                    {/* Stats row */}
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {loading ? 'Loading…' : `${totalTickets} calls found`}
                    </p>

                    {/* Call cards */}
                    {loading ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                        </div>
                    ) : tickets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 dark:border-slate-700 dark:bg-slate-900">
                            <PhoneMissed className="h-12 w-12 text-slate-300 dark:text-slate-600" />
                            <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">No calls found</p>
                            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                Try syncing TeleCMI or adjusting your filters
                            </p>
                            <button
                                onClick={() => syncTeleCMI()}
                                disabled={syncing}
                                className="mt-4 flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 dark:bg-violet-500"
                            >
                                <RefreshCcw className="w-4 h-4" /> Sync Now
                            </button>
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {tickets.map(ticket => (
                                <button
                                    key={ticket.id}
                                    onClick={() => router.push(`/admin/tickets/${ticket.id}?from=presales`)}
                                    className="group text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-violet-500"
                                >
                                    {/* Top row: phone + status */}
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="rounded-lg bg-violet-100 p-1.5 dark:bg-violet-500/20">
                                                <PhoneIncoming className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                                            </span>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                    {formatPhone(ticket.client_id)}
                                                </p>
                                                {ticket.clientname && ticket.clientname !== ticket.client_id && (
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">{ticket.clientname}</p>
                                                )}
                                            </div>
                                        </div>
                                        <StatusBadge status={ticket.status} />
                                    </div>

                                    {/* Score */}
                                    <div className="mb-3">
                                        <StarRating rating={ticket.rating} />
                                    </div>

                                    {/* Meta row: agent + duration + date */}
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                        {ticket.creator_details ? (
                                            <span className="flex items-center gap-1">
                                                <Avatar name={ticket.creator_details.fullname} src={ticket.creator_details.avatar_url} size="sm" />
                                                {ticket.creator_details.fullname}
                                            </span>
                                        ) : (ticket as any).telecmi_user ? (
                                            <span className="flex items-center gap-1 italic text-slate-400 dark:text-slate-500">
                                                Ext. {(ticket as any).telecmi_user.split('_')[0]}
                                            </span>
                                        ) : (
                                            <span className="text-slate-300 dark:text-slate-600 italic">No agent</span>
                                        )}
                                        {(ticket as any).telecmi_direction && (
                                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                                (ticket as any).telecmi_direction === 'inbound'
                                                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                                                    : 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400'
                                            }`}>
                                                {(ticket as any).telecmi_direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'}
                                            </span>
                                        )}
                                        {ticket.durationseconds && (
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {formatDuration(ticket.durationseconds)}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {formatDate(ticket.createdat)}
                                        </span>
                                    </div>

                                    {/* Lead ID / Call ID row */}
                                    {((ticket as any).telecmi_lead_id || (ticket as any).telecmi_cmiuid) && (
                                        <div className="mt-1">
                                            {(ticket as any).telecmi_lead_id ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                                    🔗 Lead #{(ticket as any).telecmi_lead_id}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                                    Call ID: {((ticket as any).telecmi_cmiuid || '').slice(0, 8)}&hellip;
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* TeleCMI badge */}
                                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
                                            <PhoneCall className="w-2.5 h-2.5" /> TeleCMI
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Page {currentPage} of {totalPages} · {totalTickets} calls
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    const p = currentPage <= 3 ? i + 1
                                        : currentPage >= totalPages - 2 ? totalPages - 4 + i
                                        : currentPage - 2 + i;
                                    return (
                                        <button
                                            key={p}
                                            onClick={() => setPage(p)}
                                            className={`h-8 w-8 rounded-lg text-sm font-medium transition ${p === currentPage
                                                ? 'bg-violet-600 text-white dark:bg-violet-500'
                                                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                                                }`}
                                        >
                                            {p}
                                        </button>
                                    );
                                })}
                                <button
                                    onClick={() => setPage(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </AdminShell>
        </div>
    );
}

export default function PresalesPage() {
    return (
        <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
            <PresalesContent />
        </ProtectedRoute>
    );
}
