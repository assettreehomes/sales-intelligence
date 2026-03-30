'use client';

import { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { getToken, API_URL } from '@/stores/authStore';
import {
    UserPlus,
    Loader2,
    Trash2,
    ToggleLeft,
    ToggleRight,
    Eye,
    EyeOff,
    RefreshCw,
    Search,
    X,
    ShieldAlert,
    CheckCircle2,
    AlertCircle,
} from 'lucide-react';

interface Employee {
    id: string;
    fullname: string;
    email: string;
    status: 'active' | 'inactive';
    last_login?: string;
}

function generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function EmployeesPageContent() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Add modal state
    const [showModal, setShowModal] = useState(false);
    const [fullname, setFullname] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [createdEmployee, setCreatedEmployee] = useState<{ name: string; email: string; password: string } | null>(null);

    // Action states
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Toast
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchEmployees = useCallback(async () => {
        setLoading(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/users?role=employee`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) setEmployees(data.users || []);
            else showToast('error', data.error || 'Failed to load employees');
        } catch {
            showToast('error', 'Network error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fullname.trim() || !email.trim() || !password.trim()) return;
        setSubmitting(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    fullname: fullname.trim(),
                    email: email.trim(),
                    password: password.trim()
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setCreatedEmployee({ name: fullname.trim(), email: email.trim(), password: password.trim() });
                setEmployees(prev => [...prev, data.user].sort((a, b) => a.fullname.localeCompare(b.fullname)));
                setFullname(''); setEmail(''); setPassword('');
            } else {
                showToast('error', data.error || 'Failed to create employee');
            }
        } catch {
            showToast('error', 'Network error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleStatus = async (emp: Employee) => {
        const newStatus = emp.status === 'active' ? 'inactive' : 'active';
        setTogglingId(emp.id);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/users/${emp.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status: newStatus })
            });
            const data = await res.json();
            if (res.ok) {
                setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: newStatus } : e));
                showToast('success', `${emp.fullname} is now ${newStatus}`);
            } else {
                showToast('error', data.error || 'Failed to update status');
            }
        } catch {
            showToast('error', 'Network error');
        } finally {
            setTogglingId(null);
        }
    };

    const handleDelete = async (emp: Employee) => {
        setDeletingId(emp.id);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/users/${emp.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setEmployees(prev => prev.filter(e => e.id !== emp.id));
                showToast('success', `${emp.fullname} has been removed`);
            } else {
                showToast('error', data.error || 'Failed to delete employee');
            }
        } catch {
            showToast('error', 'Network error');
        } finally {
            setDeletingId(null);
            setDeleteConfirmId(null);
        }
    };

    const filtered = employees.filter(e =>
        e.fullname.toLowerCase().includes(search.toLowerCase()) ||
        e.email.toLowerCase().includes(search.toLowerCase())
    );

    const activeCount = employees.filter(e => e.status === 'active').length;

    const resetModal = () => {
        setShowModal(false);
        setCreatedEmployee(null);
        setFullname(''); setEmail(''); setPassword('');
        setShowPassword(false);
    };

    return (
        <AdminShell activeSection="employees">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-[9999] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg transition-all ${
                    toast.type === 'success'
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                }`}>
                    {toast.type === 'success'
                        ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                        : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {toast.message}
                </div>
            )}

            {/* Add Employee Modal */}
            {showModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) resetModal(); }}
                >
                    <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
                        {/* ── Success state ── */}
                        {createdEmployee ? (
                            <div className="p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                                    </div>
                                    <h2 className="text-lg font-semibold text-gray-900">Account Created!</h2>
                                </div>
                                <p className="text-sm text-gray-600 mb-4">
                                    Share these credentials with <strong>{createdEmployee.name}</strong>. The password will not be shown again.
                                </p>
                                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-2 text-sm font-mono mb-5">
                                    <div><span className="text-gray-500">Email: </span><span className="font-semibold text-gray-900">{createdEmployee.email}</span></div>
                                    <div><span className="text-gray-500">Password: </span><span className="font-semibold text-purple-700">{createdEmployee.password}</span></div>
                                </div>
                                <button
                                    onClick={resetModal}
                                    className="w-full rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 transition-colors"
                                >
                                    Done
                                </button>
                            </div>
                        ) : (
                            /* ── Form state ── */
                            <form onSubmit={handleCreate} className="p-6 space-y-4">
                                <div className="flex items-center justify-between mb-1">
                                    <h2 className="text-lg font-semibold text-gray-900">Add New Employee</h2>
                                    <button type="button" onClick={resetModal} className="text-gray-400 hover:text-gray-600">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Full Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={fullname}
                                        onChange={e => setFullname(e.target.value)}
                                        placeholder="e.g. Arun Kumar"
                                        required
                                        disabled={submitting}
                                        className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Login Email <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="arun@assettreehomes.com"
                                        required
                                        disabled={submitting}
                                        className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-sm font-medium text-gray-700">
                                            Password <span className="text-red-500">*</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setPassword(generatePassword())}
                                            className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium"
                                        >
                                            <RefreshCw className="w-3 h-3" /> Auto-generate
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            placeholder="Min. 8 characters"
                                            required
                                            minLength={8}
                                            disabled={submitting}
                                            className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 pr-10 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(p => !p)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500">Share this with the employee — they can&apos;t change it themselves yet.</p>
                                </div>

                                <div className="flex gap-3 pt-1">
                                    <button
                                        type="button"
                                        onClick={resetModal}
                                        disabled={submitting}
                                        className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submitting || !fullname.trim() || !email.trim() || !password.trim()}
                                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                        Create Account
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            <main className="p-5 md:p-8">
                <div className="max-w-4xl mx-auto">
                    {/* Header */}
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900">Manage Employees</h1>
                            <p className="text-sm text-gray-500 mt-0.5">
                                {loading ? '...' : `${activeCount} active · ${employees.length} total`}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                id="add-employee-btn"
                                onClick={() => setShowModal(true)}
                                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 transition-colors"
                            >
                                <UserPlus className="w-4 h-4" />
                                Add Employee
                            </button>
                            <NotificationBell />
                        </div>
                    </div>

                    {/* Search */}
                    <div className="relative mb-5">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name or email…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>

                    {/* Table */}
                    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <ShieldAlert className="w-10 h-10 mb-3 opacity-40" />
                                <p className="font-medium">No employees found</p>
                                <p className="text-sm mt-1">
                                    {search ? 'Try a different search term' : 'Click "Add Employee" to get started'}
                                </p>
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        <th className="px-5 py-3 text-left">Name</th>
                                        <th className="px-5 py-3 text-left hidden sm:table-cell">Email</th>
                                        <th className="px-5 py-3 text-left">Status</th>
                                        <th className="px-5 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filtered.map((emp) => (
                                        <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-5 py-3.5 font-medium text-gray-900">
                                                {emp.fullname}
                                                <p className="text-xs text-gray-500 font-normal sm:hidden">{emp.email}</p>
                                            </td>
                                            <td className="px-5 py-3.5 text-gray-600 hidden sm:table-cell">{emp.email}</td>
                                            <td className="px-5 py-3.5">
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                    emp.status === 'active'
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-gray-100 text-gray-500'
                                                }`}>
                                                    {emp.status}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center justify-end gap-2">
                                                    {/* Toggle active/inactive */}
                                                    <button
                                                        onClick={() => handleToggleStatus(emp)}
                                                        disabled={togglingId === emp.id}
                                                        title={emp.status === 'active' ? 'Deactivate' : 'Activate'}
                                                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                                            emp.status === 'active'
                                                                ? 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                                                                : 'bg-green-50 text-green-600 hover:bg-green-100'
                                                        } disabled:opacity-50`}
                                                    >
                                                        {togglingId === emp.id
                                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            : emp.status === 'active'
                                                                ? <ToggleRight className="w-3.5 h-3.5" />
                                                                : <ToggleLeft className="w-3.5 h-3.5" />}
                                                        {emp.status === 'active' ? 'Deactivate' : 'Activate'}
                                                    </button>

                                                    {/* Delete */}
                                                    {deleteConfirmId === emp.id ? (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => handleDelete(emp)}
                                                                disabled={deletingId === emp.id}
                                                                className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                                                            >
                                                                {deletingId === emp.id && <Loader2 className="w-3 h-3 animate-spin" />}
                                                                Confirm
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteConfirmId(null)}
                                                                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setDeleteConfirmId(emp.id)}
                                                            title="Delete employee"
                                                            className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </main>
        </AdminShell>
    );
}

export default function EmployeesPage() {
    return (
        <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
            <EmployeesPageContent />
        </ProtectedRoute>
    );
}
