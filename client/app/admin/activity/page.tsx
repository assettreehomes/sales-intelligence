'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { API_URL, getToken } from '@/stores/authStore';
import { notifyError } from '@/lib/toast';
import {
    Download,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Search,
    LogIn,
    LogOut,
    Trash2,
    FileText,
    Share2,
    CheckCircle,
    XCircle,
    Shield,
    Activity,
    FilePlus,
    Smartphone,
    MapPin
} from 'lucide-react';

interface ActivityLog {
    id: string;
    user_id: string | null;
    user_name: string | null;
    action: string;
    details: Record<string, unknown>;
    ip_address: string | null;
    location: string | null;
    created_at: string;
}

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: typeof Activity }> = {
    'auth.login': { label: 'Login', color: 'bg-blue-100 text-blue-700', icon: LogIn },
    'auth.logout': { label: 'Logout', color: 'bg-gray-100 text-gray-700', icon: LogOut },
    'auth.totp.setup': { label: 'TOTP Setup', color: 'bg-purple-100 text-purple-700', icon: Shield },
    'ticket.delete': { label: 'Ticket Deleted', color: 'bg-red-100 text-red-700', icon: Trash2 },
    'ticket.report.download': { label: 'Report Downloaded', color: 'bg-green-100 text-green-700', icon: FileText },
    'ticket.report.share': { label: 'Report Shared', color: 'bg-indigo-100 text-indigo-700', icon: Share2 },
    'excuse.accept': { label: 'Excuse Accepted', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
    'excuse.reject': { label: 'Excuse Rejected', color: 'bg-orange-100 text-orange-700', icon: XCircle },
    'draft.assign': { label: 'Draft Assigned', color: 'bg-cyan-100 text-cyan-700', icon: FilePlus },
};

const ACTION_OPTIONS = [
    { value: 'all', label: 'All Actions' },
    { value: 'auth.login', label: 'Login' },
    { value: 'auth.logout', label: 'Logout' },
    { value: 'auth.totp.setup', label: 'TOTP Setup' },
    { value: 'ticket.delete', label: 'Ticket Deleted' },
    { value: 'ticket.report.download', label: 'Report Downloaded' },
    { value: 'ticket.report.share', label: 'Report Shared' },
    { value: 'excuse.accept', label: 'Excuse Accepted' },
    { value: 'excuse.reject', label: 'Excuse Rejected' },
    { value: 'draft.assign', label: 'Draft Assigned' },
];

const DATE_PRESETS = [
    { label: 'Today', days: 0 },
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
];

function getPresetDates(days: number) {
    const to = new Date();
    const from = new Date();
    if (days === 0) {
        from.setHours(0, 0, 0, 0);
    } else {
        from.setDate(from.getDate() - days);
    }
    return {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
    };
}

function ActivityLogPageContent() {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const [actionFilter, setActionFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [activePreset, setActivePreset] = useState<number | null>(null);
    const [exporting, setExporting] = useState(false);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication required');

            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('limit', '25');
            if (actionFilter !== 'all') params.set('action', actionFilter);
            if (dateFrom) params.set('dateFrom', dateFrom);
            if (dateTo) params.set('dateTo', dateTo);

            const response = await fetch(`${API_URL}/activity-log?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Failed to fetch activity logs');

            setLogs(payload.logs || []);
            setTotal(payload.total || 0);
            setTotalPages(payload.totalPages || 1);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch logs';
            notifyError(message);
            setLogs([]);
        } finally {
            setLoading(false);
        }
    }, [page, actionFilter, dateFrom, dateTo]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handlePreset = (days: number, index: number) => {
        const { from, to } = getPresetDates(days);
        setDateFrom(from);
        setDateTo(to);
        setActivePreset(index);
        setPage(1);
    };

    const handleClearDates = () => {
        setDateFrom('');
        setDateTo('');
        setActivePreset(null);
        setPage(1);
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication required');

            const params = new URLSearchParams();
            if (actionFilter !== 'all') params.set('action', actionFilter);
            if (dateFrom) params.set('dateFrom', dateFrom);
            if (dateTo) params.set('dateTo', dateTo);

            const response = await fetch(`${API_URL}/activity-log/export?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `activity_log_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Export failed';
            notifyError(message);
        } finally {
            setExporting(false);
        }
    };

    const formatTimestamp = (value: string) => {
        return new Date(value).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        });
    };

    const DEVICE_KEYS = new Set(['device', 'os', 'browser']);

    const formatDetails = (details: Record<string, unknown>) => {
        if (!details || Object.keys(details).length === 0) return '—';
        const filtered = Object.entries(details).filter(([key]) => !DEVICE_KEYS.has(key));
        if (filtered.length === 0) return '—';
        return filtered
            .map(([key, val]) => `${key}: ${String(val)}`)
            .join(', ');
    };

    const formatDeviceInfo = (details: Record<string, unknown>) => {
        if (!details) return '—';
        const parts = [details.browser, details.os, details.device].filter(Boolean);
        return parts.length > 0 ? parts.join(' · ') : '—';
    };

    const countText = useMemo(() => {
        if (loading) return 'Loading...';
        return `${total} log${total === 1 ? '' : 's'} found`;
    }, [loading, total]);

    return (
        <AdminShell activeSection="activity">
            <main className="p-5 md:p-8">
                <div className="max-w-6xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900">Activity Log</h1>
                            <p className="text-sm text-gray-500">{countText}</p>
                        </div>

                        <button
                            type="button"
                            onClick={handleExport}
                            disabled={exporting || logs.length === 0}
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Export CSV
                        </button>
                    </div>

                    {/* Filters */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Action filter */}
                            <select
                                value={actionFilter}
                                onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                                className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                            >
                                {ACTION_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>

                            {/* Date presets */}
                            <div className="flex items-center gap-1.5">
                                {DATE_PRESETS.map((preset, idx) => (
                                    <button
                                        key={preset.label}
                                        type="button"
                                        onClick={() => handlePreset(preset.days, idx)}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activePreset === idx
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>

                            {/* Custom date range */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => { setDateFrom(e.target.value); setActivePreset(null); setPage(1); }}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                <span className="text-gray-400 text-sm">to</span>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => { setDateTo(e.target.value); setActivePreset(null); setPage(1); }}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>

                            {(dateFrom || dateTo) && (
                                <button
                                    type="button"
                                    onClick={handleClearDates}
                                    className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-10 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">
                            <Search className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                            <p>No activity logs found for the selected filters.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-200 bg-gray-50">
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Timestamp</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Action</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Details</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">
                                                <span className="inline-flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" />Device</span>
                                            </th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">
                                                <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />Location</span>
                                            </th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">IP</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {logs.map((log) => {
                                            const config = ACTION_CONFIG[log.action] || {
                                                label: log.action,
                                                color: 'bg-gray-100 text-gray-700',
                                                icon: Activity,
                                            };
                                            const IconComponent = config.icon;

                                            return (
                                                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                                                        {formatTimestamp(log.created_at)}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                                                        {log.user_name || '—'}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
                                                            <IconComponent className="w-3 h-3" />
                                                            {config.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate text-xs" title={formatDetails(log.details)}>
                                                        {formatDetails(log.details)}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                                                        {formatDeviceInfo(log.details)}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                                                        {log.location || '—'}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-gray-400 font-mono text-xs">
                                                        {log.ip_address || '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
                                    <p className="text-sm text-gray-500">
                                        Page {page} of {totalPages}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                            disabled={page <= 1}
                                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                            Previous
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                            disabled={page >= totalPages}
                                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Next
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </AdminShell>
    );
}

export default function AdminActivityPage() {
    return (
        <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
            <ActivityLogPageContent />
        </ProtectedRoute>
    );
}
