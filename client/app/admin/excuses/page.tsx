'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { API_URL, getToken } from '@/stores/authStore';
import { notifyError, notifySuccess } from '@/lib/toast';
import {
    Search,
    Check,
    X,
    Loader2,
    Clock3
} from 'lucide-react';

type ExcuseStatusFilter = 'all' | 'pending' | 'resolved' | 'accepted' | 'rejected';

interface ExcuseItem {
    id: string;
    ticket_id: string;
    employee_id: string;
    reason: string;
    reason_details: string | null;
    estimated_time_minutes: number | null;
    estimated_start_time: string | null;
    status: 'pending' | 'accepted' | 'rejected' | string;
    submitted_at: string;
    reviewed_at: string | null;
    admin_notes: string | null;
    ticket: {
        id: string;
        client_name: string;
        client_id: string | null;
        visit_type: string;
        visit_number: number;
        status: string | null;
        created_at: string | null;
    } | null;
    employee: {
        fullname: string;
        email: string;
    } | null;
}

const REASON_LABELS: Record<string, string> = {
    client_unavailable: 'Client unavailable',
    technical_issues: 'Technical issues',
    travel_delay: 'Travel delay',
    meeting_rescheduled: 'Meeting rescheduled',
    emergency: 'Emergency',
    other: 'Other'
};

function ExcusesPageContent() {
    const [excuses, setExcuses] = useState<ExcuseItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState<ExcuseStatusFilter>('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    const fetchExcuses = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication required');

            const params = new URLSearchParams();
            params.set('status', statusFilter);
            if (searchQuery.trim()) params.set('search', searchQuery.trim());

            const response = await fetch(`${API_URL}/excuses?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || 'Failed to load excuses');
            }

            setExcuses(payload.excuses || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load excuses';
            setError(message);
            notifyError(message, { toastId: `excuses-load-${message}` });
            setExcuses([]);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, searchQuery]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            fetchExcuses();
        }, 250);
        return () => clearTimeout(timeout);
    }, [fetchExcuses]);

    const handleDecision = async (excuseId: string, action: 'accept' | 'reject') => {
        setActionLoadingId(`${excuseId}:${action}`);
        setError('');
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication required');

            const response = await fetch(`${API_URL}/excuses/${excuseId}/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({})
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || `Failed to ${action} excuse`);
            }

            notifySuccess(`Excuse ${action === 'accept' ? 'accepted' : 'rejected'} successfully`);
            await fetchExcuses();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Decision failed';
            setError(message);
            notifyError(message);
        } finally {
            setActionLoadingId(null);
        }
    };

    const filteredCountText = useMemo(() => {
        if (loading) return 'Loading excuses...';
        return `${excuses.length} excuse${excuses.length === 1 ? '' : 's'} found`;
    }, [loading, excuses.length]);

    const formatReason = (reason: string) => REASON_LABELS[reason] || reason.replaceAll('_', ' ');

    const getStatusClass = (status: string) => {
        if (status === 'pending') return 'bg-amber-100 text-amber-700';
        if (status === 'accepted') return 'bg-green-100 text-green-700';
        if (status === 'rejected') return 'bg-red-100 text-red-700';
        return 'bg-gray-100 text-gray-700';
    };

    const formatDateTime = (value: string | null) => {
        if (!value) return 'N/A';
        return new Date(value).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatCountdown = (estimatedStart: string | null) => {
        if (!estimatedStart) return null;
        const diffMs = new Date(estimatedStart).getTime() - Date.now();
        const mins = Math.ceil(diffMs / 60000);
        if (mins <= 0) return 'START RECORDING NOW';
        return `START RECORDING IN ${mins} MIN`;
    };

    return (
        <AdminShell activeSection="excuses">
            <main className="p-5 md:p-8">
                <div className="max-w-6xl mx-auto">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900">Excuse Approval Queue</h1>
                            <p className="text-sm text-gray-500">{filteredCountText}</p>
                        </div>

                        <div className="flex w-full items-center gap-3 flex-wrap md:w-auto">
                            <div className="relative w-full md:w-auto">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search tickets or #D656..."
                                    className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 md:w-64"
                                />
                            </div>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as ExcuseStatusFilter)}
                                className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                            >
                                <option value="pending">Pending</option>
                                <option value="resolved">Resolved</option>
                                <option value="accepted">Accepted</option>
                                <option value="rejected">Rejected</option>
                                <option value="all">All</option>
                            </select>
                            <NotificationBell />
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-10 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                        </div>
                    ) : excuses.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">
                            No excuses found for this filter.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {excuses.map((excuse) => {
                                const countdownLabel = formatCountdown(excuse.estimated_start_time);
                                const decisionPending = actionLoadingId?.startsWith(`${excuse.id}:`);

                                return (
                                    <div key={excuse.id} className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6">
                                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                            <div>
                                                <h2 className="text-xl font-semibold text-gray-900">
                                                    {excuse.reason_details?.trim() || formatReason(excuse.reason)}
                                                </h2>
                                                <p className="text-sm text-gray-500 mt-1">
                                                    {formatReason(excuse.reason)} - {excuse.employee?.fullname || 'Unknown employee'} - Ticket #{excuse.ticket_id.slice(0, 8)}
                                                </p>
                                            </div>
                                            <span className={`inline-flex w-fit self-start px-3 py-1 rounded-full text-sm font-medium capitalize md:self-auto ${getStatusClass(excuse.status)}`}>
                                                {excuse.status}
                                            </span>
                                        </div>

                                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                                            <div className="flex items-center gap-2">
                                                <Clock3 className="w-4 h-4 text-gray-400" />
                                                <span>Ticket Created: {formatDateTime(excuse.ticket?.created_at || null)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Clock3 className="w-4 h-4 text-gray-400" />
                                                <span>Rec Start: {formatDateTime(excuse.estimated_start_time)}</span>
                                            </div>
                                        </div>

                                        <div className="mt-2 text-sm text-gray-500">
                                            Client: {excuse.ticket?.client_name || 'Unknown'}{excuse.ticket?.client_id ? ` (${excuse.ticket.client_id})` : ''} - Visit #{excuse.ticket?.visit_number || 1}
                                        </div>

                                        {excuse.admin_notes && (
                                            <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                                                <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Admin Notes</p>
                                                <p className="text-sm text-gray-700">{excuse.admin_notes}</p>
                                            </div>
                                        )}

                                        <div className="mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                            <div>
                                                {countdownLabel && excuse.status === 'pending' && (
                                                    <span className="inline-block px-3 py-2 rounded-lg bg-purple-50 text-purple-700 font-semibold text-sm">
                                                        {countdownLabel}
                                                        {excuse.estimated_time_minutes ? ` (${excuse.estimated_time_minutes} min)` : ''}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {excuse.status === 'pending' ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleDecision(excuse.id, 'reject')}
                                                            disabled={decisionPending}
                                                            className="w-12 h-12 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
                                                        >
                                                            {actionLoadingId === `${excuse.id}:reject` ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-5 h-5" />}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDecision(excuse.id, 'accept')}
                                                            disabled={decisionPending}
                                                            className="w-12 h-12 rounded-xl border border-green-200 bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
                                                        >
                                                            {actionLoadingId === `${excuse.id}:accept` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-5 h-5" />}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span className="text-sm text-gray-500">
                                                        Reviewed {formatDateTime(excuse.reviewed_at)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </AdminShell>
    );
}

export default function AdminExcusesPage() {
    return (
        <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
            <ExcusesPageContent />
        </ProtectedRoute>
    );
}
