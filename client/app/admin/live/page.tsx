'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { FilterDropdown } from '@/components/FilterDropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getToken, API_URL } from '@/stores/authStore';
import {
    BatteryFull,
    BatteryLow,
    BatteryMedium,
    BatteryWarning,
    Clock,
    Loader2,
    MapPin,
    Mic,
    RefreshCw,
    Search,
    User,
    Wifi,
    WifiOff,
} from 'lucide-react';

interface CurrentTicket {
    id: string;
    client_name: string;
    visit_type: string;
    visit_number: number;
    is_draft: boolean;
    ticket_status: string;
}

interface EmployeeStatus {
    user: {
        id: string;
        fullname: string;
        email: string;
        role: 'employee' | 'intern' | string;
        avatar_url?: string;
    };
    status: {
        is_online: boolean;
        is_recording: boolean;
        current_client_id: string | null;
        current_ticket_id: string | null;
        current_ticket: CurrentTicket | null;
        last_heartbeat: string | null;
        battery_level: number | null;
        battery_updated_at: string | null;
    };
}

type StateFilter = 'all' | 'online' | 'offline';
type ActivityFilter = 'all' | 'recording' | 'idle';
type RoleFilter = 'all' | 'employee' | 'intern';

function relativeTime(iso: string | null): string {
    if (!iso) return 'n/a';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 10) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatLastSeen(iso: string | null): string {
    if (!iso) return 'Awaiting signal';
    const date = new Date(iso);
    const sameDay = date.toDateString() === new Date().toDateString();
    if (sameDay) {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function formatVisitType(raw: string): string {
    return raw.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'NA';
    return parts
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('');
}

function getBatteryLabel(level: number | null | undefined) {
    if (typeof level !== 'number' || !Number.isFinite(level)) {
        return {
            value: null,
            label: 'Not reported',
            icon: BatteryWarning,
            tone: 'secondary' as const,
        };
    }

    const normalized = Math.max(0, Math.min(100, Math.round(level)));
    if (normalized >= 75) return { value: normalized, label: `${normalized}%`, icon: BatteryFull, tone: 'success' as const };
    if (normalized >= 40) return { value: normalized, label: `${normalized}%`, icon: BatteryMedium, tone: 'warning' as const };
    if (normalized >= 20) return { value: normalized, label: `${normalized}%`, icon: BatteryLow, tone: 'warning' as const };
    return { value: normalized, label: `${normalized}%`, icon: BatteryWarning, tone: 'destructive' as const };
}

export default function LiveStatusPage() {
    const [statuses, setStatuses] = useState<EmployeeStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [updatedPulse, setUpdatedPulse] = useState(false);
    const [avatarErrorMap, setAvatarErrorMap] = useState<Record<string, boolean>>({});

    const [search, setSearch] = useState('');
    const [stateFilter, setStateFilter] = useState<StateFilter>('all');
    const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

    const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const triggerUpdatePulse = () => {
        setUpdatedPulse(true);
        if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
        pulseTimeoutRef.current = setTimeout(() => {
            setUpdatedPulse(false);
        }, 900);
    };

    const fetchStatus = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;

            const response = await fetch(`${API_URL}/employee/status`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                setStatuses(Array.isArray(data.statuses) ? data.statuses : []);
                setLastUpdated(new Date());
                triggerUpdatePulse();
            }
        } catch (error) {
            console.error('Failed to fetch status:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchStatus();
        const interval = setInterval(() => {
            void fetchStatus();
        }, 10000);

        return () => {
            clearInterval(interval);
            if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
        };
    }, [fetchStatus]);

    const sortedStatuses = useMemo(() => {
        return [...statuses].sort((left, right) => {
            const leftScore = left.status.is_recording ? 3 : left.status.is_online ? 2 : 1;
            const rightScore = right.status.is_recording ? 3 : right.status.is_online ? 2 : 1;
            return rightScore - leftScore || left.user.fullname.localeCompare(right.user.fullname);
        });
    }, [statuses]);

    const metrics = useMemo(() => {
        const total = sortedStatuses.length;
        const online = sortedStatuses.filter((entry) => entry.status.is_online).length;
        const recording = sortedStatuses.filter((entry) => entry.status.is_online && entry.status.is_recording).length;
        const idle = Math.max(online - recording, 0);
        const offline = Math.max(total - online, 0);
        return { total, online, recording, idle, offline };
    }, [sortedStatuses]);

    const filteredStatuses = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return sortedStatuses.filter((entry) => {
            const matchesState =
                stateFilter === 'all' ||
                (stateFilter === 'online' ? entry.status.is_online : !entry.status.is_online);

            const matchesActivity =
                activityFilter === 'all' ||
                (activityFilter === 'recording'
                    ? entry.status.is_online && entry.status.is_recording
                    : entry.status.is_online && !entry.status.is_recording);

            const matchesRole = roleFilter === 'all' || entry.user.role === roleFilter;

            const assignedClient = entry.status.current_ticket?.client_name || entry.status.current_client_id || '';
            const matchesSearch =
                !needle ||
                entry.user.fullname.toLowerCase().includes(needle) ||
                entry.user.email.toLowerCase().includes(needle) ||
                assignedClient.toLowerCase().includes(needle);

            return matchesState && matchesActivity && matchesRole && matchesSearch;
        });
    }, [activityFilter, roleFilter, search, sortedStatuses, stateFilter]);

    return (
        <AdminShell activeSection="live">
            <main className="px-4 pb-10 pt-6 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-[1280px] space-y-6">
                    <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-1.5">
                            <h1 className="text-3xl font-semibold tracking-tight text-[var(--semantic-text-primary)]">Live Employee Status</h1>
                            <p className="text-sm text-[var(--semantic-text-muted)]">Real-time operations view of online activity, recording state, and assignment context.</p>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-elevated)] px-3 py-2 text-sm text-[var(--semantic-text-secondary)] shadow-[var(--elevation-1)]">
                            <RefreshCw className={`h-4 w-4 ${updatedPulse ? 'animate-spin' : ''}`} />
                            <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--semantic-text-primary)]">
                                <span className="h-2 w-2 rounded-full bg-[var(--semantic-success)] animate-pulse" />
                                Live
                            </span>
                            <span>{lastUpdated.toLocaleTimeString()}</span>
                        </div>
                    </header>

                    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Team</CardTitle></CardHeader><CardContent className="pt-0 text-2xl font-semibold">{metrics.total}</CardContent></Card>
                        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Online</CardTitle></CardHeader><CardContent className="pt-0 text-2xl font-semibold text-[var(--semantic-success)]">{metrics.online}</CardContent></Card>
                        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Recording</CardTitle></CardHeader><CardContent className="pt-0 text-2xl font-semibold text-[var(--semantic-danger)]">{metrics.recording}</CardContent></Card>
                        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Idle</CardTitle></CardHeader><CardContent className="pt-0 text-2xl font-semibold text-[var(--semantic-warning)]">{metrics.idle}</CardContent></Card>
                        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.08em] text-[var(--semantic-text-muted)]">Offline</CardTitle></CardHeader><CardContent className="pt-0 text-2xl font-semibold text-[var(--semantic-text-secondary)]">{metrics.offline}</CardContent></Card>
                    </section>

                    <Card>
                        <CardContent className="pt-5">
                            <div className="grid gap-3 lg:grid-cols-[1fr_repeat(3,minmax(0,180px))_auto]">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--semantic-text-muted)]" />
                                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee, email, or client" className="h-11 pl-10" />
                                </div>
                                <FilterDropdown
                                    variant="inline"
                                    label="State"
                                    value={stateFilter}
                                    onChange={(value) => setStateFilter(value as StateFilter)}
                                    options={[
                                        { value: 'all', label: 'All states' },
                                        { value: 'online', label: 'Online' },
                                        { value: 'offline', label: 'Offline' },
                                    ]}
                                />
                                <FilterDropdown
                                    variant="inline"
                                    label="Activity"
                                    value={activityFilter}
                                    onChange={(value) => setActivityFilter(value as ActivityFilter)}
                                    options={[
                                        { value: 'all', label: 'All activity' },
                                        { value: 'recording', label: 'Recording' },
                                        { value: 'idle', label: 'Idle' },
                                    ]}
                                />
                                <FilterDropdown
                                    variant="inline"
                                    label="Role"
                                    value={roleFilter}
                                    onChange={(value) => setRoleFilter(value as RoleFilter)}
                                    options={[
                                        { value: 'all', label: 'All roles' },
                                        { value: 'employee', label: 'Employees' },
                                        { value: 'intern', label: 'Interns' },
                                    ]}
                                />
                                <Button type="button" variant="secondary" className="h-11" onClick={() => void fetchStatus()} disabled={loading}>
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                    Refresh
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {loading ? (
                        <Card>
                            <CardContent className="flex h-56 items-center justify-center gap-2 pt-5 text-[var(--semantic-text-secondary)]">
                                <Loader2 className="h-5 w-5 animate-spin text-[var(--semantic-primary)]" />
                                Syncing employee heartbeat...
                            </CardContent>
                        </Card>
                    ) : filteredStatuses.length === 0 ? (
                        <Card>
                            <CardContent className="flex h-56 flex-col items-center justify-center gap-2 pt-5 text-center">
                                <User className="h-8 w-8 text-[var(--semantic-text-muted)]" />
                                <p className="font-semibold text-[var(--semantic-text-primary)]">No employees match these filters</p>
                                <p className="text-sm text-[var(--semantic-text-muted)]">Adjust search or filters to view live status cards.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {filteredStatuses.map((entry) => {
                                const { user, status } = entry;
                                const battery = getBatteryLabel(status.battery_level);
                                const BatteryIcon = battery.icon;
                                const showAvatarImage = Boolean(user.avatar_url) && !avatarErrorMap[user.id];
                                const tone = status.is_recording ? 'recording' : status.is_online ? 'online' : 'offline';
                                const assignedClient = status.current_ticket?.client_name || status.current_client_id;

                                return (
                                    <Card key={user.id} className="group relative overflow-hidden border-[var(--semantic-border)] transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-[var(--semantic-border-strong)] hover:shadow-[var(--elevation-2)]">
                                        <span
                                            className={`absolute left-0 top-0 h-full w-1 ${
                                                tone === 'recording'
                                                    ? 'bg-[var(--semantic-danger)]'
                                                    : tone === 'online'
                                                      ? 'bg-[var(--semantic-success)]'
                                                      : 'bg-[var(--semantic-border-strong)]'
                                            }`}
                                        />
                                        <CardContent className="space-y-4 pt-5">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--semantic-border)] bg-[var(--semantic-surface-muted)] text-sm font-semibold text-[var(--semantic-text-primary)]">
                                                        {showAvatarImage ? (
                                                            <img
                                                                src={user.avatar_url}
                                                                alt={user.fullname}
                                                                className="h-full w-full object-cover"
                                                                onError={() => {
                                                                    setAvatarErrorMap((previous) => ({ ...previous, [user.id]: true }));
                                                                }}
                                                            />
                                                        ) : (
                                                            initialsFromName(user.fullname)
                                                        )}
                                                        <span
                                                            className={`absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border border-[var(--semantic-surface)] ${
                                                                tone === 'recording'
                                                                    ? 'bg-[var(--semantic-danger)]'
                                                                    : tone === 'online'
                                                                      ? 'bg-[var(--semantic-success)]'
                                                                      : 'bg-[var(--semantic-text-muted)]'
                                                            }`}
                                                        />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="truncate font-semibold text-[var(--semantic-text-primary)]">{user.fullname}</p>
                                                        <p className="truncate text-xs text-[var(--semantic-text-muted)]">{user.email}</p>
                                                    </div>
                                                </div>
                                                <Badge variant={tone === 'recording' ? 'destructive' : tone === 'online' ? 'success' : 'secondary'}>
                                                    {tone === 'recording' ? 'Recording' : tone === 'online' ? 'Online' : 'Offline'}
                                                </Badge>
                                            </div>

                                            <div className="grid gap-2 rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-muted)] px-3 py-2.5 text-sm text-[var(--semantic-text-secondary)]">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <Clock className="h-3.5 w-3.5 text-[var(--semantic-text-muted)]" />
                                                        Last seen
                                                    </span>
                                                    <span className="font-medium text-[var(--semantic-text-primary)]">{formatLastSeen(status.last_heartbeat)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        {status.is_online ? <Wifi className="h-3.5 w-3.5 text-[var(--semantic-success)]" /> : <WifiOff className="h-3.5 w-3.5 text-[var(--semantic-text-muted)]" />}
                                                        Activity
                                                    </span>
                                                    <span className="font-medium text-[var(--semantic-text-primary)]">
                                                        {status.is_recording ? 'Recording' : status.is_online ? 'Idle' : 'Offline'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <BatteryIcon className="h-3.5 w-3.5" />
                                                        Battery
                                                    </span>
                                                    <span className="font-medium text-[var(--semantic-text-primary)]">
                                                        {battery.label}
                                                        <span className="ml-1 text-xs text-[var(--semantic-text-muted)]">({relativeTime(status.battery_updated_at)})</span>
                                                    </span>
                                                </div>
                                            </div>

                                            {assignedClient ? (
                                                <div className="rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-elevated)] px-3 py-2.5 text-sm">
                                                    <p className="inline-flex items-center gap-1.5 text-[var(--semantic-text-secondary)]">
                                                        <MapPin className="h-3.5 w-3.5 text-[var(--semantic-primary)]" />
                                                        Assigned client
                                                    </p>
                                                    <p className="mt-1 font-semibold text-[var(--semantic-text-primary)]">{assignedClient}</p>
                                                    {status.current_ticket ? (
                                                        <p className="mt-1 text-xs text-[var(--semantic-text-muted)]">
                                                            {formatVisitType(status.current_ticket.visit_type)} #{status.current_ticket.visit_number} · {status.current_ticket.is_draft ? 'Draft' : 'Live'}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            ) : null}

                                            <div className="flex items-center justify-between">
                                                <Badge variant="outline" className="capitalize">{user.role}</Badge>
                                                {status.is_recording ? (
                                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--semantic-danger)]">
                                                        <Mic className="h-3.5 w-3.5" />
                                                        Active recording
                                                    </span>
                                                ) : null}
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </section>
                    )}
                </div>
            </main>
        </AdminShell>
    );
}
