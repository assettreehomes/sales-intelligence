'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { API_URL, getToken } from '@/stores/authStore';
import { useBranchStore, withBranch } from '@/stores/branchStore';
import { notifyError, notifySuccess } from '@/lib/toast';
import { Loader2, RefreshCw } from 'lucide-react';

type Period = 'today' | '7d' | '30d';

interface AgentRow {
    agent_id: string;
    name: string;
    team: string | null;
    telecmi_agent_id: string | null;
    calls: number;
    introduced: number;
    skipped: number;
    intro_rate: number;
    last_skipped_ticket_id: string | null;
}

interface UnmatchedName {
    name: string;
    extension: string;
    calls: number;
    last_ticket_id: string | null;
}

interface UnnamedExtension {
    extension: string;
    calls: number;
    last_ticket_id: string | null;
}

interface IntroReport {
    period: Period;
    totals: {
        real_calls_checked: number;
        introduced: number;
        skipped: number;
        intro_rate: number;
        with_agent: number;
        with_agent_rate: number;
        agent_source: Record<string, number>;
    };
    agents: AgentRow[];
    unmatched_names: UnmatchedName[];
    unnamed_extensions: UnnamedExtension[];
}

const PERIODS: { value: Period; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
];

const SOURCE_LABELS: Record<string, string> = {
    selldo: 'From Sell.Do',
    intro_name: 'From the spoken name',
    intro_name_extension: 'Spoken name + extension',
    extension: 'From the extension',
    earlier: 'Set earlier',
    none: 'No agent',
};

function rateVariant(rate: number): 'success' | 'warning' | 'destructive' {
    if (rate >= 80) return 'success';
    if (rate >= 50) return 'warning';
    return 'destructive';
}

function ExtensionEditor({ row, onSaved }: { row: AgentRow; onSaved: () => void }) {
    const [value, setValue] = useState(row.telecmi_agent_id ?? '');
    const [saving, setSaving] = useState(false);
    const changed = value.trim() !== (row.telecmi_agent_id ?? '');

    const save = async () => {
        setSaving(true);
        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/presales/employees/${row.agent_id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ telecmi_agent_id: value.trim() || null }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Failed to save the extension');
            notifySuccess(`Extension saved for ${row.name}`);
            onSaved();
        } catch (error) {
            notifyError(error instanceof Error ? error.message : 'Failed to save the extension');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <Input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="e.g. 5206"
                className="h-9 w-24"
                aria-label={`TeleCMI extension for ${row.name}`}
            />
            {changed && (
                <Button size="sm" variant="secondary" onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
            )}
        </div>
    );
}

export default function PresalesIntroPage() {
    const branch = useBranchStore((s) => s.branch);
    const [period, setPeriod] = useState<Period>('7d');
    const [report, setReport] = useState<IntroReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication required');
            const response = await fetch(`${API_URL}${withBranch(`/analytics/presales-introductions?period=${period}`, branch)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(response.status === 404
                    ? 'This report needs the backend rebuild before it can load.'
                    : data.error || 'Failed to load the report');
            }
            setReport(data as IntroReport);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load the report');
        } finally {
            setLoading(false);
        }
    }, [period, branch]);

    useEffect(() => {
        void load();
    }, [load]);

    const totals = report?.totals;

    return (
        <AdminShell activeSection="presalesIntro">
            <main className="px-4 pb-10 pt-6 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-[1160px] space-y-6">
                    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                            <h1 className="text-3xl font-semibold tracking-tight text-[var(--semantic-text-primary)]">Caller Introductions</h1>
                            <p className="text-sm text-[var(--semantic-text-muted)]">
                                Who says their name at the start of real presales calls, and how each call got its agent.
                                Counts only calls analysed after the intro check was added.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 self-start">
                            {PERIODS.map((option) => (
                                <Button
                                    key={option.value}
                                    size="sm"
                                    variant={period === option.value ? 'default' : 'outline'}
                                    onClick={() => setPeriod(option.value)}
                                >
                                    {option.label}
                                </Button>
                            ))}
                            <Button size="icon" variant="ghost" onClick={() => void load()} aria-label="Refresh">
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                            <NotificationBell />
                        </div>
                    </header>

                    {error && (
                        <Card>
                            <CardContent className="py-6 text-sm text-[var(--semantic-text-secondary)]">{error}</CardContent>
                        </Card>
                    )}

                    {loading && !report && (
                        <div className="flex items-center gap-2 text-sm text-[var(--semantic-text-muted)]">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                        </div>
                    )}

                    {totals && (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Real calls checked</CardTitle></CardHeader>
                                    <CardContent className="text-3xl font-semibold">{totals.real_calls_checked.toLocaleString()}</CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Said their name</CardTitle></CardHeader>
                                    <CardContent className="text-3xl font-semibold">{totals.intro_rate}%</CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Skipped the intro</CardTitle></CardHeader>
                                    <CardContent className="text-3xl font-semibold">{totals.skipped.toLocaleString()}</CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Calls with an agent</CardTitle></CardHeader>
                                    <CardContent className="text-3xl font-semibold">{totals.with_agent_rate}%</CardContent>
                                </Card>
                            </div>

                            <Card>
                                <CardHeader><CardTitle className="text-base">How calls got their agent</CardTitle></CardHeader>
                                <CardContent className="flex flex-wrap gap-2">
                                    {Object.entries(totals.agent_source).map(([key, count]) => (
                                        <Badge key={key} variant={key === 'none' ? 'warning' : 'secondary'}>
                                            {SOURCE_LABELS[key] ?? key}: {count.toLocaleString()}
                                        </Badge>
                                    ))}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Agents, lowest intro rate first</CardTitle>
                                    <p className="text-sm text-[var(--semantic-text-muted)]">
                                        The TeleCMI extension is only used when the agent does not say their name, or when two people share the name.
                                    </p>
                                </CardHeader>
                                <CardContent className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-[var(--semantic-text-muted)]">
                                                <th className="py-2 pr-4 font-medium">Agent</th>
                                                <th className="py-2 pr-4 font-medium">Team</th>
                                                <th className="py-2 pr-4 font-medium">Calls</th>
                                                <th className="py-2 pr-4 font-medium">Said name</th>
                                                <th className="py-2 pr-4 font-medium">Skipped</th>
                                                <th className="py-2 pr-4 font-medium">TeleCMI extension</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {report.agents.length === 0 && (
                                                <tr><td colSpan={6} className="py-4 text-[var(--semantic-text-muted)]">No calls in this period yet.</td></tr>
                                            )}
                                            {report.agents.map((row) => (
                                                <tr key={row.agent_id} className="border-t border-[var(--semantic-border)]">
                                                    <td className="py-2 pr-4 font-medium">{row.name}</td>
                                                    <td className="py-2 pr-4">{row.team ?? '—'}</td>
                                                    <td className="py-2 pr-4">{row.calls}</td>
                                                    <td className="py-2 pr-4"><Badge variant={rateVariant(row.intro_rate)}>{row.intro_rate}%</Badge></td>
                                                    <td className="py-2 pr-4">
                                                        {row.skipped}
                                                        {row.last_skipped_ticket_id && (
                                                            <Link href={`/admin/tickets/${row.last_skipped_ticket_id}`} className="ml-2 text-[var(--semantic-primary)] underline-offset-2 hover:underline">
                                                                latest
                                                            </Link>
                                                        )}
                                                    </td>
                                                    <td className="py-2 pr-4"><ExtensionEditor row={row} onSaved={() => void load()} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </CardContent>
                            </Card>

                            <div className="grid gap-6 lg:grid-cols-2">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Names nobody on the list matches</CardTitle>
                                        <p className="text-sm text-[var(--semantic-text-muted)]">
                                            Add these people on the <Link href="/admin/employees" className="text-[var(--semantic-primary)] hover:underline">Employees</Link> page, or check the spelling of their name there. A name two people share also shows here until one of them has this extension.
                                        </p>
                                    </CardHeader>
                                    <CardContent className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-[var(--semantic-text-muted)]">
                                                    <th className="py-2 pr-4 font-medium">Name said</th>
                                                    <th className="py-2 pr-4 font-medium">Extension</th>
                                                    <th className="py-2 pr-4 font-medium">Calls</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {report.unmatched_names.length === 0 && (
                                                    <tr><td colSpan={3} className="py-4 text-[var(--semantic-text-muted)]">None.</td></tr>
                                                )}
                                                {report.unmatched_names.map((row) => (
                                                    <tr key={`${row.name}-${row.extension}`} className="border-t border-[var(--semantic-border)]">
                                                        <td className="py-2 pr-4 font-medium">
                                                            {row.last_ticket_id ? (
                                                                <Link href={`/admin/tickets/${row.last_ticket_id}`} className="hover:underline">{row.name}</Link>
                                                            ) : row.name}
                                                        </td>
                                                        <td className="py-2 pr-4">{row.extension}</td>
                                                        <td className="py-2 pr-4">{row.calls}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">No name and no agent, by extension</CardTitle>
                                        <p className="text-sm text-[var(--semantic-text-muted)]">
                                            The caller did not introduce themselves and the extension belongs to no one (or to several people). Open the latest call to hear who it is.
                                        </p>
                                    </CardHeader>
                                    <CardContent className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-[var(--semantic-text-muted)]">
                                                    <th className="py-2 pr-4 font-medium">Extension</th>
                                                    <th className="py-2 pr-4 font-medium">Calls</th>
                                                    <th className="py-2 pr-4 font-medium">Latest call</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {report.unnamed_extensions.length === 0 && (
                                                    <tr><td colSpan={3} className="py-4 text-[var(--semantic-text-muted)]">None.</td></tr>
                                                )}
                                                {report.unnamed_extensions.map((row) => (
                                                    <tr key={row.extension} className="border-t border-[var(--semantic-border)]">
                                                        <td className="py-2 pr-4 font-medium">{row.extension}</td>
                                                        <td className="py-2 pr-4">{row.calls}</td>
                                                        <td className="py-2 pr-4">
                                                            {row.last_ticket_id && (
                                                                <Link href={`/admin/tickets/${row.last_ticket_id}`} className="text-[var(--semantic-primary)] hover:underline">open</Link>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </CardContent>
                                </Card>
                            </div>
                        </>
                    )}
                </div>
            </main>
        </AdminShell>
    );
}
