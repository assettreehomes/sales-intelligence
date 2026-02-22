'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { getToken, API_URL } from '@/stores/authStore';
import {
    Loader2,
    User,
    Mic,
    Wifi,
    WifiOff,
    Clock,
    BatteryLow,
    BatteryMedium,
    BatteryFull,
    BatteryWarning,
    MapPin,
    FileText,
    Radio,
    Users,
    RefreshCw
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
        role: string;
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

type BatteryTone = 'good' | 'warn' | 'critical' | 'unknown';

interface BatteryState {
    level: number | null;
    tone: BatteryTone;
    icon: LucideIcon;
    label: string;
}

function relativeTime(iso: string | null): string {
    if (!iso) return '';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 10) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatLastSeen(iso: string | null): string {
    if (!iso) return 'Awaiting signal';
    const dt = new Date(iso);
    const today = new Date();
    const sameDay = dt.toDateString() === today.toDateString();
    if (sameDay) {
        return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return dt.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function formatVisitType(raw: string): string {
    return raw.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function initialsFromName(name: string): string {
    const cleaned = name.trim();
    if (!cleaned) return 'NA';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    return parts
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || cleaned.slice(0, 2).toUpperCase();
}

function getBatteryState(level: number | null | undefined): BatteryState {
    const normalizedLevel = typeof level === 'number' && Number.isFinite(level)
        ? Math.max(0, Math.min(100, Math.round(level)))
        : null;

    const tone: BatteryTone = normalizedLevel === null
        ? 'unknown'
        : normalizedLevel >= 70
            ? 'good'
            : normalizedLevel >= 35
                ? 'warn'
                : 'critical';

    const icon = normalizedLevel === null
        ? BatteryWarning
        : normalizedLevel >= 80
            ? BatteryFull
            : normalizedLevel >= 50
                ? BatteryMedium
                : normalizedLevel >= 20
                    ? BatteryLow
                    : BatteryWarning;

    return {
        level: normalizedLevel,
        tone,
        icon,
        label: normalizedLevel === null ? 'Not reported' : `${normalizedLevel}%`
    };
}

function BatteryIndicator({ level, updatedAt }: { level: number | null | undefined; updatedAt: string | null }) {
    const batteryState = getBatteryState(level);
    const Icon = batteryState.icon;

    return (
        <div className="live-meta-row">
            <span className="live-meta-label">Battery</span>
            <div className={`live-battery-pill is-${batteryState.tone}`}>
                <Icon className="h-3.5 w-3.5" />
                <span className="live-battery-value">{batteryState.label}</span>
                {updatedAt && <span className="live-battery-time">{relativeTime(updatedAt)}</span>}
            </div>
        </div>
    );
}

function ActivityBadge({ isRecording, isOnline }: { isRecording: boolean; isOnline: boolean }) {
    if (isRecording) {
        return (
            <span className="live-activity-pill is-recording">
                <Mic className="h-3 w-3 fill-current" />
                Recording
            </span>
        );
    }

    if (isOnline) {
        return (
            <span className="live-activity-pill is-idle">
                <span className="live-activity-dot" />
                Idle
            </span>
        );
    }

    return <span className="live-activity-pill is-offline">Idle</span>;
}

function AssignedRow({ ticket, clientId }: { ticket: CurrentTicket | null; clientId: string | null }) {
    const label = ticket?.client_name ?? clientId;
    if (!label) return null;

    return (
        <div className="live-meta-row is-assigned">
            <span className="live-meta-label">Assigned</span>
            <div className="live-assigned-wrap">
                <div className="live-assigned-client-wrap">
                    <MapPin className="h-3 w-3 live-assigned-icon" />
                    <span className="live-assigned-client">{label}</span>
                </div>
                {ticket && (
                    <div className="live-assigned-ticket">
                        <span className="live-assigned-ticket-info">
                            {formatVisitType(ticket.visit_type)} #{ticket.visit_number}
                        </span>
                        {ticket.is_draft ? (
                            <span className="live-mini-pill is-draft">
                                <FileText className="h-2.5 w-2.5" />
                                Draft
                            </span>
                        ) : (
                            <span className="live-mini-pill is-live">
                                <Radio className="h-2.5 w-2.5" />
                                Live
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function LiveStatusPage() {
    const [statuses, setStatuses] = useState<EmployeeStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [updatedPulse, setUpdatedPulse] = useState(false);
    const [avatarErrorMap, setAvatarErrorMap] = useState<Record<string, boolean>>({});
    const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const triggerUpdatePulse = () => {
        setUpdatedPulse(true);
        if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
        pulseTimeoutRef.current = setTimeout(() => {
            setUpdatedPulse(false);
        }, 1100);
    };

    const fetchStatus = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;

            const res = await fetch(`${API_URL}/employee/status`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
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

    const sorted = [...statuses].sort((a, b) => Number(b.status.is_online) - Number(a.status.is_online));
    const onlineCount = sorted.filter((entry) => entry.status.is_online).length;
    const recordingCount = sorted.filter((entry) => entry.status.is_online && entry.status.is_recording).length;

    return (
        <AdminShell activeSection="live">
            <section className={`live-status-page ${updatedPulse ? 'is-fresh' : ''}`}>
                <div className="live-status-head">
                    <div className="live-status-copy">
                        <h1 className="live-status-title">Live Employee Status</h1>
                        <p className="live-status-subtitle">Real-time monitoring of team activity</p>
                    </div>

                    <div className="live-status-metrics">
                        <div className="live-status-chip is-team">
                            <Users className="h-3.5 w-3.5" />
                            <span className="live-status-chip-label">Team</span>
                            <span className={`live-status-chip-value ${updatedPulse ? 'is-fresh' : ''}`}>{sorted.length}</span>
                        </div>
                        <div className="live-status-chip is-online">
                            <Wifi className="h-3.5 w-3.5" />
                            <span className="live-status-chip-label">Online</span>
                            <span className={`live-status-chip-value ${updatedPulse ? 'is-fresh' : ''}`}>{onlineCount}</span>
                        </div>
                        <div className="live-status-chip is-recording">
                            <Mic className="h-3.5 w-3.5" />
                            <span className="live-status-chip-label">Recording</span>
                            <span className={`live-status-chip-value ${updatedPulse ? 'is-fresh' : ''}`}>{recordingCount}</span>
                        </div>
                    </div>

                    <div className="live-status-updated" aria-live="polite">
                        <RefreshCw className={`live-status-refresh-icon ${updatedPulse ? 'is-refreshing' : ''}`} />
                        <span className="live-status-live-indicator">
                            <span className="live-status-live-dot" />
                            Live
                        </span>
                        <span className="live-status-updated-time">{lastUpdated.toLocaleTimeString()}</span>
                    </div>
                </div>

                {loading ? (
                    <div className="live-status-loading">
                        <Loader2 className="live-status-loading-spinner" />
                        <span className="live-status-loading-text">Syncing employee heartbeat...</span>
                    </div>
                ) : (
                    <div className="live-status-grid">
                        {sorted.map(({ user, status }, index) => {
                            const stateTone = status.is_recording ? 'recording' : status.is_online ? 'online' : 'offline';
                            const lastSeen = formatLastSeen(status.last_heartbeat);
                            const batteryState = getBatteryState(status.battery_level);
                            const BatteryIcon = batteryState.icon;
                            const showAvatarImage = Boolean(user.avatar_url) && !avatarErrorMap[user.id];
                            const initials = initialsFromName(user.fullname);

                            return (
                                <article
                                    key={user.id}
                                    className={`live-status-card is-${stateTone}`}
                                    style={{ animationDelay: `${Math.min(index * 48, 320)}ms` }}
                                >
                                    <span className={`live-status-rail is-${stateTone}`} />

                                    <div className="live-card-head">
                                        <div className="live-card-user">
                                            <div className={`live-avatar is-${stateTone}`}>
                                                {showAvatarImage ? (
                                                    <img
                                                        src={user.avatar_url}
                                                        alt={user.fullname}
                                                        className="live-avatar-image"
                                                        onError={() => {
                                                            setAvatarErrorMap((prev) => ({ ...prev, [user.id]: true }));
                                                        }}
                                                    />
                                                ) : (
                                                    <span className="live-avatar-initials">{initials}</span>
                                                )}
                                                <span className={`live-avatar-signal is-${stateTone}`} />
                                            </div>
                                            <div className="live-user-copy">
                                                <h3 className="live-employee-name">{user.fullname}</h3>
                                                <p className="live-employee-email">{user.email}</p>
                                            </div>
                                        </div>

                                        <div className={`live-head-status is-${stateTone}`}>
                                            <span className="live-head-status-main">
                                                {status.is_online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                                                {status.is_recording ? 'Recording' : status.is_online ? 'Online' : 'Offline'}
                                            </span>
                                            {!status.is_online && (
                                                <span className="live-head-status-meta">
                                                    <Clock className="h-3 w-3" />
                                                    Seen {lastSeen}
                                                </span>
                                            )}
                                            {status.is_online && (
                                                <span className={`live-head-status-meta is-battery is-${batteryState.tone}`}>
                                                    <BatteryIcon className="h-3 w-3" />
                                                    {batteryState.label}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="live-card-body">
                                        <div className="live-activity-block">
                                            <span className="live-block-label">Activity:</span>
                                            <ActivityBadge isRecording={status.is_recording} isOnline={status.is_online} />
                                        </div>

                                        {status.is_online && (status.current_ticket || status.current_client_id) && (
                                            <AssignedRow ticket={status.current_ticket} clientId={status.current_client_id} />
                                        )}

                                        {status.is_online && (
                                            <BatteryIndicator level={status.battery_level} updatedAt={status.battery_updated_at} />
                                        )}
                                    </div>

                                    {status.is_recording && (
                                        <span className="live-recording-ribbon">
                                            <Mic className="h-3 w-3 fill-current" />
                                            Recording
                                        </span>
                                    )}
                                </article>
                            );
                        })}

                        {statuses.length === 0 && (
                            <div className="live-status-empty">
                                <div className="live-status-empty-icon">
                                    <User className="h-8 w-8" />
                                </div>
                                <h3 className="live-status-empty-title">No Employees Found</h3>
                                <p className="live-status-empty-text">No users with &apos;employee&apos; or &apos;intern&apos; role found.</p>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </AdminShell>
    );
}
