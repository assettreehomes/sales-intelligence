'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { FilterDropdown } from '@/components/FilterDropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { API_URL, getToken } from '@/stores/authStore';
import { notifyError, notifySuccess } from '@/lib/toast';
import {
    AlertTriangle,
    Check,
    CheckCircle2,
    Clock3,
    Loader2,
    Search,
    X,
    XCircle,
} from 'lucide-react';

type ExcuseStatusFilter = 'all' | 'pending' | 'resolved' | 'accepted' | 'rejected';

type ExcuseStatus = 'pending' | 'resolved' | 'accepted' | 'rejected' | string;

interface ExcuseItem {
    id: string;
    ticket_id: string;
    employee_id: string;
    reason: string;
    reason_details: string | null;
    estimated_time_minutes: number | null;
    estimated_start_time: string | null;
    status: ExcuseStatus;
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

interface ExcuseSummary {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    resolved: number;
    overdue: number;
}

const REASON_LABELS: Record<string, string> = {
    client_unavailable: 'Client unavailable',
    technical_issues: 'Technical issues',
    travel_delay: 'Travel delay',
    meeting_rescheduled: 'Meeting rescheduled',
    emergency: 'Emergency',
    other: 'Other',
};

function buildSummary(items: ExcuseItem[]): ExcuseSummary {
    return items.reduce<ExcuseSummary>(
        (acc, item) => {
            const normalizedStatus = item.status.toLowerCase();
            if (normalizedStatus === 'pending') acc.pending += 1;
            if (normalizedStatus === 'accepted') acc.accepted += 1;
            if (normalizedStatus === 'rejected') acc.rejected += 1;
            if (normalizedStatus === 'resolved') acc.resolved += 1;

            if (
                normalizedStatus === 'pending' &&
                item.estimated_start_time &&
                new Date(item.estimated_start_time).getTime() < Date.now()
            ) {
                acc.overdue += 1;
            }

            acc.total += 1;
            return acc;
        },
        {
            total: 0,
            pending: 0,
            accepted: 0,
            rejected: 0,
            resolved: 0,
            overdue: 0,
        }
    );
}

function formatDateTime(value: string | null) {
    if (!value) return 'N/A';

    return new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatReason(reason: string) {
    return REASON_LABELS[reason] || reason.replaceAll('_', ' ');
}

function formatCountdown(estimatedStart: string | null) {
    if (!estimatedStart) return null;
    const diffMs = new Date(estimatedStart).getTime() - Date.now();
    const mins = Math.ceil(diffMs / 60000);
    if (mins <= 0) return 'Start recording now';
    return `Starts in ${mins} min`;
}

function getStatusBadgeVariant(status: string): 'warning' | 'success' | 'destructive' | 'secondary' {
    const normalized = status.toLowerCase();
    if (normalized === 'pending') return 'warning';
    if (normalized === 'accepted' || normalized === 'resolved') return 'success';
    if (normalized === 'rejected') return 'destructive';
    return 'secondary';
}

function ExcusesPageContent() {
    const [excuses, setExcuses] = useState<ExcuseItem[]>([]);
    const [summary, setSummary] = useState<ExcuseSummary>({
        total: 0,
        pending: 0,
        accepted: 0,
        rejected: 0,
        resolved: 0,
        overdue: 0,
    });
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

            const listParams = new URLSearchParams();
            listParams.set('status', statusFilter);
            if (searchQuery.trim()) listParams.set('search', searchQuery.trim());

            const summaryParams = new URLSearchParams();
            summaryParams.set('status', 'all');

            const [listResponse, summaryResponse] = await Promise.all([
                fetch(`${API_URL}/excuses?${listParams.toString()}`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_URL}/excuses?${summaryParams.toString()}`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);

            const listPayload = await listResponse.json().catch(() => ({}));
            if (!listResponse.ok) {
                throw new Error(listPayload.error || 'Failed to load excuses');
            }

            const listItems: ExcuseItem[] = listPayload.excuses || [];
            setExcuses(listItems);

            if (summaryResponse.ok) {
                const summaryPayload = await summaryResponse.json().catch(() => ({}));
                setSummary(buildSummary(summaryPayload.excuses || []));
            } else {
                setSummary(buildSummary(listItems));
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load excuses';
            setError(message);
            notifyError(message, { toastId: `excuses-load-${message}` });
            setExcuses([]);
            setSummary({ total: 0, pending: 0, accepted: 0, rejected: 0, resolved: 0, overdue: 0 });
        } finally {
            setLoading(false);
        }
    }, [searchQuery, statusFilter]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            void fetchExcuses();
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
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({}),
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
        if (loading) return 'Loading excuse queue...';
        return `${excuses.length} excuse${excuses.length === 1 ? '' : 's'} in view`;
    }, [excuses.length, loading]);

    return (
        <AdminShell activeSection="excuses">
            <main className="px-4 pb-10 pt-6 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-[1160px] space-y-6">
                    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                            <h1 className="text-3xl font-semibold tracking-tight text-[var(--semantic-text-primary)]">Excuse Approval Queue</h1>
                            <p className="text-sm text-[var(--semantic-text-muted)]">{filteredCountText}</p>
                        </div>
                        <div className="flex items-center gap-2 self-start">
                            <NotificationBell />
                        </div>
                    </header>

                    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Pending</CardTitle>
                            </CardHeader>
                            <CardContent className="flex items-center justify-between pt-0">
                                <p className="text-2xl font-semibold text-[var(--semantic-text-primary)]">{summary.pending}</p>
                                <Clock3 className="h-5 w-5 text-[var(--semantic-warning)]" />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Accepted</CardTitle>
                            </CardHeader>
                            <CardContent className="flex items-center justify-between pt-0">
                                <p className="text-2xl font-semibold text-[var(--semantic-text-primary)]">{summary.accepted}</p>
                                <CheckCircle2 className="h-5 w-5 text-[var(--semantic-success)]" />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Rejected</CardTitle>
                            </CardHeader>
                            <CardContent className="flex items-center justify-between pt-0">
                                <p className="text-2xl font-semibold text-[var(--semantic-text-primary)]">{summary.rejected}</p>
                                <XCircle className="h-5 w-5 text-[var(--semantic-danger)]" />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Resolved</CardTitle>
                            </CardHeader>
                            <CardContent className="flex items-center justify-between pt-0">
                                <p className="text-2xl font-semibold text-[var(--semantic-text-primary)]">{summary.resolved}</p>
                                <CheckCircle2 className="h-5 w-5 text-[var(--semantic-info)]" />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Overdue</CardTitle>
                            </CardHeader>
                            <CardContent className="flex items-center justify-between pt-0">
                                <p className="text-2xl font-semibold text-[var(--semantic-text-primary)]">{summary.overdue}</p>
                                <AlertTriangle className="h-5 w-5 text-[var(--semantic-warning)]" />
                            </CardContent>
                        </Card>
                    </section>

                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                                <div className="relative flex-1">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--semantic-text-muted)]" />
                                    <Input
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                        placeholder="Search by client, employee, or ticket id"
                                        className="h-11 pl-10"
                                    />
                                </div>
                                <FilterDropdown
                                    variant="inline"
                                    label="Status"
                                    value={statusFilter}
                                    onChange={(value) => setStatusFilter(value as ExcuseStatusFilter)}
                                    options={[
                                        { value: 'pending', label: 'Pending' },
                                        { value: 'resolved', label: 'Resolved' },
                                        { value: 'accepted', label: 'Accepted' },
                                        { value: 'rejected', label: 'Rejected' },
                                        { value: 'all', label: 'All statuses' },
                                    ]}
                                    className="w-full lg:w-auto"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {error ? (
                        <Card className="border-[color-mix(in_srgb,var(--semantic-danger),transparent_58%)] bg-[var(--semantic-danger-soft)]">
                            <CardContent className="pt-5 text-sm text-[var(--color-critical-strong)]">{error}</CardContent>
                        </Card>
                    ) : null}

                    {loading ? (
                        <Card>
                            <CardContent className="flex h-48 items-center justify-center gap-2 pt-5 text-[var(--semantic-text-secondary)]">
                                <Loader2 className="h-5 w-5 animate-spin text-[var(--semantic-primary)]" />
                                Syncing excuse queue...
                            </CardContent>
                        </Card>
                    ) : excuses.length === 0 ? (
                        <Card>
                            <CardContent className="flex h-44 flex-col items-center justify-center gap-2 pt-5 text-center">
                                <p className="text-base font-semibold text-[var(--semantic-text-primary)]">No excuses match this filter</p>
                                <p className="text-sm text-[var(--semantic-text-muted)]">Try another status or search term.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <section className="space-y-4">
                            {excuses.map((excuse) => {
                                const countdownLabel = formatCountdown(excuse.estimated_start_time);
                                const decisionPending = actionLoadingId?.startsWith(`${excuse.id}:`);

                                return (
                                    <Card key={excuse.id} className="transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-[var(--semantic-border-strong)] hover:shadow-[var(--elevation-2)]">
                                        <CardContent className="space-y-5 pt-5">
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                <div className="space-y-1.5">
                                                    <h2 className="text-xl font-semibold text-[var(--semantic-text-primary)]">
                                                        {excuse.reason_details?.trim() || formatReason(excuse.reason)}
                                                    </h2>
                                                    <p className="text-sm text-[var(--semantic-text-muted)]">
                                                        {formatReason(excuse.reason)} · {excuse.employee?.fullname || 'Unknown employee'} · Ticket #{excuse.ticket_id.slice(0, 8)}
                                                    </p>
                                                </div>
                                                <Badge variant={getStatusBadgeVariant(excuse.status)} className="w-fit px-3 py-1 text-xs capitalize">
                                                    {excuse.status}
                                                </Badge>
                                            </div>

                                            <div className="grid gap-3 text-sm text-[var(--semantic-text-secondary)] md:grid-cols-3">
                                                <div className="inline-flex items-center gap-2">
                                                    <Clock3 className="h-4 w-4 text-[var(--semantic-text-muted)]" />
                                                    Ticket created: {formatDateTime(excuse.ticket?.created_at || excuse.submitted_at)}
                                                </div>
                                                <div className="inline-flex items-center gap-2">
                                                    <Clock3 className="h-4 w-4 text-[var(--semantic-text-muted)]" />
                                                    Recording start: {formatDateTime(excuse.estimated_start_time)}
                                                </div>
                                                <div className="truncate">Employee: {excuse.employee?.email || 'N/A'}</div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--semantic-text-secondary)]">
                                                <span>
                                                    Client: <span className="font-semibold text-[var(--semantic-text-primary)]">{excuse.ticket?.client_name || 'Unknown'}</span>
                                                    {excuse.ticket?.client_id ? ` (${excuse.ticket.client_id})` : ''}
                                                </span>
                                                <Badge variant="secondary" className="capitalize">
                                                    {excuse.ticket?.visit_type?.replaceAll('_', ' ') || 'visit'} #{excuse.ticket?.visit_number || 1}
                                                </Badge>
                                            </div>

                                            {excuse.admin_notes ? (
                                                <div className="rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-muted)] px-3 py-2.5">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Admin notes</p>
                                                    <p className="mt-1 text-sm text-[var(--semantic-text-secondary)]">{excuse.admin_notes}</p>
                                                </div>
                                            ) : null}

                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    {countdownLabel && excuse.status === 'pending' ? (
                                                        <Badge variant="warning" className="px-3 py-1 text-xs">
                                                            {countdownLabel}
                                                            {excuse.estimated_time_minutes ? ` · ${excuse.estimated_time_minutes} min` : ''}
                                                        </Badge>
                                                    ) : null}
                                                </div>

                                                {excuse.status === 'pending' ? (
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="destructive"
                                                            size="sm"
                                                            onClick={() => handleDecision(excuse.id, 'reject')}
                                                            disabled={decisionPending}
                                                        >
                                                            {actionLoadingId === `${excuse.id}:reject` ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                                                            Reject
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => handleDecision(excuse.id, 'accept')}
                                                            disabled={decisionPending}
                                                            className="border-[color-mix(in_srgb,var(--semantic-success),transparent_55%)] text-[var(--color-success-strong)] hover:bg-[var(--semantic-success-soft)]"
                                                        >
                                                            {actionLoadingId === `${excuse.id}:accept` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                                            Accept
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-[var(--semantic-text-muted)]">Reviewed {formatDateTime(excuse.reviewed_at)}</p>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </section>
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

