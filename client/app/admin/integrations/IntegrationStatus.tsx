'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/AdminShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { API_URL, getToken } from '@/stores/authStore';
import { notifyError, notifySuccess } from '@/lib/toast';
import { CheckCircle2, Loader2, Mail, MessageSquare, RefreshCw, Send, XCircle } from 'lucide-react';

type Kind = 'mail' | 'chat';
type AlertStatus = 'sent' | 'not_sent' | 'failed' | 'skipped' | 'unknown';

interface RecentAlert {
    ticketId: string;
    callAt: string | null;
    alertAt: string | null;
    agentName: string | null;
    teamName: string | null;
    leadId: string | null;
    status: AlertStatus;
    error?: string | null;
}

interface MailStatus {
    configured: boolean;
    provider: string;
    from: string | null;
    fromName: string;
    alertTo: string[];
    summaryTo: string[];
    summaryTime: string;
    columnsMissing: boolean;
    recent: RecentAlert[];
}

interface ChatStatus {
    configured: boolean;
    channel: string;
    excluded: string[];
    columnsMissing: boolean;
    recent: RecentAlert[];
    tests: Array<{ at: string; ok: boolean; error?: string }>;
}

const STATUS_BADGE: Record<AlertStatus, { label: string; variant: 'success' | 'destructive' | 'warning' | 'secondary' }> = {
    sent: { label: 'Delivered', variant: 'success' },
    not_sent: { label: 'Not sent', variant: 'destructive' },
    failed: { label: 'Failed', variant: 'destructive' },
    skipped: { label: 'Skipped (excluded)', variant: 'secondary' },
    unknown: { label: 'Not recorded', variant: 'secondary' }
};

const COPY: Record<Kind, { title: string; description: string; testLabel: string; icon: typeof Mail }> = {
    mail: {
        title: 'Mail Integration',
        description: 'HR email when a presales agent asks a customer for their number, plus the daily summary.',
        testLabel: 'Send test email',
        icon: Mail
    },
    chat: {
        title: 'Chat Integration',
        description: 'Synology Chat post when a presales agent asks a customer for their number.',
        testLabel: 'Send test message',
        icon: MessageSquare
    }
};

function formatIst(iso: string | null | undefined) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
            <dt className="w-44 shrink-0 text-sm text-[var(--semantic-text-muted)]">{label}</dt>
            <dd className="break-words text-sm font-medium text-[var(--semantic-text-primary)]">{value}</dd>
        </div>
    );
}

export function IntegrationStatus({ kind }: { kind: Kind }) {
    const copy = COPY[kind];
    const [data, setData] = useState<MailStatus | ChatStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [testing, setTesting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication required');
            const response = await fetch(`${API_URL}/integrations/${kind}`, { headers: { Authorization: `Bearer ${token}` } });
            if (response.status === 404) {
                throw new Error('The backend has not been redeployed with integrations yet.');
            }
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Failed to load integration status');
            setData(payload);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load integration status');
        } finally {
            setLoading(false);
        }
    }, [kind]);

    useEffect(() => {
        load();
    }, [load]);

    const sendTest = async () => {
        setTesting(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication required');
            const response = await fetch(`${API_URL}/integrations/${kind}/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({})
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Test failed');
            notifySuccess(kind === 'mail' ? `Test email sent to ${(payload.to || []).join(', ')}` : 'Test message posted to Synology Chat');
            if (kind === 'chat') await load();
        } catch (err) {
            notifyError(err instanceof Error ? err.message : 'Test failed');
        } finally {
            setTesting(false);
        }
    };

    const mail = kind === 'mail' ? (data as MailStatus | null) : null;
    const chat = kind === 'chat' ? (data as ChatStatus | null) : null;
    const Icon = copy.icon;

    return (
        <AdminShell activeSection={kind === 'mail' ? 'integrationsMail' : 'integrationsChat'}>
            <main className="px-4 pb-10 pt-6 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-[1160px] space-y-6">
                    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--semantic-text-muted)]">Operations · Integrations</p>
                            <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-[var(--semantic-text-primary)]">
                                <Icon className="h-7 w-7 text-[var(--brand-amber)]" />
                                {copy.title}
                            </h1>
                            <p className="text-sm text-[var(--semantic-text-muted)]">{copy.description}</p>
                        </div>
                        <div className="flex items-center gap-2 self-start">
                            <Button variant="outline" onClick={load} disabled={loading}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                            <Button onClick={sendTest} disabled={testing || !data?.configured}>
                                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                {copy.testLabel}
                            </Button>
                        </div>
                    </header>

                    {error && (
                        <Card>
                            <CardContent className="flex items-center gap-3 py-4 text-sm text-[var(--color-critical-strong)]">
                                <XCircle className="h-5 w-5 shrink-0" />
                                {error}
                            </CardContent>
                        </Card>
                    )}

                    {loading && !data && (
                        <div className="flex items-center gap-2 text-sm text-[var(--semantic-text-muted)]">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                        </div>
                    )}

                    {data && (
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                                <CardTitle className="text-base">Setup</CardTitle>
                                {data.configured ? (
                                    <Badge variant="success"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Connected</Badge>
                                ) : (
                                    <Badge variant="warning">Not set up on the backend</Badge>
                                )}
                            </CardHeader>
                            <CardContent>
                                <dl className="divide-y divide-[var(--semantic-border)]">
                                    {mail && (
                                        <>
                                            <DetailRow label="Service" value={mail.provider === 'hostinger' ? 'Hostinger Email' : mail.provider} />
                                            <DetailRow label="Sent from" value={mail.from ? `${mail.fromName} <${mail.from}>` : 'Not set (MAIL_FROM)'} />
                                            <DetailRow label="Alert emails to" value={mail.alertTo.length ? mail.alertTo.join(', ') : 'Off (NUMBER_ALERT_TO not set)'} />
                                            <DetailRow
                                                label="Daily summary"
                                                value={mail.summaryTo.length ? `${mail.summaryTime} to ${mail.summaryTo.join(', ')}` : 'Off (NUMBER_SUMMARY_TO not set)'}
                                            />
                                        </>
                                    )}
                                    {chat && (
                                        <>
                                            <DetailRow label="Service" value="Synology Chat (incoming webhook)" />
                                            <DetailRow label="Channel" value={chat.channel} />
                                            <DetailRow label="Not posted for" value={chat.excluded.length ? `${chat.excluded.join(', ')} (team or agent name)` : 'Nobody excluded'} />
                                        </>
                                    )}
                                </dl>
                                {!data.configured && (
                                    <p className="mt-3 text-xs text-[var(--semantic-text-muted)]">
                                        {kind === 'mail'
                                            ? 'Set MAIL_API_KEY, MAIL_FROM and NUMBER_ALERT_TO on the Cloud Run backend, then redeploy.'
                                            : 'Set SYNOLOGY_CHAT_WEBHOOK_URL on the Cloud Run backend, then redeploy.'}
                                    </p>
                                )}
                                {kind === 'mail' && data.configured && (
                                    <p className="mt-3 text-xs text-[var(--semantic-text-muted)]">The test email goes to the alert recipients.</p>
                                )}
                                {chat && chat.tests.length > 0 && (
                                    <p className="mt-3 text-xs text-[var(--semantic-text-muted)]">
                                        Last test: {formatIst(chat.tests[0].at)} · {chat.tests[0].ok ? 'delivered' : `failed (${chat.tests[0].error})`}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {data && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Recent number-request alerts</CardTitle>
                                {kind === 'chat' && (
                                    <p className="text-xs text-[var(--semantic-text-muted)]">Chat delivery is recorded from the last backend restart onwards.</p>
                                )}
                            </CardHeader>
                            <CardContent>
                                {data.columnsMissing ? (
                                    <p className="text-sm text-[var(--semantic-text-muted)]">
                                        No history yet: the alert columns have not been added to the tickets table.
                                    </p>
                                ) : data.recent.length === 0 ? (
                                    <p className="text-sm text-[var(--semantic-text-muted)]">No alerts sent yet.</p>
                                ) : (
                                    <div className="-mx-2 overflow-x-auto">
                                        <table className="w-full min-w-[640px] text-left text-sm">
                                            <thead>
                                                <tr className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">
                                                    <th className="px-2 py-2 font-semibold">When (IST)</th>
                                                    <th className="px-2 py-2 font-semibold">Agent</th>
                                                    <th className="px-2 py-2 font-semibold">Team</th>
                                                    <th className="px-2 py-2 font-semibold">Lead ID</th>
                                                    <th className="px-2 py-2 font-semibold">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[var(--semantic-border)]">
                                                {data.recent.map((row) => {
                                                    const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.unknown;
                                                    return (
                                                        <tr key={row.ticketId} className="text-[var(--semantic-text-primary)]">
                                                            <td className="whitespace-nowrap px-2 py-2.5">
                                                                <Link href={`/admin/tickets/${row.ticketId}`} className="hover:underline">
                                                                    {formatIst(row.alertAt)}
                                                                </Link>
                                                            </td>
                                                            <td className="px-2 py-2.5">{row.agentName || '-'}</td>
                                                            <td className="px-2 py-2.5">{row.teamName || '-'}</td>
                                                            <td className="px-2 py-2.5">{row.leadId || '-'}</td>
                                                            <td className="px-2 py-2.5">
                                                                <Badge variant={badge.variant} title={row.error || undefined}>{badge.label}</Badge>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </main>
        </AdminShell>
    );
}
