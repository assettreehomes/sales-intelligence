'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { getToken, API_URL } from '@/stores/authStore';
import {
    Radio,
    BarChart3,
    AlertCircle,
    Users,
    User,
    LogOut,
    Loader2,
    CheckCircle2
} from 'lucide-react';

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

const visitTypes: { value: VisitType; label: string; }[] = [
    { value: 'site_visit', label: 'Site Visit' },
    { value: 'follow_up', label: 'Follow Up' },
    { value: 'closing', label: 'Closing' },
    { value: 'inquiry', label: 'Inquiry' },
    { value: 'other', label: 'Other' }
];

function AssignPageContent() {
    const router = useRouter();
    const { profile, signOut } = useAuth();

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
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => ({}));
                    throw new Error(payload.error || 'Failed to load employees');
                }

                const data = await response.json();
                setEmployees(data.users || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load employees');
            } finally {
                setLoadingEmployees(false);
            }
        };

        fetchEmployees();
    }, []);

    const handleAssignDraft = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessDraft(null);

        if (!employeeId || !clientName.trim()) {
            setError('Employee and client name are required.');
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
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    employee_id: employeeId,
                    client_id: clientId.trim() || undefined,
                    client_name: clientName.trim(),
                    visit_type: visitType,
                    expected_recording_time: expectedRecordingTime || undefined,
                    notes: notes.trim() || undefined
                })
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
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to assign draft');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-gray-50">
            <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
                <div className="p-6">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                            <span className="text-white text-lg">✦</span>
                        </div>
                        <span className="font-bold text-lg text-gray-900">TicketIntel</span>
                    </div>
                </div>

                <nav className="flex-1 px-3">
                    <Link
                        href="/admin/tickets"
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 text-gray-600 hover:bg-gray-100 transition-all"
                    >
                        <Radio className="w-5 h-5" />
                        <span className="font-medium">Tickets</span>
                    </Link>
                    <button
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 text-gray-600 hover:bg-gray-100 transition-all"
                        type="button"
                    >
                        <BarChart3 className="w-5 h-5" />
                        <span className="font-medium">Analytics</span>
                    </button>
                    <Link
                        href="/admin/excuses"
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 text-gray-600 hover:bg-gray-100 transition-all"
                    >
                        <AlertCircle className="w-5 h-5" />
                        <span className="font-medium">Excuses</span>
                    </Link>
                    <Link
                        href="/admin/assign"
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 bg-purple-600 text-white transition-all"
                    >
                        <Users className="w-5 h-5" />
                        <span className="font-medium">Assign</span>
                    </Link>
                </nav>

                <div className="p-4 border-t border-gray-200">
                    <div className="mt-4 flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{profile?.fullname}</p>
                            <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
                        </div>
                    </div>

                    <button
                        onClick={async () => { await signOut(); router.push('/login'); }}
                        className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                    </button>
                </div>
            </aside>

            <main className="flex-1 p-8">
                <div className="max-w-3xl mx-auto">
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">Assign Ticket Draft</h1>
                        <p className="text-gray-500">Create a draft ticket for an employee. It will appear in their employee dashboard for later audio upload.</p>
                    </div>

                    {error && (
                        <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700">
                            {error}
                        </div>
                    )}

                    {successDraft && (
                        <div className="mb-4 p-4 rounded-lg border border-green-200 bg-green-50 text-green-800">
                            <div className="flex items-start gap-2">
                                <CheckCircle2 className="w-5 h-5 mt-0.5" />
                                <div>
                                    <p className="font-semibold">Draft assigned successfully.</p>
                                    <p className="text-sm mt-1">
                                        Draft #{successDraft.id.slice(0, 8)} • {successDraft.client_name} • Visit #{successDraft.visit_number} • {successDraft.assigned_to}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleAssignDraft} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Assign To Employee <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={employeeId}
                                onChange={(e) => setEmployeeId(e.target.value)}
                                disabled={loadingEmployees || submitting}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100 disabled:text-gray-500"
                            >
                                <option value="">
                                    {loadingEmployees ? 'Loading employees...' : 'Select an employee'}
                                </option>
                                {employees.map((employee) => (
                                    <option key={employee.id} value={employee.id}>
                                        {employee.fullname} ({employee.email})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Client ID <span className="text-gray-400">(optional)</span>
                                </label>
                                <input
                                    type="text"
                                    value={clientId}
                                    onChange={(e) => setClientId(e.target.value)}
                                    placeholder="e.g., CLT-001"
                                    disabled={submitting}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100"
                                />
                                <p className="text-xs text-gray-500 mt-1">Recommended for visit sequencing across repeat visits.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Visit Type
                                </label>
                                <select
                                    value={visitType}
                                    onChange={(e) => setVisitType(e.target.value as VisitType)}
                                    disabled={submitting}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100"
                                >
                                    {visitTypes.map((type) => (
                                        <option key={type.value} value={type.value}>
                                            {type.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Client Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder="Enter client name"
                                disabled={submitting}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Expected Recording Time <span className="text-gray-400">(optional)</span>
                            </label>
                            <input
                                type="datetime-local"
                                value={expectedRecordingTime}
                                onChange={(e) => setExpectedRecordingTime(e.target.value)}
                                disabled={submitting}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Notes <span className="text-gray-400">(optional)</span>
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={4}
                                placeholder="Add assignment context or instructions for the employee"
                                disabled={submitting}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100"
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="submit"
                                disabled={submitting || loadingEmployees}
                                className="px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                Assign Draft
                            </button>
                            <Link
                                href="/admin/tickets"
                                className="px-5 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                Back to Tickets
                            </Link>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}

export default function AssignPage() {
    return (
        <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
            <AssignPageContent />
        </ProtectedRoute>
    );
}
