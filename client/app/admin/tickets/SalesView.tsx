'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTicketsStore } from '@/stores/ticketsStore';
import {
    AlertCircle,
    Clock,
    Calendar,
    Star,
    ChevronLeft,
    ChevronRight,
    Trash2,
    Loader2,
} from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { TicketHeatmap } from '@/components/TicketHeatmap';

function getOutcomeBadge(outcome?: string | null) {
    const map: Record<string, { label: string; className: string }> = {
        interested: { label: 'Interested', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
        not_interested: { label: 'Not Interested', className: 'bg-red-50 text-red-700 border-red-200' },
        follow_up_required: { label: 'Follow Up', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    };
    const cfg = outcome ? map[outcome] : null;
    if (!cfg) return null;
    return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${cfg.className}`}>{cfg.label}</span>;
}

interface SalesViewProps {
    searchInput: string;
    setSearchInput: (value: string) => void;
}

export default function SalesView({ searchInput, setSearchInput }: SalesViewProps) {
    const router = useRouter();

    const {
        tickets,
        totalTickets,
        loading,
        filters,
        currentPage,
        ticketsPerPage,
        fetchTickets,
        setFilter,
        setPage,
        deleteTicket,
    } = useTicketsStore();
    const [deletingTicketIds, setDeletingTicketIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchTickets();
    }, [filters, currentPage, fetchTickets]);

    useEffect(() => {
        const normalized = searchInput.trim();
        if (normalized === filters.searchQuery) return;
        const timer = setTimeout(() => {
            setFilter('searchQuery', normalized);
        }, 250);
        return () => clearTimeout(timer);
    }, [searchInput, filters.searchQuery, setFilter]);

    const handleDateFilterChange = (value: string) => {
        setFilter('dateFilter', value);
        if (value !== 'custom') {
            setFilter('customDateFrom', '');
            setFilter('customDateTo', '');
        }
    };

    const handleHeatmapDateSelect = (date: string | null) => {
        if (!date) {
            handleDateFilterChange('30days');
            return;
        }
        setFilter('dateFilter', 'custom');
        setFilter('customDateFrom', date);
        setFilter('customDateTo', date);
    };

    const getStatusBadge = (status: string, isTraining: boolean) => {
        const badges = [];
        if (status === 'processing' || status === 'pending') {
            badges.push(
                <span key="live" className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800">
                    LIVE
                </span>
            );
        }
        if (status === 'processing') {
            badges.push(
                <span key="processing" className="px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/40 dark:text-orange-300">
                    PROCESSING
                </span>
            );
        }
        if (status === 'analyzed') {
            badges.push(
                <span key="resolved" className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600">
                    RESOLVED
                </span>
            );
        }
        if (isTraining) {
            badges.push(
                <span key="training" className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200 dark:bg-violet-900/40 dark:text-violet-300">
                    TRAINING
                </span>
            );
        }
        return badges;
    };

    const formatDuration = (seconds: number | null) => {
        if (!seconds) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }) + ' - ' + date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    };

    const renderStars = (rating: number | null) => {
        const score = rating ? Math.round(rating / 2) : 0;
        return (
            <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                        key={star}
                        className={`w-4 h-4 ${star <= score
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-gray-300 dark:text-slate-600'
                            }`}
                    />
                ))}
                {rating && (
                    <span className="ml-1 text-sm text-amber-600 font-medium dark:text-amber-400">
                        {(rating / 2).toFixed(1)}
                    </span>
                )}
            </div>
        );
    };

    const getVisitTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            site_visit: 'Site Visit',
            follow_up: 'Follow Up',
            closing: 'Closing',
            inquiry: 'Inquiry',
            other: 'Other',
        };
        return labels[type] || type;
    };

    const totalPages = Math.ceil(totalTickets / ticketsPerPage);
    const rangeStart = totalTickets === 0 ? 0 : ((currentPage - 1) * ticketsPerPage) + 1;
    const rangeEnd = totalTickets === 0 ? 0 : Math.min(currentPage * ticketsPerPage, totalTickets);

    return (
        <>
                <div className="flex-1 p-5 md:p-7 overflow-auto">
                    <TicketHeatmap
                        onDateSelect={handleHeatmapDateSelect}
                        selectedDate={filters.dateFilter === 'custom' && filters.customDateFrom === filters.customDateTo ? filters.customDateFrom : null}
                    />

                    {loading && tickets.length === 0 ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                        </div>
                    ) : tickets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <AlertCircle className="w-12 h-12 mb-4" />
                            <p className="text-lg font-medium">No tickets found</p>
                            <p className="text-sm">Try adjusting your filters</p>
                        </div>
                    ) : (
                        <div>
                            {loading && (
                                <p className="mb-3 text-sm font-medium text-purple-600">Updating results...</p>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                {tickets.map((ticket) => (
                                    <div
                                        key={ticket.id}
                                        className="cursor-pointer rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
                                        onClick={() => router.push(`/admin/tickets/${ticket.id}`)}
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-gray-500 font-medium">
                                                    {ticket.client_id || 'N/A'}
                                                </span>
                                                {getStatusBadge(ticket.status, ticket.istrainingcall)}
                                                {ticket.is_flagged && (
                                                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                                                        🚩 FLAGGED
                                                    </span>
                                                )}
                                                {getOutcomeBadge(ticket.call_outcome)}
                                            </div>
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (deletingTicketIds.has(ticket.id)) return;
                                                    if (!confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) return;

                                                    setDeletingTicketIds((prev) => {
                                                        const next = new Set(prev);
                                                        next.add(ticket.id);
                                                        return next;
                                                    });

                                                    try {
                                                        await deleteTicket(ticket.id);
                                                    } finally {
                                                        setDeletingTicketIds((prev) => {
                                                            const next = new Set(prev);
                                                            next.delete(ticket.id);
                                                            return next;
                                                        });
                                                    }
                                                }}
                                                disabled={deletingTicketIds.has(ticket.id)}
                                                className="p-1.5 hover:bg-purple-50 rounded-lg group transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                                                title="Delete Ticket"
                                            >
                                                {deletingTicketIds.has(ticket.id) ? (
                                                    <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4 text-purple-500 group-hover:text-purple-700 transition-colors" />
                                                )}
                                            </button>
                                        </div>

                                        {/* Client Info */}
                                        <h3 className="mb-1 text-base font-semibold text-gray-900 dark:text-slate-100">
                                            {ticket.clientname || `Client ${ticket.client_id}`}
                                        </h3>
                                        <p className="text-sm text-gray-500 mb-3">
                                            {getVisitTypeLabel(ticket.visittype)}
                                        </p>

                                        {/* Rating */}
                                        <div className="mb-4">
                                            {renderStars(ticket.rating)}
                                        </div>

                                        <div className="border-t border-gray-100 pt-4">
                                            <div className="flex items-center justify-between mb-3">
                                                {/* Agent Info */}
                                                <div className="flex items-center gap-2">
                                                    <Avatar
                                                        name={ticket.creator_details?.fullname || 'Unknown'}
                                                        src={ticket.creator_details?.avatar_url}
                                                        size="xs"
                                                    />
                                                    <span className="text-xs font-medium text-gray-600 truncate max-w-[100px]">
                                                        {ticket.creator_details?.fullname?.split(' ')[0] || 'Agent'}
                                                    </span>
                                                </div>

                                                {/* Date */}
                                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    <span>{formatDate(ticket.createdat)}</span>
                                                </div>
                                            </div>

                                            {/* Duration & Visit */}
                                            <div className="flex items-center justify-between text-xs text-gray-400 bg-gray-50 rounded-lg px-2 py-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    <span>{formatDuration(ticket.durationseconds)}</span>
                                                </div>
                                                <div className="w-px h-3 bg-gray-200" />
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-gray-400 font-semibold">V</span>
                                                    <span>#{ticket.visitnumber}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <footer className="flex flex-col gap-3 border-t border-gray-200 bg-white px-5 py-4 md:flex-row md:items-center md:justify-between md:px-7 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-sm text-gray-500 dark:text-slate-400">
                        Showing <span className="font-medium">{rangeStart}-{rangeEnd}</span> of <span className="font-medium">{totalTickets}</span> tickets
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1 || totalPages === 0}
                            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-5 h-5 text-gray-600" />
                        </button>

                        {[...Array(Math.min(3, totalPages))].map((_, i) => {
                            const pageNum = i + 1;
                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => setPage(pageNum)}
                                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${currentPage === pageNum
                                        ? 'bg-purple-600 text-white'
                                        : 'hover:bg-gray-100 text-gray-600'
                                        }`}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}

                        {totalPages > 3 && <span className="text-gray-400">...</span>}

                        <button
                            onClick={() => setPage(Math.min(Math.max(totalPages, 1), currentPage + 1))}
                            disabled={totalPages === 0 || currentPage >= totalPages}
                            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-5 h-5 text-gray-600" />
                        </button>
                    </div>
                </footer>
        </>
    );
}
