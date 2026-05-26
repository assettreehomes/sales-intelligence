'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { FilterDropdown } from '@/components/FilterDropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getToken, API_URL } from '@/stores/authStore';
import { notifyError, notifySuccess } from '@/lib/toast';
import { CalendarClock, CheckCircle2, Loader2, MessageSquareText, UserRoundPlus } from 'lucide-react';

type VisitType = 'site_visit' | 'follow_up' | 'closing' | 'inquiry' | 'other';

interface Employee {
    id: string;
    fullname: string;
    email: string;
}

interface CreatedDraft {
    id: string;
    client_id?: string;
    client_name: string;
    visit_number: number;
    assigned_to: string;
}

const visitTypes: { value: VisitType; label: string }[] = [
    { value: 'site_visit', label: 'Site Visit' },
    { value: 'follow_up', label: 'Follow Up' },
    { value: 'closing', label: 'Closing' },
    { value: 'inquiry', label: 'Inquiry' },
    { value: 'other', label: 'Other' },
];

function AssignPageContent() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loadingEmployees, setLoadingEmployees] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successDraft, setSuccessDraft] = useState<CreatedDraft | null>(null);

    const [employeeId, setEmployeeId] = useState('');
    const [clientId, setClientId] = useState('');
    const [clientName, setClientName] = useState('');
    const [visitType, setVisitType] = useState<VisitType>('site_visit');
    const [expectedRecordingTime, setExpectedRecordingTime] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        const fetchEmployees = async () => {
            setLoadingEmployees(true);
            setError('');

            try {
                const token = await getToken();
                if (!token) {
                    throw new Error('Authentication required');
                }

                const response = await fetch(`${API_URL}/users?role=employee`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => ({}));
                    throw new Error(payload.error || 'Failed to load employees');
                }

                const data = await response.json();
                setEmployees(data.users || []);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to load employees';
                setError(message);
                notifyError(message, { toastId: 'assign-load-employees-error' });
            } finally {
                setLoadingEmployees(false);
            }
        };

        void fetchEmployees();
    }, []);

    const handleAssignDraft = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setSuccessDraft(null);

        if (!employeeId || !clientName.trim()) {
            const message = 'Employee and client name are required.';
            setError(message);
            notifyError(message);
            return;
        }

        setSubmitting(true);
        try {
            const token = await getToken();
            if (!token) {
                throw new Error('Authentication required');
            }

            const response = await fetch(`${API_URL}/drafts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    employee_id: employeeId,
                    client_id: clientId.trim() || undefined,
                    client_name: clientName.trim(),
                    visit_type: visitType,
                    expected_recording_time: expectedRecordingTime || undefined,
                    notes: notes.trim() || undefined,
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || 'Failed to assign draft');
            }

            setSuccessDraft(payload.draft || null);
            setClientId('');
            setClientName('');
            setVisitType('site_visit');
            setExpectedRecordingTime('');
            setNotes('');
            notifySuccess('Draft assigned successfully.');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to assign draft';
            setError(message);
            notifyError(message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminShell activeSection="assign">
            <main className="px-4 pb-10 pt-6 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-[980px] space-y-6">
                    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold tracking-tight text-[var(--semantic-text-primary)]">Assign Ticket Draft</h1>
                            <p className="max-w-2xl text-sm text-[var(--semantic-text-muted)]">
                                Create a guided draft for an employee. This ticket appears in their queue so they can start recording with context.
                            </p>
                        </div>
                        <NotificationBell />
                    </header>

                    {error ? (
                        <Card className="border-[var(--semantic-danger)] bg-[var(--semantic-danger-soft)]">
                            <CardContent className="pt-5 text-sm text-[var(--color-critical-strong)]">{error}</CardContent>
                        </Card>
                    ) : null}

                    {successDraft ? (
                        <Card className="border-[color-mix(in_srgb,var(--semantic-success),transparent_58%)] bg-[var(--semantic-success-soft)]">
                            <CardContent className="flex gap-3 pt-5">
                                <CheckCircle2 className="mt-0.5 h-5 w-5 text-[var(--semantic-success)]" />
                                <div className="space-y-1">
                                    <p className="font-semibold text-[var(--semantic-text-primary)]">Draft assigned successfully</p>
                                    <p className="text-sm text-[var(--semantic-text-secondary)]">
                                        Draft #{successDraft.id.slice(0, 8)} · {successDraft.client_name} · Visit #{successDraft.visit_number} · {successDraft.assigned_to}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ) : null}

                    <form onSubmit={handleAssignDraft}>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg">Draft Details</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-2">
                                <section className="space-y-3">
                                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">
                                        <UserRoundPlus className="h-3.5 w-3.5" />
                                        Step 1 · Assignment
                                    </div>
                                    <FilterDropdown
                                        variant="field"
                                        fieldLabel="Assign to employee"
                                        required
                                        value={employeeId}
                                        onChange={setEmployeeId}
                                        disabled={loadingEmployees || submitting}
                                        placeholder={loadingEmployees ? 'Loading employees...' : 'Select an employee'}
                                        options={employees.map((employee) => ({
                                            value: employee.id,
                                            label: `${employee.fullname} (${employee.email})`,
                                        }))}
                                    />
                                </section>

                                <section className="space-y-4">
                                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">
                                        <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">2</Badge>
                                        Client context
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-[var(--semantic-text-secondary)]">
                                                Client ID <span className="text-[var(--semantic-text-muted)]">(optional)</span>
                                            </label>
                                            <Input
                                                value={clientId}
                                                onChange={(event) => setClientId(event.target.value)}
                                                placeholder="e.g. CLT-001"
                                                disabled={submitting}
                                                className="h-11"
                                            />
                                            <p className="text-xs text-[var(--semantic-text-muted)]">Useful for repeat-visit sequencing across the same client.</p>
                                        </div>

                                        <FilterDropdown
                                            variant="field"
                                            fieldLabel="Visit type"
                                            value={visitType}
                                            onChange={(value) => setVisitType(value as VisitType)}
                                            disabled={submitting}
                                            options={visitTypes}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-[var(--semantic-text-secondary)]">
                                            Client name <span className="text-[var(--semantic-danger)]">*</span>
                                        </label>
                                        <Input
                                            value={clientName}
                                            onChange={(event) => setClientName(event.target.value)}
                                            placeholder="Enter client name"
                                            disabled={submitting}
                                            className="h-11"
                                        />
                                    </div>
                                </section>

                                <section className="space-y-4">
                                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">
                                        <CalendarClock className="h-3.5 w-3.5" />
                                        Step 3 · Timing
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-[var(--semantic-text-secondary)]">
                                            Expected recording time <span className="text-[var(--semantic-text-muted)]">(optional)</span>
                                        </label>
                                        <Input
                                            type="datetime-local"
                                            value={expectedRecordingTime}
                                            onChange={(event) => setExpectedRecordingTime(event.target.value)}
                                            disabled={submitting}
                                            className="h-11"
                                        />
                                    </div>
                                </section>

                                <section className="space-y-4">
                                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">
                                        <MessageSquareText className="h-3.5 w-3.5" />
                                        Step 4 · Notes
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-[var(--semantic-text-secondary)]">
                                            Notes <span className="text-[var(--semantic-text-muted)]">(optional)</span>
                                        </label>
                                        <textarea
                                            value={notes}
                                            onChange={(event) => setNotes(event.target.value)}
                                            rows={4}
                                            placeholder="Add assignment context or instructions for the employee"
                                            disabled={submitting}
                                            className="min-h-28 w-full resize-y rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-elevated)] px-3 py-2.5 text-sm text-[var(--semantic-text-primary)] shadow-[var(--elevation-1)] transition-colors placeholder:text-[var(--semantic-text-muted)] hover:border-[var(--semantic-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--semantic-primary),transparent_65%)]"
                                        />
                                    </div>
                                </section>

                                <div className="flex flex-wrap items-center gap-3 pt-2">
                                    <Button type="submit" disabled={submitting || loadingEmployees} className="h-11 px-6">
                                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                        Assign draft
                                    </Button>
                                    <Button asChild type="button" variant="secondary" className="h-11 px-6">
                                        <Link href="/admin/tickets">Back to tickets</Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </form>
                </div>
            </main>
        </AdminShell>
    );
}

export default function AssignPage() {
    return (
        <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
            <AssignPageContent />
        </ProtectedRoute>
    );
}

