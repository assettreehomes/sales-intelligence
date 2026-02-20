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
    ChevronDown,
    ChevronUp,
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
    Flag,
    FlagOff,
    AlertTriangle,
    Users
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

type Severity = 'info' | 'success' | 'warning' | 'critical';
type ViewMode = 'timeline' | 'table';

interface ActionConfig {
    label: string;
    toneClass: string;
    icon: typeof Activity;
    severity: Severity;
}

type ChipTone = 'info' | 'success' | 'warning' | 'critical';

const ACTION_CONFIG: Record<string, ActionConfig> = {
    'auth.login': { label: 'Login', toneClass: 'activity-badge--info', icon: LogIn, severity: 'info' },
    'auth.logout': { label: 'Logout', toneClass: 'activity-badge--neutral', icon: LogOut, severity: 'info' },
    'auth.totp.setup': { label: 'TOTP Setup', toneClass: 'activity-badge--warning', icon: Shield, severity: 'warning' },
    'ticket.delete': { label: 'Ticket Deleted', toneClass: 'activity-badge--critical', icon: Trash2, severity: 'critical' },
    'ticket.flagged': { label: 'Ticket Flagged', toneClass: 'activity-badge--critical', icon: Flag, severity: 'critical' },
    'ticket.unflagged': { label: 'Ticket Unflagged', toneClass: 'activity-badge--warning', icon: FlagOff, severity: 'warning' },
    'ticket.report.download': { label: 'Report Downloaded', toneClass: 'activity-badge--success', icon: FileText, severity: 'success' },
    'ticket.report.share': { label: 'Report Shared', toneClass: 'activity-badge--info', icon: Share2, severity: 'info' },
    'excuse.accept': { label: 'Excuse Accepted', toneClass: 'activity-badge--success', icon: CheckCircle, severity: 'success' },
    'excuse.reject': { label: 'Excuse Rejected', toneClass: 'activity-badge--warning', icon: XCircle, severity: 'warning' },
    'draft.assign': { label: 'Draft Assigned', toneClass: 'activity-badge--info', icon: FilePlus, severity: 'info' },
};

const BASE_ACTION_OPTIONS = Object.entries(ACTION_CONFIG)
    .map(([value, config]) => ({ value, label: config.label }))
    .sort((a, b) => a.label.localeCompare(b.label));

const QUICK_ACTION_CHIPS: Array<{ label: string; value: string; tone: ChipTone }> = [
    { label: 'Login', value: 'auth.login', tone: 'info' },
    { label: 'Downloads', value: 'ticket.report.download', tone: 'success' },
    { label: 'Flagged', value: 'ticket.flagged', tone: 'critical' },
    { label: 'Security', value: 'auth.totp.setup', tone: 'warning' },
];

const DATE_PRESETS = [
    { label: 'Today', days: 0 },
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
];

const DEVICE_KEYS = new Set(['device', 'os', 'browser']);

const SEVERITY_RAIL: Record<Severity, string> = {
    info: 'activity-row-rail--info',
    success: 'activity-row-rail--success',
    warning: 'activity-row-rail--warning',
    critical: 'activity-row-rail--critical',
};

const SEVERITY_CHIP: Record<Severity, string> = {
    info: 'activity-severity-pill--info',
    success: 'activity-severity-pill--success',
    warning: 'activity-severity-pill--warning',
    critical: 'activity-severity-pill--critical',
};

const SEVERITY_TABLE_EDGE: Record<Severity, string> = {
    info: 'activity-table-edge--info',
    success: 'activity-table-edge--success',
    warning: 'activity-table-edge--warning',
    critical: 'activity-table-edge--critical',
};

function display(value: string | null | undefined): string {
    return value && value.trim().length > 0 ? value : '--';
}

function token(value: string): string {
    return value.split(/[._-]/g).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function actionConfig(action: string): ActionConfig {
    return ACTION_CONFIG[action] || {
        label: token(action),
        toneClass: 'activity-badge--neutral',
        icon: Activity,
        severity: 'info',
    };
}

function dayKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function sameDay(a: Date, b: Date): boolean {
    return dayKey(a) === dayKey(b);
}

function dayLabel(date: Date, now: Date, yesterday: Date): string {
    if (sameDay(date, now)) return 'Today';
    if (sameDay(date, yesterday)) return 'Yesterday';
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function relativeTime(value: string): string {
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return '--';
    const diff = Date.now() - ts;
    if (diff < 0) return 'just now';
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function formatDetails(details: Record<string, unknown>): string {
    if (!details || Object.keys(details).length === 0) return '--';
    const filtered = Object.entries(details).filter(([k]) => !DEVICE_KEYS.has(k));
    if (filtered.length === 0) return '--';
    return filtered.map(([k, v]) => `${token(k)}: ${String(v)}`).join(', ');
}

function detailSummary(details: Record<string, unknown>): string {
    if (!details || Object.keys(details).length === 0) return 'No details';
    const filtered = Object.entries(details).filter(([k]) => !DEVICE_KEYS.has(k));
    if (filtered.length === 0) return 'No details';
    const [k, v] = filtered[0];
    const first = `${token(k)}: ${String(v)}`;
    return filtered.length > 1 ? `${first} +${filtered.length - 1} more` : first;
}

function deviceInfo(details: Record<string, unknown>): string {
    if (!details) return '--';
    const browser = typeof details.browser === 'string' ? details.browser : '';
    const os = typeof details.os === 'string' ? details.os : '';
    const device = typeof details.device === 'string' ? details.device : '';
    const parts = [browser, os, device].filter((x) => x && x.trim().length > 0);
    return parts.length > 0 ? parts.join(' | ') : '--';
}

function maskIp(ip: string | null): string {
    if (!ip) return '--';
    if (ip.includes('.')) {
        const parts = ip.split('.');
        if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
    }
    if (ip.includes(':')) {
        const parts = ip.split(':').filter(Boolean);
        if (parts.length >= 2) return `${parts.slice(0, 2).join(':')}:****`;
    }
    return ip;
}

function presetDates(days: number) {
    const to = new Date();
    const from = new Date();
    if (days === 0) from.setHours(0, 0, 0, 0);
    else from.setDate(from.getDate() - days);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
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
    const [viewMode, setViewMode] = useState<ViewMode>('timeline');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

    const handlePreset = (days: number, index: number) => {
        const { from, to } = presetDates(days);
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

    const toggleRow = (id: string) => {
        setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
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

    const countText = useMemo(() => {
        if (loading) return 'Loading...';
        return `${total} log${total === 1 ? '' : 's'} found`;
    }, [loading, total]);

    const actionOptions = useMemo(() => {
        const known = new Set(BASE_ACTION_OPTIONS.map((x) => x.value));
        const extra = Array.from(new Set(logs.map((x) => x.action)))
            .filter((action) => action && action !== 'all' && !known.has(action))
            .sort((a, b) => a.localeCompare(b))
            .map((action) => ({ value: action, label: token(action) }));
        return [{ value: 'all', label: 'All Actions' }, ...BASE_ACTION_OPTIONS, ...extra];
    }, [logs]);

    const availableQuickChips = useMemo(() => {
        const options = new Set(actionOptions.map((x) => x.value));
        return QUICK_ACTION_CHIPS.filter((chip) => options.has(chip.value));
    }, [actionOptions]);

    const anomalyMap = useMemo(() => {
        const result = new Map<string, Set<string>>();
        const add = (id: string, text: string) => {
            const entry = result.get(id) || new Set<string>();
            entry.add(text);
            result.set(id, entry);
        };

        const byUser = new Map<string, ActivityLog[]>();
        const sorted = [...logs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        sorted.forEach((log) => {
            const key = log.user_id || log.user_name || 'unknown';
            const list = byUser.get(key) || [];
            list.push(log);
            byUser.set(key, list);
        });

        byUser.forEach((userLogs) => {
            const checkBurst = (action: string, ms: number, threshold: number, label: string) => {
                const filtered = userLogs.filter((x) => x.action === action);
                let start = 0;
                for (let end = 0; end < filtered.length; end += 1) {
                    const endTs = new Date(filtered[end].created_at).getTime();
                    while (start < end) {
                        const startTs = new Date(filtered[start].created_at).getTime();
                        if (endTs - startTs <= ms) break;
                        start += 1;
                    }
                    if (end - start + 1 >= threshold) {
                        for (let i = start; i <= end; i += 1) add(filtered[i].id, label);
                    }
                }
            };

            checkBurst('auth.login', 2 * 60 * 1000, 3, 'Login burst');
            checkBurst('ticket.report.download', 10 * 60 * 1000, 3, 'Download burst');
        });

        return new Map(Array.from(result.entries()).map(([id, labels]) => [id, Array.from(labels)]));
    }, [logs]);

    const dashboardMetrics = useMemo(() => {
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);

        let todayCount = 0;
        let yesterdayCount = 0;
        let flaggedCount = 0;
        const uniqueUsers = new Set<string>();

        logs.forEach((log) => {
            const createdAt = new Date(log.created_at);
            if (sameDay(createdAt, now)) todayCount += 1;
            if (sameDay(createdAt, yesterday)) yesterdayCount += 1;

            const userKey = log.user_id || log.user_name || log.id;
            uniqueUsers.add(userKey);

            if (log.action === 'ticket.flagged' || actionConfig(log.action).severity === 'critical') {
                flaggedCount += 1;
            }
        });

        let suspiciousSignals = 0;
        anomalyMap.forEach((labels) => {
            suspiciousSignals += labels.length;
        });

        const delta = yesterdayCount === 0
            ? (todayCount > 0 ? 100 : 0)
            : Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);

        const deltaTone = yesterdayCount === 0
            ? (todayCount > 0 ? 'up' : 'flat')
            : (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat');

        const deltaLabel = yesterdayCount === 0
            ? (todayCount > 0 ? 'new vs yesterday' : 'no change vs yesterday')
            : `${delta >= 0 ? '+' : ''}${delta}% vs yesterday`;

        return {
            todayCount,
            flaggedCount,
            uniqueUsers: uniqueUsers.size,
            suspiciousSignals,
            deltaTone,
            deltaLabel,
        };
    }, [anomalyMap, logs]);

    const groupedLogs = useMemo(() => {
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);

        const byDay = new Map<string, { date: Date; entries: ActivityLog[] }>();
        logs.forEach((log) => {
            const createdAt = new Date(log.created_at);
            const key = dayKey(createdAt);
            const date = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());
            const group = byDay.get(key);
            if (!group) {
                byDay.set(key, { date, entries: [log] });
                return;
            }
            group.entries.push(log);
        });

        return Array.from(byDay.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([key, group]) => ({
                key,
                label: dayLabel(group.date, now, yesterday),
                entries: group.entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
            }));
    }, [logs]);

    const renderBadge = (action: string) => {
        const config = actionConfig(action);
        const Icon = config.icon;
        return (
            <span className={`activity-badge ${config.toneClass}`}>
                <Icon className="h-3 w-3" />
                {config.label}
            </span>
        );
    };

    return (
        <AdminShell activeSection="activity">
            <main className="activity-page p-5 md:p-8">
                <div className="mx-auto max-w-7xl">
                    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h1 className="activity-heading text-2xl font-semibold">Activity Intelligence</h1>
                            <p className="activity-subheading text-sm">{countText}</p>
                        </div>

                        <button
                            type="button"
                            onClick={handleExport}
                            disabled={exporting || logs.length === 0}
                            className="activity-export-btn inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Export CSV
                        </button>
                    </div>

                    <section className="activity-metric-grid mb-6">
                        <article className="activity-metric-card is-primary">
                            <div className="activity-metric-head">
                                <Activity className="h-4 w-4" />
                                <span>TODAY&apos;S ACTIVITY</span>
                            </div>
                            <p className="activity-metric-value">{dashboardMetrics.todayCount}</p>
                            <p className={`activity-metric-note ${dashboardMetrics.deltaTone === 'up' ? 'is-up' : dashboardMetrics.deltaTone === 'down' ? 'is-down' : 'is-flat'}`}>
                                {dashboardMetrics.deltaLabel}
                            </p>
                        </article>

                        <article className="activity-metric-card is-critical">
                            <div className="activity-metric-head">
                                <Flag className="h-4 w-4" />
                                <span>FLAGGED ACTIONS</span>
                            </div>
                            <p className="activity-metric-value">{dashboardMetrics.flaggedCount}</p>
                            <p className="activity-metric-note">Critical and flagged events</p>
                        </article>

                        <article className="activity-metric-card is-accent">
                            <div className="activity-metric-head">
                                <Users className="h-4 w-4" />
                                <span>UNIQUE USERS</span>
                            </div>
                            <p className="activity-metric-value">{dashboardMetrics.uniqueUsers}</p>
                            <p className="activity-metric-note">Visible in current result set</p>
                        </article>

                        <article className={`activity-metric-card ${dashboardMetrics.suspiciousSignals > 0 ? 'is-warning' : 'is-muted'}`}>
                            <div className="activity-metric-head">
                                <AlertTriangle className="h-4 w-4" />
                                <span>SUSPICIOUS SIGNALS</span>
                            </div>
                            <p className="activity-metric-value">{dashboardMetrics.suspiciousSignals}</p>
                            <p className="activity-metric-note">Burst detection heuristics</p>
                        </article>
                    </section>

                    <div className="activity-filter-shell mb-6 rounded-xl p-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <select
                                value={actionFilter}
                                onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                                className="activity-select rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                            >
                                {actionOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>

                            <div className="activity-view-switch inline-flex rounded-lg p-1">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('timeline')}
                                    className={`activity-view-btn rounded-md px-3 py-1.5 text-sm font-medium transition ${viewMode === 'timeline' ? 'is-active' : ''}`}
                                >
                                    Timeline View
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('table')}
                                    className={`activity-view-btn rounded-md px-3 py-1.5 text-sm font-medium transition ${viewMode === 'table' ? 'is-active' : ''}`}
                                >
                                    Table View
                                </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                                {DATE_PRESETS.map((preset, idx) => (
                                    <button
                                        key={preset.label}
                                        type="button"
                                        onClick={() => handlePreset(preset.days, idx)}
                                        className={`activity-preset-btn rounded-lg px-3 py-2 text-sm font-medium transition-colors ${activePreset === idx ? 'is-active' : ''}`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => { setDateFrom(e.target.value); setActivePreset(null); setPage(1); }}
                                    className="activity-date-input rounded-lg px-3 py-2 text-sm focus:outline-none"
                                />
                                <span className="activity-date-sep text-sm">to</span>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => { setDateTo(e.target.value); setActivePreset(null); setPage(1); }}
                                    className="activity-date-input rounded-lg px-3 py-2 text-sm focus:outline-none"
                                />
                            </div>

                            {(dateFrom || dateTo) && (
                                <button
                                    type="button"
                                    onClick={handleClearDates}
                                    className="activity-clear-btn rounded-lg px-3 py-2 text-sm"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        {availableQuickChips.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {availableQuickChips.map((chip) => (
                                    <button
                                        key={chip.value}
                                        type="button"
                                        onClick={() => {
                                            setActionFilter((prev) => (prev === chip.value ? 'all' : chip.value));
                                            setPage(1);
                                        }}
                                        className={`activity-quick-chip activity-quick-chip--${chip.tone} rounded-full px-3 py-1.5 text-xs font-medium transition ${actionFilter === chip.value ? 'is-active' : ''}`}
                                    >
                                        {chip.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {loading ? (
                        <div className="activity-loading-shell rounded-xl p-4">
                            <div className="animate-pulse space-y-2">
                                {Array.from({ length: 8 }).map((_, index) => (
                                    <div key={`skeleton-${index}`} className="activity-loading-bar h-14 rounded-xl" />
                                ))}
                            </div>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="activity-empty-shell rounded-xl p-10 text-center">
                            <Search className="activity-empty-icon mx-auto mb-3 h-8 w-8" />
                            <p>No activity logs found for the selected filters.</p>
                        </div>
                    ) : (
                        <div className="activity-stream-shell overflow-hidden rounded-xl">
                            {viewMode === 'timeline' ? (
                                <div>
                                    {groupedLogs.map((group) => (
                                        <section key={group.key} className="activity-day-section">
                                            <div className="activity-day-header flex items-center justify-between px-4 py-2.5">
                                                <h2 className="activity-day-title text-sm font-semibold">{group.label}</h2>
                                                <span className="activity-day-count inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold">{group.entries.length}</span>
                                            </div>

                                            <div className="activity-day-list">
                                                {group.entries.map((log, index) => {
                                                    const config = actionConfig(log.action);
                                                    const detailText = formatDetails(log.details);
                                                    const summaryText = detailSummary(log.details);
                                                    const anomaly = anomalyMap.get(log.id) || [];
                                                    const open = Boolean(expanded[log.id]);

                                                    return (
                                                        <div
                                                            key={log.id}
                                                            className={`activity-row relative border-t first:border-t-0 ${index % 2 === 0 ? 'is-even' : 'is-odd'}`}
                                                        >
                                                            <span className={`activity-row-rail ${SEVERITY_RAIL[config.severity]}`} />
                                                            <button type="button" onClick={() => toggleRow(log.id)} className="activity-row-btn w-full px-4 py-3.5 text-left">
                                                                <div className="activity-row-main flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                                    <div className="min-w-0 space-y-2.5">
                                                                        <div className="activity-meta flex flex-wrap items-center gap-2 text-xs">
                                                                            <span title={formatTimestamp(log.created_at)}>{relativeTime(log.created_at)}</span>
                                                                            <span className="activity-user font-semibold">{display(log.user_name)}</span>
                                                                        </div>
                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                            {renderBadge(log.action)}
                                                                            <p className="activity-summary max-w-3xl truncate text-sm" title={detailText}>{summaryText}</p>
                                                                        </div>
                                                                        <div className="activity-context text-xs">
                                                                            {deviceInfo(log.details)} | {display(log.location)} | {maskIp(log.ip_address)}
                                                                        </div>
                                                                    </div>

                                                                    <div className="activity-side flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
                                                                        {anomaly.map((signal) => (
                                                                            <span key={`${log.id}-${signal}`} className="activity-signal-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium">
                                                                                <AlertTriangle className="h-3 w-3" />
                                                                                {signal}
                                                                            </span>
                                                                        ))}
                                                                        <span className={`activity-severity-pill rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${SEVERITY_CHIP[config.severity]}`}>{config.severity}</span>
                                                                        {open ? <ChevronUp className="activity-expand-icon h-4 w-4" /> : <ChevronDown className="activity-expand-icon h-4 w-4" />}
                                                                    </div>
                                                                </div>
                                                            </button>

                                                            {open && (
                                                                <div className="activity-expanded border-t px-4 pb-4 pt-3">
                                                                    <div className="activity-expanded-grid grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                                                        <div><p className="activity-expanded-label text-xs uppercase">Exact time</p><p className="activity-expanded-value mt-1">{formatTimestamp(log.created_at)}</p></div>
                                                                        <div><p className="activity-expanded-label text-xs uppercase">User</p><p className="activity-expanded-value mt-1">{display(log.user_name)}</p></div>
                                                                        <div><p className="activity-expanded-label text-xs uppercase">Location</p><p className="activity-expanded-value mt-1">{display(log.location)}</p></div>
                                                                        <div><p className="activity-expanded-label text-xs uppercase">IP</p><p className="activity-expanded-value mt-1 break-all font-mono">{display(log.ip_address)}</p></div>
                                                                    </div>
                                                                    <div className="activity-expanded-details mt-3 rounded-xl p-3">
                                                                        <p className="activity-expanded-label text-xs uppercase">Full details</p>
                                                                        <p className="activity-expanded-details-text mt-1 break-all text-xs">{detailText}</p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            ) : (
                                <div className="activity-table-shell overflow-x-auto">
                                    <table className="activity-table w-full min-w-[920px] text-sm">
                                        <thead>
                                            <tr className="activity-table-head">
                                                <th className="px-4 py-3 text-left font-medium">Time</th>
                                                <th className="px-4 py-3 text-left font-medium">User</th>
                                                <th className="px-4 py-3 text-left font-medium">Action</th>
                                                <th className="px-4 py-3 text-left font-medium">Details</th>
                                                <th className="px-4 py-3 text-left font-medium">Context</th>
                                                <th className="px-4 py-3 text-left font-medium">Signals</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {logs.map((log, index) => {
                                                const config = actionConfig(log.action);
                                                const anomaly = anomalyMap.get(log.id) || [];
                                                return (
                                                    <tr key={log.id} className={`activity-table-row ${index % 2 === 0 ? 'is-even' : 'is-odd'}`}>
                                                        <td className="activity-context px-4 py-3 align-top text-xs">
                                                            <div className={`activity-table-time-stack ${SEVERITY_TABLE_EDGE[config.severity]}`}>
                                                                <p title={formatTimestamp(log.created_at)}>{relativeTime(log.created_at)}</p>
                                                                <p className="activity-subheading text-[11px]">{formatTimestamp(log.created_at)}</p>
                                                            </div>
                                                        </td>
                                                        <td className="activity-table-user px-4 py-3 align-top font-medium">{display(log.user_name)}</td>
                                                        <td className="px-4 py-3 align-top">{renderBadge(log.action)}</td>
                                                        <td className="activity-table-summary px-4 py-3 align-top text-xs">{detailSummary(log.details)}</td>
                                                        <td className="activity-table-context px-4 py-3 align-top text-xs">{deviceInfo(log.details)} | {display(log.location)} | {maskIp(log.ip_address)}</td>
                                                        <td className="px-4 py-3 align-top">
                                                            <div className="flex flex-wrap gap-1">
                                                                {anomaly.length === 0
                                                                    ? <span className={`activity-severity-pill rounded-full px-2 py-1 text-[11px] font-medium ${SEVERITY_CHIP[config.severity]}`}>{config.severity}</span>
                                                                    : anomaly.map((signal) => (
                                                                        <span key={`${log.id}-${signal}`} className="activity-signal-pill rounded-full px-2 py-1 text-[11px] font-medium">{signal}</span>
                                                                    ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {totalPages > 1 && (
                                <div className="activity-pagination flex items-center justify-between px-4 py-3">
                                    <p className="activity-page-text text-sm">Page {page} of {totalPages}</p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                            disabled={page <= 1}
                                            className="activity-page-btn inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            Previous
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                            disabled={page >= totalPages}
                                            className="activity-page-btn inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Next
                                            <ChevronRight className="h-4 w-4" />
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
