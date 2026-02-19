'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { API_URL, getToken } from '@/stores/authStore';
import { notifyError } from '@/lib/toast';
import {
    Search,
    Star,
    Calendar,
    Headphones,
    Loader2,
    ChevronRight
} from 'lucide-react';

interface TrainingTicket {
    id: string;
    client_id: string | null;
    client_name: string;
    visit_type: string;
    visit_number: number;
    status: string;
    rating_10: number | null;
    rating_5: number | null;
    created_at: string | null;
}

interface TrainingDetail {
    ticket: TrainingTicket;
    analysis: {
        summary?: string | null;
        keymoments?: Array<{
            time?: string;
            timestamp?: string;
            label?: string;
            description?: string;
        }>;
        improvementsuggestions?: string[];
    } | null;
    audio_url: string | null;
}

function formatVisitLabel(value: string) {
    return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderStars(scoreOutOfFive: number | null) {
    const score = scoreOutOfFive ? Math.round(scoreOutOfFive) : 0;
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
                <Star
                    key={star}
                    className={`h-4 w-4 ${star <= score ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
                />
            ))}
            {scoreOutOfFive !== null && (
                <span className="ml-1 text-sm font-medium text-amber-600">
                    {scoreOutOfFive.toFixed(1)}
                </span>
            )}
        </div>
    );
}

function InternDashboardContent() {
    const [tickets, setTickets] = useState<TrainingTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<TrainingDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const fetchTickets = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication required');

            const params = new URLSearchParams({ page: '1', limit: '40' });
            if (searchQuery.trim()) params.set('search', searchQuery.trim());

            const response = await fetch(`${API_URL}/training/high-rated?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Failed to load training tickets');

            setTickets(payload.tickets || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load training tickets';
            setError(message);
            notifyError(message);
            setTickets([]);
        } finally {
            setLoading(false);
        }
    }, [searchQuery]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            void fetchTickets();
        }, 250);
        return () => clearTimeout(timeout);
    }, [fetchTickets]);

    const fetchDetail = useCallback(async (ticketId: string) => {
        setDetailLoading(true);
        setSelectedId(ticketId);
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication required');

            const response = await fetch(`${API_URL}/training/high-rated/${ticketId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Failed to load ticket detail');

            setDetail(payload as TrainingDetail);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load ticket detail';
            notifyError(message);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const resultText = useMemo(() => {
        if (loading) return 'Loading training tickets...';
        return `${tickets.length} high-rated ticket${tickets.length === 1 ? '' : 's'} found`;
    }, [loading, tickets.length]);

    return (
        <AdminShell activeSection="training">
            <main className="min-h-screen p-5 md:p-8">
                <div className="mx-auto max-w-7xl">
                    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900">Intern Training Dashboard</h1>
                            <p className="text-sm text-gray-500">{resultText}</p>
                        </div>

                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search client, ticket, or visit..."
                                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr]">
                        <section className="space-y-4">
                            {loading ? (
                                <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
                                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-purple-600" />
                                </div>
                            ) : tickets.length === 0 ? (
                                <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
                                    No 4+ star tickets found for this search.
                                </div>
                            ) : (
                                tickets.map((ticket) => (
                                    <button
                                        key={ticket.id}
                                        type="button"
                                        onClick={() => { void fetchDetail(ticket.id); }}
                                        className={`w-full rounded-2xl border bg-white p-5 text-left transition-all hover:shadow-md ${selectedId === ticket.id ? 'border-purple-400 shadow-sm' : 'border-gray-200'}`}
                                    >
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold text-gray-500">
                                                    #{ticket.id.slice(0, 4).toUpperCase()}
                                                </p>
                                                <h2 className="mt-1 text-xl font-semibold text-gray-900">{ticket.client_name}</h2>
                                            </div>
                                            <ChevronRight className="h-5 w-5 text-gray-400" />
                                        </div>

                                        <p className="text-sm text-gray-600">
                                            {formatVisitLabel(ticket.visit_type)} - Visit #{ticket.visit_number}
                                            {ticket.client_id ? ` - ${ticket.client_id}` : ''}
                                        </p>

                                        <div className="mt-3 flex items-center justify-between">
                                            {renderStars(ticket.rating_5)}
                                            <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
                                                {ticket.rating_10 ?? 'N/A'}/10
                                            </span>
                                        </div>

                                        <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                                            <Calendar className="h-4 w-4" />
                                            <span>{ticket.created_at ? new Date(ticket.created_at).toLocaleString() : 'N/A'}</span>
                                        </div>
                                    </button>
                                ))
                            )}
                        </section>

                        <section className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
                            {detailLoading ? (
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading selected ticket...
                                </div>
                            ) : !detail ? (
                                <p className="text-sm text-gray-500">
                                    Select a ticket to view training summary, moments, and audio.
                                </p>
                            ) : (
                                <div className="space-y-5">
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-gray-500">Selected Ticket</p>
                                        <h3 className="text-xl font-semibold text-gray-900">
                                            {detail.ticket.client_name} #{detail.ticket.id.slice(0, 4).toUpperCase()}
                                        </h3>
                                        <div className="mt-2">{renderStars(detail.ticket.rating_5)}</div>
                                    </div>

                                    {detail.audio_url && (
                                        <div>
                                            <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Audio Playback</p>
                                            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                                <audio controls className="w-full">
                                                    <source src={detail.audio_url} />
                                                </audio>
                                                <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                                                    <Headphones className="h-3.5 w-3.5" />
                                                    Listen and observe conversation quality.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Summary</p>
                                        <p className="text-sm leading-6 text-gray-700">
                                            {detail.analysis?.summary || 'No summary available.'}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Key Moments</p>
                                        <div className="space-y-2">
                                            {(detail.analysis?.keymoments || []).slice(0, 6).map((moment, index) => (
                                                <div key={`${moment.time || moment.timestamp || index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                                    <p className="text-sm font-semibold text-gray-800">
                                                        [{moment.time || moment.timestamp || '00:00'}] {moment.label || 'Moment'}
                                                    </p>
                                                    {moment.description && (
                                                        <p className="mt-1 text-sm text-gray-600">{moment.description}</p>
                                                    )}
                                                </div>
                                            ))}
                                            {(detail.analysis?.keymoments || []).length === 0 && (
                                                <p className="text-sm text-gray-500">No key moments captured.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </main>
        </AdminShell>
    );
}

export default function InternDashboardPage() {
    return (
        <ProtectedRoute allowedRoles={['intern', 'employee', 'admin', 'superadmin']}>
            <InternDashboardContent />
        </ProtectedRoute>
    );
}
