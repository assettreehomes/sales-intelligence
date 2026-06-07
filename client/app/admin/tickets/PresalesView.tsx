'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePresalesStore } from '@/stores/presalesStore';
import {
    Clock,
    Calendar,
    Star,
    ChevronLeft,
    ChevronRight,
    Loader2,
    RefreshCcw,
    Users,
    PhoneCall,
    PhoneIncoming,
    PhoneMissed,
    BadgeCheck,
} from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { TicketHeatmap } from '@/components/TicketHeatmap';

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

/** Returns a safe display label for a ticket — always shows masked number + lead/agent info */
function clientLabel(ticket: {
    clientname?: string | null;
    client_id?: string | null;
    telecmi_lead_id?: string | null;
    telecmi_user?: string | null;
}): { primary: string; sub?: string } {
    const maskedPhone = formatPhone(ticket.client_id ?? null);

    const leadId = ticket.telecmi_lead_id;
    const ext = ticket.telecmi_user ? ticket.telecmi_user.split('_')[0] : null;

    if (leadId) {
        return { primary: `Lead #${leadId}`, sub: maskedPhone };
    }

    const sub = ext ? `Ext. ${ext}` : undefined;
    const primary = maskedPhone;

    return { primary, sub };
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

function labelForOutcome(value?: string | null) {
    if (value === 'interested') return 'Interested';
    if (value === 'not_interested') return 'Not Interested';
    if (value === 'follow_up_required') return 'Follow Up';
    return null;
}

function outcomeBadgeClass(value?: string | null) {
    if (value === 'interested') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
    if (value === 'not_interested') return 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300';
    if (value === 'follow_up_required') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
    return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300';
}

function getPersonName(person?: { full_name?: string; fullname?: string } | null) {
    return person?.full_name || person?.fullname || 'Unknown';
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface PresalesViewProps {
    searchInput: string;
    setSearchInput: (value: string) => void;
}

export default function PresalesView({ searchInput, setSearchInput }: PresalesViewProps) {
    const router = useRouter();

    const {
        tickets,
        totalTickets,
        loading,
        syncing,
        filters,
        currentPage,
        ticketsPerPage,
        fetchTickets,
        syncTeleCMI,
        setFilter,
        setPage,
    } = usePresalesStore();

    useEffect(() => {
        fetchTickets();
    }, [filters, currentPage, fetchTickets]);

    useEffect(() => {
        const normalized = searchInput.trim();
        if (normalized === filters.searchQuery) return;
        const t = setTimeout(() => setFilter('searchQuery', normalized), 400);
        return () => clearTimeout(t);
    }, [searchInput, filters.searchQuery, setFilter]);

    const totalPages = Math.ceil(totalTickets / ticketsPerPage);

    return (
        <>
            <div className="flex-1 p-5 md:p-7 overflow-auto">
                    <TicketHeatmap
                        source="telecmi"
                        title="Daily Ticket Intensity Heatmap"
                        description="Daily TeleCMI call volume. Select a day to filter pre-sales calls."
                        selectedDate={filters.dateFilter === 'custom' && filters.customDateFrom === filters.customDateTo ? filters.customDateFrom : null}
                        onDateSelect={(date) => {
                            if (!date) {
                                setFilter('dateFilter', 'all');
                                setFilter('customDateFrom', '');
                                setFilter('customDateTo', '');
                                return;
                            }
                            setFilter('dateFilter', 'custom');
                            setFilter('customDateFrom', date);
                            setFilter('customDateTo', date);
                        }}
                    />

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
                                    {/* Top row: client label + status */}
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="rounded-lg bg-violet-100 p-1.5 dark:bg-violet-500/20">
                                                <PhoneIncoming className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                                            </span>
                                            <div>
                                                {(() => {
                                                    const lbl = clientLabel(ticket);
                                                    return (
                                                        <>
                                                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                                {lbl.primary}
                                                            </p>
                                                            {lbl.sub && (
                                                                <p className="text-xs text-slate-500 dark:text-slate-400">{lbl.sub}</p>
                                                            )}
                                                        </>
                                                    );
                                                })()}
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
                                        ) : ticket.telecmi_user ? (
                                            <span className="flex items-center gap-1 italic text-slate-400 dark:text-slate-500">
                                                Ext. {ticket.telecmi_user.split('_')[0]}
                                            </span>
                                        ) : (
                                            <span className="text-slate-300 dark:text-slate-600 italic">No agent</span>
                                        )}
                                        {ticket.selldo_team_name && (
                                            <span className="flex items-center gap-1">
                                                <Users className="w-3 h-3" />
                                                {ticket.selldo_team_name}
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
                                    {(ticket.telecmi_lead_id || ticket.telecmi_cmiuid) && (
                                        <div className="mt-1">
                                            {ticket.telecmi_lead_id ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                                    🔗 {formatPhone(ticket.client_id)}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                                    Call ID: {(ticket.telecmi_cmiuid || '').slice(0, 8)}&hellip;
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {ticket.call_outcome && (
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${outcomeBadgeClass(ticket.call_outcome)}`}>
                                                Outcome: {labelForOutcome(ticket.call_outcome)}
                                            </span>
                                        )}
                                        {ticket.call_authenticity && (
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                                ticket.call_authenticity === 'fake'
                                                    ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                                                    : ticket.call_authenticity === 'real'
                                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                                                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                                            }`}>
                                                Authenticity: {ticket.call_authenticity === 'fake' ? 'Fake' : 'Real'}
                                            </span>
                                        )}
                                        {ticket.asked_mobile_number && (
                                            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-red-600 text-white dark:bg-red-500">
                                                🚨 Lead Theft Risk
                                            </span>
                                        )}
                                    </div>

                                    {/* TeleCMI badge */}
                                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
                                                <PhoneCall className="w-2.5 h-2.5" /> TeleCMI
                                            </span>
                                            {ticket.selldo_enriched_at && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                                    <BadgeCheck className="w-2.5 h-2.5" /> Sell.Do
                                                </span>
                                            )}
                                        </div>
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
        </>
    );
}
