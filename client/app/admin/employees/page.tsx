'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { FilterDropdown } from '@/components/FilterDropdown';
import { SegmentedToggle } from '@/components/SegmentedToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { getToken, API_URL } from '@/stores/authStore';
import {
    AlertCircle,
    CheckCircle2,
    Eye,
    EyeOff,
    Loader2,
    Pencil,
    RefreshCw,
    Search,
    ShieldAlert,
    ToggleLeft,
    ToggleRight,
    Trash2,
    UserPlus,
    Users,
    X,
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
    const [presalesSearch, setPresalesSearch] = useState('');
    const [presalesName, setPresalesName] = useState('');
    const [presalesEmail, setPresalesEmail] = useState('');
    const [presalesRole, setPresalesRole] = useState<'agent' | 'team_leader'>('agent');
    const [presalesTeamId, setPresalesTeamId] = useState('');
    const [teamName, setTeamName] = useState('');
    const [teamLeaderId, setTeamLeaderId] = useState('');

    const [showModal, setShowModal] = useState(false);
    const [fullname, setFullname] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [newRole, setNewRole] = useState<'employee' | 'admin' | 'superadmin' | 'intern'>('employee');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [createdEmployee, setCreatedEmployee] = useState<{ name: string; email: string; password: string } | null>(null);

    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const [editEmp, setEditEmp] = useState<Employee | null>(null);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editAgentId, setEditAgentId] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [passwordSaving, setPasswordSaving] = useState(false);

    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const showToast = useCallback((type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    }, []);

    const fetchEmployees = useCallback(async () => {
        setLoading(true);
        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/users`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json();
            if (response.ok) {
                setEmployees(data.users || []);
            } else {
                showToast('error', data.error || 'Failed to load employees');
            }
        } catch {
            showToast('error', 'Network error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    const fetchPresalesDirectory = useCallback(async () => {
        setPresalesLoading(true);
        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/presales/directory`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json();
            if (response.ok) {
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
    }, [showToast]);

    useEffect(() => {
        void fetchEmployees();
    }, [fetchEmployees]);

    useEffect(() => {
        if (activeTab === 'presales') {
            void fetchPresalesDirectory();
        }
    }, [activeTab, fetchPresalesDirectory]);

    const openEdit = (employee: Employee) => {
        setEditEmp(employee);
        setEditName(employee.fullname);
        setEditEmail(employee.email);
        setEditAgentId(employee.telecmi_agent_id || '');
        setNewPassword('');
    };

    const closeEdit = () => {
        setEditEmp(null);
        setNewPassword('');
    };

    const handleEdit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!editEmp) return;

        setEditSaving(true);
        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/users/${editEmp.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    fullname: editName.trim(),
                    email: editEmail.trim(),
                    telecmi_agent_id: editAgentId.trim() || null,
                }),
            });
            const data = await response.json();
            if (response.ok && data.success) {
                setEmployees((previous) =>
                    previous.map((employee) =>
                        employee.id === editEmp.id
                            ? {
                                  ...employee,
                                  fullname: data.user.fullname,
                                  email: data.user.email,
                                  telecmi_agent_id: data.user.telecmi_agent_id || null,
                              }
                            : employee
                    )
                );
                showToast('success', 'Employee updated');
                closeEdit();
            } else {
                showToast('error', data.error || 'Failed to update employee');
            }
        } catch {
            showToast('error', 'Network error');
        } finally {
            setEditSaving(false);
        }
    };

    const handleResetPassword = async () => {
        if (!editEmp || newPassword.trim().length < 8) return;

        setPasswordSaving(true);
        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/users/${editEmp.id}/password`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ password: newPassword.trim() }),
            });
            const data = await response.json();
            if (response.ok && data.success) {
                showToast('success', 'Password reset successfully');
                setNewPassword('');
            } else {
                showToast('error', data.error || 'Failed to reset password');
            }
        } catch {
            showToast('error', 'Network error');
        } finally {
            setPasswordSaving(false);
        }
    };

    const handleCreate = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!fullname.trim() || !email.trim() || !password.trim()) return;

        setSubmitting(true);
        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    fullname: fullname.trim(),
                    email: email.trim(),
                    password: password.trim(),
                    role: newRole,
                }),
            });
            const data = await response.json();
            if (response.ok && data.success) {
                setCreatedEmployee({ name: fullname.trim(), email: email.trim(), password: password.trim() });
                setEmployees((previous) => [...previous, data.user].sort((left, right) => left.fullname.localeCompare(right.fullname)));
                setFullname('');
                setEmail('');
                setPassword('');
            } else {
                showToast('error', data.error || 'Failed to create employee');
            }
        } catch {
            showToast('error', 'Network error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleStatus = async (employee: Employee) => {
        const newStatus: Employee['status'] = employee.status === 'active' ? 'inactive' : 'active';
        setTogglingId(employee.id);

        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/users/${employee.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status: newStatus }),
            });
            const data = await response.json();
            if (response.ok) {
                setEmployees((previous) => previous.map((row) => (row.id === employee.id ? { ...row, status: newStatus } : row)));
                showToast('success', `${employee.fullname} is now ${newStatus}`);
            } else {
                showToast('error', data.error || 'Failed to update status');
            }
        } catch {
            showToast('error', 'Network error');
        } finally {
            setTogglingId(null);
        }
    };

    const handleDelete = async (employee: Employee) => {
        setDeletingId(employee.id);
        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/users/${employee.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json();
            if (response.ok) {
                setEmployees((previous) => previous.filter((row) => row.id !== employee.id));
                showToast('success', `${employee.fullname} has been removed`);
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

    const handleCreatePresalesEmployee = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!presalesName.trim()) return;

        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/presales/employees`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    full_name: presalesName.trim(),
                    email: presalesEmail.trim() || null,
                    role: presalesRole,
                    team_id: presalesRole === 'agent' ? presalesTeamId || null : null,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to create presales employee');

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

    const handleCreateTeam = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!teamName.trim()) return;

        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/presales/teams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    name: teamName.trim(),
                    team_leader_id: teamLeaderId || null,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to create presales team');

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
            const response = await fetch(`${API_URL}/presales/employees/${employeeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ team_id: teamId || null }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to update team assignment');
            showToast('success', 'Agent team updated');
            await fetchPresalesDirectory();
        } catch (error) {
            showToast('error', error instanceof Error ? error.message : 'Failed to update team assignment');
        }
    };

    const resetModal = () => {
        setShowModal(false);
        setCreatedEmployee(null);
        setFullname('');
        setEmail('');
        setPassword('');
        setNewRole('employee');
        setShowPassword(false);
    };

    const filteredEmployees = useMemo(
        () =>
            employees.filter(
                (employee) =>
                    employee.fullname.toLowerCase().includes(search.toLowerCase()) ||
                    employee.email.toLowerCase().includes(search.toLowerCase())
            ),
        [employees, search]
    );

    const teamNameById = useMemo(() => {
        const map = new Map<string, string>();
        presalesTeams.forEach((team) => {
            map.set(team.id, team.name);
        });
        return map;
    }, [presalesTeams]);

    const filteredPresalesEmployees = useMemo(() => {
        const needle = presalesSearch.trim().toLowerCase();
        if (!needle) return presalesEmployees;

        return presalesEmployees.filter((employee) => {
            const teamName = employee.team_id ? teamNameById.get(employee.team_id) || '' : '';
            return (
                employee.full_name.toLowerCase().includes(needle) ||
                (employee.email || '').toLowerCase().includes(needle) ||
                teamName.toLowerCase().includes(needle)
            );
        });
    }, [presalesEmployees, presalesSearch, teamNameById]);

    const activeCount = employees.filter((employee) => employee.status === 'active').length;
    const inactiveCount = employees.length - activeCount;
    const adminCount = employees.filter((employee) => employee.role === 'admin' || employee.role === 'superadmin').length;
    const internCount = employees.filter((employee) => employee.role === 'intern').length;
    const presalesAgentCount = presalesEmployees.filter((employee) => employee.role === 'agent').length;
    const presalesLeaderCount = presalesEmployees.filter((employee) => employee.role === 'team_leader').length;
    const presalesUnassignedCount = presalesEmployees.filter((employee) => employee.role === 'agent' && !employee.team_id).length;

    return (
        <AdminShell activeSection="employees">
            {toast ? (
                <div
                    className={`fixed right-4 top-4 z-[9999] flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold shadow-[var(--elevation-2)] ${
                        toast.type === 'success'
                            ? 'border-[var(--semantic-success)] bg-[var(--semantic-success-soft)] text-[var(--color-success-strong)]'
                            : 'border-[var(--semantic-danger)] bg-[var(--semantic-danger-soft)] text-[var(--color-critical-strong)]'
                    }`}
                >
                    {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                    {toast.message}
                </div>
            ) : null}

            {editEmp ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) closeEdit();
                    }}
                >
                    <Card className="w-full max-w-md border-[var(--semantic-border)] bg-[var(--semantic-surface-elevated)] shadow-[var(--elevation-3)]">
                        <CardContent className="space-y-5 pt-5">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-[var(--semantic-text-primary)]">Edit employee</h2>
                                <button
                                    type="button"
                                    onClick={closeEdit}
                                    className="rounded-lg p-1 text-[var(--semantic-text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--semantic-text-primary)]"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <form onSubmit={handleEdit} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-[var(--semantic-text-secondary)]">Full name</label>
                                    <Input type="text" value={editName} onChange={(event) => setEditName(event.target.value)} required disabled={editSaving} />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-[var(--semantic-text-secondary)]">Login email</label>
                                    <Input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} required disabled={editSaving} />
                                    {editEmail !== editEmp.email ? (
                                        <p className="text-xs text-[var(--color-warning-strong)]">Changing email updates their login credentials.</p>
                                    ) : null}
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-[var(--semantic-text-secondary)]">
                                        TeleCMI agent id <span className="text-[var(--semantic-text-muted)]">(optional)</span>
                                    </label>
                                    <Input
                                        type="text"
                                        value={editAgentId}
                                        onChange={(event) => setEditAgentId(event.target.value)}
                                        disabled={editSaving}
                                        placeholder="e.g. 5088_33336999"
                                        className="font-mono"
                                    />
                                </div>

                                <Button type="submit" disabled={editSaving || !editName.trim() || !editEmail.trim()} className="w-full">
                                    {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    Save changes
                                </Button>
                            </form>

                            <div className="space-y-3 rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-muted)] p-3.5">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Reset password</p>
                                <div className="relative">
                                    <Input
                                        type={showNewPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                        placeholder="New password (min. 8 chars)"
                                        disabled={passwordSaving}
                                        className="pr-20"
                                    />
                                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setNewPassword(generatePassword())}
                                            className="rounded p-1 text-[var(--semantic-text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--semantic-primary)]"
                                            title="Generate password"
                                        >
                                            <RefreshCw className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword((previous) => !previous)}
                                            className="rounded p-1 text-[var(--semantic-text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--semantic-text-primary)]"
                                            title={showNewPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showNewPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                        </button>
                                    </div>
                                </div>

                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="w-full"
                                    onClick={() => void handleResetPassword()}
                                    disabled={passwordSaving || newPassword.trim().length < 8}
                                >
                                    {passwordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    Reset password
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : null}

            {showModal ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) resetModal();
                    }}
                >
                    <Card className="w-full max-w-md border-[var(--semantic-border)] bg-[var(--semantic-surface-elevated)] shadow-[var(--elevation-3)]">
                        {createdEmployee ? (
                            <CardContent className="space-y-4 pt-5">
                                <div className="flex items-center gap-3">
                                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--semantic-success-soft)] text-[var(--semantic-success)]">
                                        <CheckCircle2 className="h-5 w-5" />
                                    </span>
                                    <div>
                                        <p className="text-lg font-semibold text-[var(--semantic-text-primary)]">Account created</p>
                                        <p className="text-sm text-[var(--semantic-text-muted)]">Share this one time with the employee.</p>
                                    </div>
                                </div>

                                <div className="space-y-2 rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-muted)] p-3 text-sm">
                                    <p className="text-[var(--semantic-text-secondary)]">
                                        <span className="font-semibold">Email:</span> {createdEmployee.email}
                                    </p>
                                    <p className="text-[var(--semantic-text-secondary)]">
                                        <span className="font-semibold">Password:</span>{' '}
                                        <span className="font-mono text-[var(--semantic-primary)]">{createdEmployee.password}</span>
                                    </p>
                                </div>

                                <Button onClick={resetModal} className="w-full">Done</Button>
                            </CardContent>
                        ) : (
                            <form onSubmit={handleCreate}>
                                <CardContent className="space-y-4 pt-5">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-[var(--semantic-text-primary)]">Add employee</h2>
                                        <button
                                            type="button"
                                            onClick={resetModal}
                                            className="rounded-lg p-1 text-[var(--semantic-text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--semantic-text-primary)]"
                                        >
                                            <X className="h-5 w-5" />
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-[var(--semantic-text-secondary)]">Full name *</label>
                                        <Input
                                            type="text"
                                            value={fullname}
                                            onChange={(event) => setFullname(event.target.value)}
                                            placeholder="e.g. Arun Kumar"
                                            required
                                            disabled={submitting}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-[var(--semantic-text-secondary)]">Login email *</label>
                                        <Input
                                            type="email"
                                            value={email}
                                            onChange={(event) => setEmail(event.target.value)}
                                            placeholder="name@company.com"
                                            required
                                            disabled={submitting}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-semibold text-[var(--semantic-text-secondary)]">Password *</label>
                                            <button
                                                type="button"
                                                onClick={() => setPassword(generatePassword())}
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--semantic-primary)] hover:text-[var(--semantic-primary-hover)]"
                                            >
                                                <RefreshCw className="h-3 w-3" />
                                                Generate
                                            </button>
                                        </div>
                                        <div className="relative">
                                            <Input
                                                type={showPassword ? 'text' : 'password'}
                                                value={password}
                                                onChange={(event) => setPassword(event.target.value)}
                                                placeholder="Min. 8 characters"
                                                required
                                                minLength={8}
                                                disabled={submitting}
                                                className="pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword((previous) => !previous)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--semantic-text-muted)] hover:text-[var(--semantic-text-secondary)]"
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    <FilterDropdown
                                        variant="field"
                                        fieldLabel="Role"
                                        value={newRole}
                                        onChange={(value) => setNewRole(value as typeof newRole)}
                                        disabled={submitting}
                                        options={[
                                            { value: 'employee', label: 'Employee' },
                                            { value: 'intern', label: 'Intern' },
                                            { value: 'admin', label: 'Admin' },
                                            { value: 'superadmin', label: 'Superadmin' },
                                        ]}
                                    />

                                    <div className="flex gap-3 pt-1">
                                        <Button type="button" variant="secondary" className="flex-1" disabled={submitting} onClick={resetModal}>
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            className="flex-1"
                                            disabled={submitting || !fullname.trim() || !email.trim() || !password.trim()}
                                        >
                                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                            Create account
                                        </Button>
                                    </div>
                                </CardContent>
                            </form>
                        )}
                    </Card>
                </div>
            ) : null}

            <main className="px-4 pb-10 pt-6 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-[1260px] space-y-6">
                    <header className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                            <h1 className="text-3xl font-semibold tracking-tight text-[var(--semantic-text-primary)]">Manage Employees</h1>
                            <p className="text-sm text-[var(--semantic-text-muted)]">
                                {activeTab === 'platform'
                                    ? loading
                                        ? 'Loading platform users...'
                                        : `${activeCount} active | ${employees.length} total users`
                                    : presalesLoading
                                      ? 'Loading presales directory...'
                                      : `${presalesEmployees.length} people | ${presalesTeams.length} teams`}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {activeTab === 'platform' ? (
                                <Button type="button" onClick={() => setShowModal(true)} className="h-10 px-4">
                                    <UserPlus className="h-4 w-4" />
                                    Add employee
                                </Button>
                            ) : null}
                            <NotificationBell />
                        </div>
                    </header>

                    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {activeTab === 'platform' ? (
                            <>
                                <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Active users</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-2xl font-semibold">{activeCount}</p></CardContent></Card>
                                <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Total users</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-2xl font-semibold">{employees.length}</p></CardContent></Card>
                                <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Admin roles</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-2xl font-semibold">{adminCount}</p></CardContent></Card>
                                <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Interns</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-2xl font-semibold">{internCount}</p></CardContent></Card>
                            </>
                        ) : (
                            <>
                                <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Agents</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-2xl font-semibold">{presalesAgentCount}</p></CardContent></Card>
                                <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Team leaders</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-2xl font-semibold">{presalesLeaderCount}</p></CardContent></Card>
                                <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Teams</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-2xl font-semibold">{presalesTeams.length}</p></CardContent></Card>
                                <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Unassigned agents</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-2xl font-semibold">{presalesUnassignedCount}</p></CardContent></Card>
                            </>
                        )}
                    </section>

                    <SegmentedToggle
                        value={activeTab}
                        onChange={setActiveTab}
                        ariaLabel="Employee directory view"
                        className="w-fit"
                        options={[
                            { value: 'platform', label: 'Platform Users' },
                            { value: 'presales', label: 'Presales Directory' },
                        ]}
                    />

                    {activeTab === 'platform' ? (
                        <section className="space-y-4">
                            <Card>
                                <CardContent className="pt-5">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                        <div className="relative flex-1">
                                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--semantic-text-muted)]" />
                                            <Input type="text" placeholder="Search by name or email" value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 pl-10" />
                                        </div>
                                        <Button type="button" variant="secondary" onClick={() => void fetchEmployees()} disabled={loading} className="h-11">
                                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                            Refresh
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="overflow-hidden">
                                {loading ? (
                                    <CardContent className="flex h-56 items-center justify-center gap-2 pt-5 text-[var(--semantic-text-secondary)]">
                                        <Loader2 className="h-5 w-5 animate-spin text-[var(--semantic-primary)]" />
                                        Loading employees...
                                    </CardContent>
                                ) : filteredEmployees.length === 0 ? (
                                    <CardContent className="flex h-56 flex-col items-center justify-center gap-2 pt-5 text-center">
                                        <ShieldAlert className="h-8 w-8 text-[var(--semantic-text-muted)]" />
                                        <p className="font-semibold text-[var(--semantic-text-primary)]">No employees found</p>
                                        <p className="text-sm text-[var(--semantic-text-muted)]">
                                            {search ? 'Try a different search term.' : 'Add an employee to get started.'}
                                        </p>
                                    </CardContent>
                                ) : (
                                    <Table className="min-w-[820px]">
                                        <TableHeader className="bg-[var(--semantic-surface-muted)]">
                                            <TableRow>
                                                <TableHead>Name</TableHead>
                                                <TableHead>Email</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Role</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredEmployees.map((employee) => (
                                                <TableRow key={employee.id}>
                                                    <TableCell><p className="font-semibold text-[var(--semantic-text-primary)]">{employee.fullname}</p></TableCell>
                                                    <TableCell className="text-[var(--semantic-text-secondary)]">{employee.email}</TableCell>
                                                    <TableCell><Badge variant={employee.status === 'active' ? 'success' : 'secondary'} className="capitalize">{employee.status}</Badge></TableCell>
                                                    <TableCell>
                                                        {employee.role !== 'employee' ? (
                                                            <Badge variant={employee.role === 'superadmin' ? 'default' : employee.role === 'admin' ? 'outline' : 'secondary'}>
                                                                {employee.role}
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-sm text-[var(--semantic-text-muted)]">Employee</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="secondary"
                                                                onClick={() => void handleToggleStatus(employee)}
                                                                disabled={togglingId === employee.id}
                                                                className={employee.status === 'active' ? 'text-[var(--color-warning-strong)]' : 'text-[var(--color-success-strong)]'}
                                                            >
                                                                {togglingId === employee.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : employee.status === 'active' ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                                                                {employee.status === 'active' ? 'Deactivate' : 'Activate'}
                                                            </Button>
                                                            <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(employee)} title="Edit employee"><Pencil className="h-4 w-4" /></Button>
                                                            {deleteConfirmId === employee.id ? (
                                                                <div className="flex items-center gap-1">
                                                                    <Button type="button" size="sm" variant="destructive" onClick={() => void handleDelete(employee)} disabled={deletingId === employee.id}>
                                                                        {deletingId === employee.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                                                        Confirm
                                                                    </Button>
                                                                    <Button type="button" size="sm" variant="secondary" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                                                                </div>
                                                            ) : (
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => setDeleteConfirmId(employee.id)}
                                                                    title="Delete employee"
                                                                    className="text-[var(--semantic-text-muted)] hover:text-[var(--semantic-danger)]"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </Card>

                            <p className="text-sm text-[var(--semantic-text-muted)]">
                                {inactiveCount > 0 ? `${inactiveCount} users are currently inactive.` : 'All platform users are active.'}
                            </p>
                        </section>
                    ) : (
                        <section className="space-y-5">
                            <div className="grid gap-5 xl:grid-cols-2">
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-base">Add Presales Employee</CardTitle></CardHeader>
                                    <CardContent className="pt-2">
                                        <form onSubmit={handleCreatePresalesEmployee} className="space-y-3">
                                            <Input value={presalesName} onChange={(event) => setPresalesName(event.target.value)} placeholder="Full name" className="h-10" />
                                            <Input value={presalesEmail} onChange={(event) => setPresalesEmail(event.target.value)} placeholder="Sell.Do email" type="email" className="h-10" />
                                            <FilterDropdown
                                                variant="field"
                                                fieldLabel="Presales role"
                                                value={presalesRole}
                                                onChange={(value) => setPresalesRole(value as 'agent' | 'team_leader')}
                                                options={[
                                                    { value: 'agent', label: 'Presales Agent' },
                                                    { value: 'team_leader', label: 'Team Leader' },
                                                ]}
                                            />
                                            {presalesRole === 'agent' ? (
                                                <FilterDropdown
                                                    variant="field"
                                                    fieldLabel="Team"
                                                    value={presalesTeamId}
                                                    onChange={setPresalesTeamId}
                                                    placeholder="No team yet"
                                                    options={presalesTeams.map((team) => ({ value: team.id, label: team.name }))}
                                                />
                                            ) : null}
                                            <Button type="submit" className="w-full">Add presales employee</Button>
                                        </form>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-base">Create Presales Team</CardTitle></CardHeader>
                                    <CardContent className="pt-2">
                                        <form onSubmit={handleCreateTeam} className="space-y-3">
                                            <Input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team name" className="h-10" />
                                            <FilterDropdown
                                                variant="field"
                                                fieldLabel="Team leader"
                                                value={teamLeaderId}
                                                onChange={setTeamLeaderId}
                                                placeholder="No leader yet"
                                                options={presalesEmployees.filter((employee) => employee.role === 'team_leader').map((leader) => ({ value: leader.id, label: leader.full_name }))}
                                            />
                                            <Button type="submit" className="w-full">Create team</Button>
                                        </form>
                                    </CardContent>
                                </Card>
                            </div>

                            <Card>
                                <CardContent className="space-y-4 pt-5">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <h2 className="text-lg font-semibold text-[var(--semantic-text-primary)]">Presales Agents and Team Leaders</h2>
                                            <p className="text-sm text-[var(--semantic-text-muted)]">
                                                {filteredPresalesEmployees.length} visible | {presalesTeams.length} teams
                                            </p>
                                        </div>
                                        <div className="flex w-full items-center gap-2 md:w-auto">
                                            <div className="relative flex-1 md:w-72">
                                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--semantic-text-muted)]" />
                                                <Input value={presalesSearch} onChange={(event) => setPresalesSearch(event.target.value)} placeholder="Search name, email, or team" className="h-10 pl-10" />
                                            </div>
                                            <Button type="button" variant="secondary" onClick={() => void fetchPresalesDirectory()} disabled={presalesLoading}>
                                                {presalesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="max-h-[68vh] overflow-auto rounded-xl border border-[var(--semantic-border)]">
                                        <Table className="min-w-[920px]">
                                            <TableHeader className="sticky top-0 z-10 bg-[var(--semantic-surface-muted)]">
                                                <TableRow>
                                                    <TableHead>Name</TableHead>
                                                    <TableHead>Role</TableHead>
                                                    <TableHead>Team</TableHead>
                                                    <TableHead>Email</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filteredPresalesEmployees.map((employee) => (
                                                    <TableRow key={employee.id}>
                                                        <TableCell className="font-semibold text-[var(--semantic-text-primary)]">{employee.full_name}</TableCell>
                                                        <TableCell><Badge variant={employee.role === 'team_leader' ? 'default' : 'secondary'}>{employee.role === 'team_leader' ? 'Team Leader' : 'Agent'}</Badge></TableCell>
                                                        <TableCell>
                                                            {employee.role === 'agent' ? (
                                                                <FilterDropdown
                                                                    variant="bare"
                                                                    value={employee.team_id || ''}
                                                                    onChange={(value) => { void assignPresalesAgent(employee.id, value); }}
                                                                    placeholder="No team"
                                                                    className="min-w-[11rem]"
                                                                    options={presalesTeams.map((team) => ({ value: team.id, label: team.name }))}
                                                                />
                                                            ) : (
                                                                <span className="text-sm text-[var(--semantic-text-muted)]">Can lead teams</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-[var(--semantic-text-secondary)]">{employee.email || '-'}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    {filteredPresalesEmployees.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-[var(--semantic-border)] px-4 py-8 text-center">
                                            <Users className="mx-auto mb-2 h-8 w-8 text-[var(--semantic-text-muted)]" />
                                            <p className="font-semibold text-[var(--semantic-text-primary)]">No presales people found</p>
                                            <p className="text-sm text-[var(--semantic-text-muted)]">Try another search or add a new presales employee.</p>
                                        </div>
                                    ) : null}
                                </CardContent>
                            </Card>
                        </section>
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
