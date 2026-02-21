'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { getToken, API_URL } from '@/stores/authStore';
import {
    Loader2, User, Mic, Wifi, WifiOff, Clock,
    BatteryLow, BatteryMedium, BatteryFull, BatteryWarning,
    MapPin, FileText, Radio
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
    if (!iso) return '';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 10) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return new Date(iso).toLocaleTimeString();
}

function formatVisitType(raw: string): string {
    return raw.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BatteryIndicator({ level, updatedAt }: { level: number | null; updatedAt: string | null }) {
    if (level === null) return null;
    const color = level >= 50 ? 'text-green-600' : level >= 20 ? 'text-amber-500' : 'text-red-500';
    const BgColor = level >= 50 ? 'bg-green-50' : level >= 20 ? 'bg-amber-50' : 'bg-red-50';
    const BorderColor = level >= 50 ? 'border-green-100' : level >= 20 ? 'border-amber-100' : 'border-red-100';
    const Icon = level >= 75 ? BatteryFull : level >= 50 ? BatteryMedium : level >= 20 ? BatteryLow : BatteryWarning;

    return (
        <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Battery</span>
            <div className={`flex items-center gap-1.5 rounded-full ${BgColor} border ${BorderColor} px-2.5 py-1`}>
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <span className={`text-xs font-semibold ${color}`}>{level}%</span>
                {updatedAt && (
                    <span className="text-xs text-gray-400 ml-0.5">{relativeTime(updatedAt)}</span>
                )}
            </div>
        </div>
    );
}

function ActivityBadge({ isRecording }: { isRecording: boolean }) {
    if (isRecording) {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 border border-red-100 animate-pulse">
                <Mic className="h-3 w-3 fill-red-600 text-red-600" />
                Recording
            </span>
        );
    }
    return <span className="text-xs text-gray-400 italic">Idle</span>;
}

function AssignedRow({ ticket, clientId }: { ticket: CurrentTicket | null; clientId: string | null }) {
    const label = ticket?.client_name ?? clientId;
    if (!label) return null;

    return (
        <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex-shrink-0 mt-0.5">Assigned</span>
            <div className="flex flex-col items-end gap-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="h-3 w-3 text-purple-400 flex-shrink-0" />
                    <span className="text-xs font-medium text-gray-800 truncate max-w-[130px]">{label}</span>
                </div>
                {ticket && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400">
                            {formatVisitType(ticket.visit_type)} #{ticket.visit_number}
                        </span>
                        {ticket.is_draft ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 border border-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                <FileText className="h-2.5 w-2.5" />
                                Draft
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-green-50 border border-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LiveStatusPage() {
    const [statuses, setStatuses] = useState<EmployeeStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

    const fetchStatus = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;

            const res = await fetch(`${API_URL}/employee/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setStatuses(data.statuses);
                setLastUpdated(new Date());
            }
        } catch (error) {
            console.error('Failed to fetch status:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchStatus();
        const interval = setInterval(() => { void fetchStatus(); }, 10000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    // Sort: online employees first
    const sorted = [...statuses].sort((a, b) =>
        Number(b.status.is_online) - Number(a.status.is_online)
    );

    return (
        <AdminShell activeSection="live">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Live Employee Status</h1>
                    <p className="text-sm text-gray-500">Real-time monitoring of team activity</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Updated: {lastUpdated.toLocaleTimeString()}</span>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {sorted.map(({ user, status }) => (
                        <div
                            key={user.id}
                            className={`relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${status.is_online ? 'border-green-200' : 'border-gray-100 opacity-75'
                                }`}
                        >
                            {/* Online indicator bar */}
                            <div className={`absolute top-0 left-0 h-1 w-full ${status.is_online ? 'bg-green-500' : 'bg-gray-200'}`} />

                            {/* Header: avatar + name + wifi */}
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`flex h-12 w-12 items-center justify-center rounded-full border-2 ${status.is_online ? 'border-green-100 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                                        {user.avatar_url ? (
                                            <img src={user.avatar_url} alt={user.fullname} className="h-full w-full rounded-full object-cover" />
                                        ) : (
                                            <User className={`h-6 w-6 ${status.is_online ? 'text-green-600' : 'text-gray-400'}`} />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900">{user.fullname}</h3>
                                        <p className="text-xs text-gray-500">{user.email}</p>
                                    </div>
                                </div>

                                {status.is_online ? (
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100" title="Online">
                                        <Wifi className="h-3.5 w-3.5 text-green-600" />
                                    </div>
                                ) : (
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100" title="Offline">
                                        <WifiOff className="h-3.5 w-3.5 text-gray-400" />
                                    </div>
                                )}
                            </div>

                            <div className="mt-5 space-y-3">
                                {/* Status badge */}
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</span>
                                    {status.is_online ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 border border-green-100">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                                            </span>
                                            Online
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                                            Offline
                                        </span>
                                    )}
                                </div>

                                {/* Activity: Recording / Idle */}
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Activity</span>
                                    <ActivityBadge isRecording={status.is_recording} />
                                </div>

                                {/* Assigned ticket/client (only when online + has context) */}
                                {status.is_online && (status.current_ticket || status.current_client_id) && (
                                    <AssignedRow
                                        ticket={status.current_ticket}
                                        clientId={status.current_client_id}
                                    />
                                )}

                                {/* Battery (only when online + battery reported) */}
                                {status.is_online && (
                                    <BatteryIndicator
                                        level={status.battery_level}
                                        updatedAt={status.battery_updated_at}
                                    />
                                )}

                                {/* Last seen (offline only) */}
                                {!status.is_online && status.last_heartbeat && (
                                    <div className="pt-2 mt-2 border-t border-gray-50 flex items-center gap-1.5 text-xs text-gray-400">
                                        <Clock className="h-3 w-3" />
                                        <span>Last seen: {new Date(status.last_heartbeat).toLocaleString()}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {statuses.length === 0 && (
                        <div className="col-span-full py-12 text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 mb-4">
                                <User className="h-8 w-8 text-gray-300" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900">No Employees Found</h3>
                            <p className="text-gray-500 mt-1">No users with &apos;employee&apos; or &apos;intern&apos; role found.</p>
                        </div>
                    )}
                </div>
            )}
        </AdminShell>
    );
}
