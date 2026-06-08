'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Layers, RefreshCw, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { AdminShell } from '@/components/AdminShell';
import { PageHeader } from '@/components/dashboard/page-header';
import { SectionCard } from '@/components/dashboard/section-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { API_URL } from '@/stores/authStore';

interface QueueStats {
    active: number;
    waiting: number;
    maxConcurrent: number;
    rpm: number;
    maxRpm: number;
}

interface TicketCounts {
    pending: number;
    processing: number;
    retryable: number;
    permanent_failed: number;
}

interface StuckTicket {
    id: string;
    name: string;
    agent: string | null;
    stuck_min: number;
}

interface QueueStatus {
    queue: QueueStats;
    tickets: TicketCounts;
    stuck: StuckTicket[];
    autoRetry: { batchSize: number; intervalMinutes: number };
}

export default function QueuePage() {
    const { session } = useAuth();
    const token = session?.access_token;

    const [status, setStatus] = useState<QueueStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [resetting, setResetting] = useState(false);
    const [resetResult, setResetResult] = useState<{ queueCleared: number; ticketsReset: number } | null>(null);
    const [resettingTicket, setResettingTicket] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/admin/queue/status`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setStatus(await res.json());
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 10_000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const handleReset = async () => {
        if (!token) return;
        if (!confirm('This will drain the waiting queue and reset all stuck processing tickets. Continue?')) return;
        setResetting(true);
        setResetResult(null);
        try {
            const res = await fetch(`${API_URL}/admin/queue/reset`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setResetResult(data);
                fetchStatus();
            }
        } finally {
            setResetting(false);
        }
    };

    const handleResetTicket = async (id: string) => {
        if (!token) return;
        setResettingTicket(id);
        try {
            await fetch(`${API_URL}/admin/queue/ticket/${id}/reset`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
            });
            fetchStatus();
        } finally {
            setResettingTicket(null);
        }
    };

    const rpmPct = status ? Math.round((status.queue.rpm / status.queue.maxRpm) * 100) : 0;
    const concurrentPct = status ? Math.round((status.queue.active / status.queue.maxConcurrent) * 100) : 0;

    return (
        <AdminShell activeSection="queue">
            <PageHeader
                title="Analysis Queue"
                subtitle="Monitor and control the Vertex AI analysis pipeline"
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={fetchStatus}>
                            <RefreshCw className="h-4 w-4 mr-1.5" />
                            Refresh
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleReset}
                            disabled={resetting}
                        >
                            {resetting
                                ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                                : <Trash2 className="h-4 w-4 mr-1.5" />
                            }
                            Clear Queue
                        </Button>
                    </div>
                }
            />

            {resetResult && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Queue cleared: {resetResult.queueCleared} waiting jobs removed, {resetResult.ticketsReset} stuck tickets reset.
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-3 mb-4">
                <SectionCard title="Waiting">
                    <p className={`text-3xl font-bold ${(status?.queue.waiting ?? 0) > 50 ? 'text-red-600' : (status?.queue.waiting ?? 0) > 10 ? 'text-amber-600' : 'text-gray-900'}`}>
                        {loading ? '—' : (status?.queue.waiting ?? 0)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">jobs in queue</p>
                </SectionCard>

                <SectionCard title="Active">
                    <p className="text-3xl font-bold text-gray-900">
                        {loading ? '—' : `${status?.queue.active ?? 0} / ${status?.queue.maxConcurrent ?? 3}`}
                    </p>
                    <Progress value={concurrentPct} className="mt-2 h-1.5" />
                    <p className="text-xs text-gray-400 mt-1">concurrent slots</p>
                </SectionCard>

                <SectionCard title="RPM">
                    <p className={`text-3xl font-bold ${rpmPct >= 100 ? 'text-amber-600' : 'text-gray-900'}`}>
                        {loading ? '—' : `${status?.queue.rpm ?? 0} / ${status?.queue.maxRpm ?? 5}`}
                    </p>
                    <Progress value={rpmPct} className="mt-2 h-1.5" />
                    <p className="text-xs text-gray-400 mt-1">requests per minute</p>
                </SectionCard>
            </div>

            <div className="grid gap-4 md:grid-cols-2 mb-4">
                <SectionCard title="Ticket Status">
                    <div className="space-y-3 mt-1">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Pending</span>
                            <Badge variant="secondary">{status?.tickets.pending ?? 0}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Processing</span>
                            <Badge variant="secondary">{status?.tickets.processing ?? 0}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600 flex items-center gap-1.5">
                                <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                                Retryable failures
                            </span>
                            <Badge variant="warning">{status?.tickets.retryable ?? 0}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600 flex items-center gap-1.5">
                                <XCircle className="h-3.5 w-3.5 text-red-400" />
                                Permanently failed
                            </span>
                            <Badge variant="destructive">{status?.tickets.permanent_failed ?? 0}</Badge>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard title="Auto-Retry Config">
                    <div className="space-y-3 mt-1">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Batch size</span>
                            <Badge variant="outline">{status?.autoRetry.batchSize ?? 3} tickets</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Interval</span>
                            <Badge variant="outline">every {status?.autoRetry.intervalMinutes ?? 20} min</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Vertex RPM limit</span>
                            <Badge variant="outline">{status?.queue.maxRpm ?? 5} / min</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Max concurrent</span>
                            <Badge variant="outline">{status?.queue.maxConcurrent ?? 3} slots</Badge>
                        </div>
                    </div>
                </SectionCard>
            </div>

            <SectionCard title="Stuck in Processing (> 10 min)">
                {!status || status.stuck.length === 0 ? (
                    <div className="flex items-center gap-2 py-6 justify-center text-sm text-gray-400">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        No stuck tickets
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Ticket ID</TableHead>
                                <TableHead>Client</TableHead>
                                <TableHead>Agent</TableHead>
                                <TableHead>Stuck</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {status.stuck.map(t => (
                                <TableRow key={t.id}>
                                    <TableCell className="font-mono text-xs text-gray-500">{t.id.slice(0, 8)}…</TableCell>
                                    <TableCell>{t.name}</TableCell>
                                    <TableCell>{t.agent || '—'}</TableCell>
                                    <TableCell>
                                        <span className={`text-sm font-medium ${t.stuck_min > 30 ? 'text-red-600' : 'text-amber-600'}`}>
                                            {t.stuck_min} min
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleResetTicket(t.id)}
                                            disabled={resettingTicket === t.id}
                                        >
                                            {resettingTicket === t.id
                                                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                                : <AlertTriangle className="h-3.5 w-3.5" />
                                            }
                                            <span className="ml-1.5">Reset</span>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </SectionCard>
        </AdminShell>
    );
}
