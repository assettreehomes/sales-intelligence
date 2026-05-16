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
    Pencil,
} from 'lucide-react';

interface Employee {
    id: string;
    fullname: string;
    email: string;
    role: 'employee' | 'admin' | 'superadmin' | 'intern';
    status: 'active' | 'inactive';
    last_login?: string;
    telecmi_agent_id?: string | null;
}

interface PresalesEmployee {
    id: string;
    full_name: string;
    email: string | null;
    role: 'agent' | 'team_leader';
    team_id: string | null;
    status: 'active' | 'inactive';
    selldo_agent_name?: string | null;
    telecmi_agent_id?: string | null;
}

interface PresalesTeam {
    id: string;
    name: string;
    team_leader_id: string | null;
    status: 'active' | 'inactive';
    team_leader?: PresalesEmployee | null;
    members?: PresalesEmployee[];
}

function generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function EmployeesPageContent() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [activeTab, setActiveTab] = useState<'platform' | 'presales'>('platform');
    const [presalesEmployees, setPresalesEmployees] = useState<PresalesEmployee[]>([]);
    const [presalesTeams, setPresalesTeams] = useState<PresalesTeam[]>([]);
    const [loading, setLoading] = useState(true);
    const [presalesLoading, setPresalesLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [presalesName, setPresalesName] = useState('');
    const [presalesEmail, setPresalesEmail] = useState('');
    const [presalesRole, setPresalesRole] = useState<'agent' | 'team_leader'>('agent');
    const [presalesTeamId, setPresalesTeamId] = useState('');
    const [teamName, setTeamName] = useState('');
    const [teamLeaderId, setTeamLeaderId] = useState('');

    // Add modal state
    const [showModal, setShowModal] = useState(false);
    const [fullname, setFullname] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [newRole, setNewRole] = useState<'employee' | 'admin' | 'superadmin' | 'intern'>('employee');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [createdEmployee, setCreatedEmployee] = useState<{ name: string; email: string; password: string } | null>(null);

    // Action states
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Edit modal state
    const [editEmp, setEditEmp] = useState<Employee | null>(null);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editAgentId, setEditAgentId] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [passwordSaving, setPasswordSaving] = useState(false);

    const openEdit = (emp: Employee) => {
        setEditEmp(emp);
        setEditName(emp.fullname);
        setEditEmail(emp.email);
        setEditAgentId(emp.telecmi_agent_id || '');
        setNewPassword('');
    };
    const closeEdit = () => { setEditEmp(null); setNewPassword(''); };

    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editEmp) return;
        setEditSaving(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/users/${editEmp.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    fullname: editName.trim(),
                    email: editEmail.trim(),
                    telecmi_agent_id: editAgentId.trim() || null
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setEmployees(prev => prev.map(e => e.id === editEmp.id
                    ? { ...e, fullname: data.user.fullname, email: data.user.email }
                    : e));
                showToast('success', 'Employee updated');
                closeEdit();
            } else {
                showToast('error', data.error || 'Failed to update');
            }
        } catch { showToast('error', 'Network error'); }
        finally { setEditSaving(false); }
    };

    const handleResetPassword = async () => {
        if (!editEmp || newPassword.trim().length < 8) return;
        setPasswordSaving(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/users/${editEmp.id}/password`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ password: newPassword.trim() })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast('success', 'Password reset successfully');
                setNewPassword('');
            } else {
                showToast('error', data.error || 'Failed to reset password');
            }
        } catch { showToast('error', 'Network error'); }
        finally { setPasswordSaving(false); }
    };

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
            const res = await fetch(`${API_URL}/users`, {
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

    const fetchPresalesDirectory = useCallback(async () => {
        setPresalesLoading(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/presales/directory`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setPresalesEmployees(data.employees || []);
                setPresalesTeams(data.teams || []);
            } else {
                showToast('error', data.error || 'Failed to load presales directory');
            }
        } catch {
            showToast('error', 'Network error');
        } finally {
            setPresalesLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'presales') void fetchPresalesDirectory();
    }, [activeTab, fetchPresalesDirectory]);

    const handleCreatePresalesEmployee = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!presalesName.trim()) return;
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/presales/employees`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    full_name: presalesName.trim(),
                    email: presalesEmail.trim() || null,
                    role: presalesRole,
                    team_id: presalesRole === 'agent' ? presalesTeamId || null : null
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create presales employee');
            setPresalesName('');
            setPresalesEmail('');
            setPresalesRole('agent');
            setPresalesTeamId('');
            showToast('success', 'Presales employee added');
            await fetchPresalesDirectory();
        } catch (error) {
            showToast('error', error instanceof Error ? error.message : 'Failed to create presales employee');
        }
    };

    const handleCreateTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!teamName.trim()) return;
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/presales/teams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    name: teamName.trim(),
                    team_leader_id: teamLeaderId || null
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create presales team');
            setTeamName('');
            setTeamLeaderId('');
            showToast('success', 'Presales team added');
            await fetchPresalesDirectory();
        } catch (error) {
            showToast('error', error instanceof Error ? error.message : 'Failed to create presales team');
        }
    };

    const assignPresalesAgent = async (employeeId: string, teamId: string) => {
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/presales/employees/${employeeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ team_id: teamId || null })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update team');
            showToast('success', 'Agent team updated');
            await fetchPresalesDirectory();
        } catch (error) {
            showToast('error', error instanceof Error ? error.message : 'Failed to update team');
        }
    };

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
                    password: password.trim(),
                    role: newRole
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
        setNewRole('employee');
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

            {/* ── Edit Employee Modal ── */}
            {editEmp && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
                >
                    <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
                        <div className="p-6 space-y-5">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-gray-900">Edit Employee</h2>
                                <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                            </div>

                            {/* Profile form */}
                            <form onSubmit={handleEdit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                                    <input
                                        type="text" value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        required disabled={editSaving}
                                        className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Login Email</label>
                                    <input
                                        type="email" value={editEmail}
                                        onChange={e => setEditEmail(e.target.value)}
                                        required disabled={editSaving}
                                        className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
                                    />
                                    {editEmail !== editEmp.email && (
                                        <p className="mt-1 text-xs text-amber-600">⚠️ Changing email updates their login. Share the new email with them.</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        TeleCMI Agent ID
                                        <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={editAgentId}
                                        onChange={e => setEditAgentId(e.target.value)}
                                        disabled={editSaving}
                                        placeholder="e.g. 5088_33336999"
                                        className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm font-mono focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
                                    />
                                    <p className="mt-1 text-xs text-gray-400">TeleCMI dashboard → Users → Extension. Format: <code>5088_33336999</code></p>
                                </div>
                                <button
                                    type="submit"
                                    disabled={editSaving || !editName.trim() || !editEmail.trim()}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {editSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Save Changes
                                </button>
                            </form>

                            {/* Divider */}
                            <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div><div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">Reset Password</span></div></div>

                            {/* Password reset */}
                            <div className="space-y-3">
                                <div className="relative">
                                    <input
                                        type={showNewPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="New password (min. 8 characters)"
                                        disabled={passwordSaving}
                                        className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 pr-20 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
                                    />
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                        <button type="button" onClick={() => setNewPassword(generatePassword())} className="p-1 text-gray-400 hover:text-purple-600" title="Generate">
                                            <RefreshCw className="w-3.5 h-3.5" />
                                        </button>
                                        <button type="button" onClick={() => setShowNewPassword(p => !p)} className="p-1 text-gray-400 hover:text-gray-600">
                                            {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleResetPassword}
                                    disabled={passwordSaving || newPassword.trim().length < 8}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {passwordSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Reset Password
                                </button>
                            </div>
                        </div>
                    </div>
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

                                {/* Role selector */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                                    <select
                                        value={newRole}
                                        onChange={e => setNewRole(e.target.value as typeof newRole)}
                                        disabled={submitting}
                                        className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
                                    >
                                        <option value="employee">Employee</option>
                                        <option value="intern">Intern</option>
                                        <option value="admin">Admin</option>
                                        <option value="superadmin">Superadmin</option>
                                    </select>
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
                            {activeTab === 'platform' && (
                                <button
                                    id="add-employee-btn"
                                    onClick={() => setShowModal(true)}
                                    className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 transition-colors"
                                >
                                    <UserPlus className="w-4 h-4" />
                                    Add Employee
                                </button>
                            )}
                            <NotificationBell />
                        </div>
                    </div>

                    <div className="mb-5 inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
                        <button
                            type="button"
                            onClick={() => setActiveTab('platform')}
                            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${activeTab === 'platform' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                            Platform Users
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('presales')}
                            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${activeTab === 'presales' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                            Presales Directory
                        </button>
                    </div>

                    {/* Search */}
                    {activeTab === 'platform' ? (
                    <>
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
                                                <div className="flex items-center gap-2">
                                                    {emp.fullname}
                                                    {emp.role !== 'employee' && (
                                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                            emp.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                                                            emp.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                                                            'bg-gray-100 text-gray-600'
                                                        }`}>{emp.role}</span>
                                                    )}
                                                </div>
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

                                                    {/* Edit */}
                                                    <button
                                                        onClick={() => openEdit(emp)}
                                                        title="Edit employee"
                                                        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-purple-50 hover:text-purple-600 transition-colors"
                                                    >
                                                        <Pencil className="w-4 h-4" />
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
                    </>
                    ) : (
                        <div className="space-y-5">
                            <div className="grid gap-5 lg:grid-cols-2">
                                <form onSubmit={handleCreatePresalesEmployee} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                                    <h2 className="mb-4 text-base font-semibold text-gray-900">Add Presales Employee</h2>
                                    <div className="grid gap-3">
                                        <input
                                            value={presalesName}
                                            onChange={e => setPresalesName(e.target.value)}
                                            placeholder="Full name"
                                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        />
                                        <input
                                            value={presalesEmail}
                                            onChange={e => setPresalesEmail(e.target.value)}
                                            placeholder="Sell.Do email"
                                            type="email"
                                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        />
                                        <select
                                            value={presalesRole}
                                            onChange={e => setPresalesRole(e.target.value as 'agent' | 'team_leader')}
                                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                        >
                                            <option value="agent">Presales Agent</option>
                                            <option value="team_leader">Team Leader</option>
                                        </select>
                                        {presalesRole === 'agent' && (
                                            <select
                                                value={presalesTeamId}
                                                onChange={e => setPresalesTeamId(e.target.value)}
                                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                            >
                                                <option value="">No team yet</option>
                                                {presalesTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                                            </select>
                                        )}
                                        <button type="submit" className="rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700">
                                            Add Presales Employee
                                        </button>
                                    </div>
                                </form>

                                <form onSubmit={handleCreateTeam} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                                    <h2 className="mb-4 text-base font-semibold text-gray-900">Create Presales Team</h2>
                                    <div className="grid gap-3">
                                        <input
                                            value={teamName}
                                            onChange={e => setTeamName(e.target.value)}
                                            placeholder="Team name"
                                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        />
                                        <select
                                            value={teamLeaderId}
                                            onChange={e => setTeamLeaderId(e.target.value)}
                                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                        >
                                            <option value="">No leader yet</option>
                                            {presalesEmployees.filter(e => e.role === 'team_leader').map(leader => (
                                                <option key={leader.id} value={leader.id}>{leader.full_name}</option>
                                            ))}
                                        </select>
                                        <button type="submit" className="rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700">
                                            Create Team
                                        </button>
                                    </div>
                                </form>
                            </div>

                            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                                    <div>
                                        <h2 className="font-semibold text-gray-900">Presales Agents & Team Leaders</h2>
                                        <p className="text-sm text-gray-500">{presalesEmployees.length} people · {presalesTeams.length} teams</p>
                                    </div>
                                    {presalesLoading && <Loader2 className="h-5 w-5 animate-spin text-purple-500" />}
                                </div>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-5 py-3 text-left">Name</th>
                                            <th className="px-5 py-3 text-left">Role</th>
                                            <th className="px-5 py-3 text-left">Team</th>
                                            <th className="px-5 py-3 text-left">Email</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {presalesEmployees.map(emp => (
                                            <tr key={emp.id}>
                                                <td className="px-5 py-3.5 font-medium text-gray-900">{emp.full_name}</td>
                                                <td className="px-5 py-3.5">
                                                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
                                                        {emp.role === 'team_leader' ? 'Team Leader' : 'Agent'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    {emp.role === 'agent' ? (
                                                        <select
                                                            value={emp.team_id || ''}
                                                            onChange={e => assignPresalesAgent(emp.id, e.target.value)}
                                                            className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
                                                        >
                                                            <option value="">No team</option>
                                                            {presalesTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                                                        </select>
                                                    ) : (
                                                        <span className="text-gray-400">Can lead teams</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3.5 text-gray-600">{emp.email || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {presalesEmployees.length === 0 && (
                                    <p className="py-10 text-center text-sm text-gray-500">No presales employees yet.</p>
                                )}
                            </div>
                        </div>
                    )}
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
