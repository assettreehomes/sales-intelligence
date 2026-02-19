'use client';

import { useState, useEffect } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { getToken, API_URL } from '@/stores/authStore';
import { Loader2, User, Mic, Wifi, WifiOff, Clock } from 'lucide-react';

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
        last_heartbeat: string | null;
    };
}

export default function LiveStatusPage() {
    const [statuses, setStatuses] = useState<EmployeeStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

    const fetchStatus = async () => {
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
    };

    useEffect(() => {
        void fetchStatus();
        const interval = setInterval(() => { void fetchStatus(); }, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []);

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
                    {statuses.map(({ user, status }) => (
                        <div
                            key={user.id}
                            className={`relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${status.is_online ? 'border-green-200' : 'border-gray-100 opacity-75'
                                }`}
                        >
                            {/* Status Indicator Bar */}
                            <div className={`absolute top-0 left-0 h-1 w-full ${status.is_online ? 'bg-green-500' : 'bg-gray-200'}`} />

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
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 tool-tip" title="Online">
                                        <Wifi className="h-3.5 w-3.5 text-green-600" />
                                    </div>
                                ) : (
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 tool-tip" title="Offline">
                                        <WifiOff className="h-3.5 w-3.5 text-gray-400" />
                                    </div>
                                )}
                            </div>

                            <div className="mt-5 space-y-3">
                                {/* Status Badge */}
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</span>
                                    {status.is_online ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 border border-green-100">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                            </span>
                                            Online
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                                            Offline
                                        </span>
                                    )}
                                </div>

                                {/* Current Activity / Recording */}
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Activity</span>
                                    {status.is_recording ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 border border-red-100 animate-pulse">
                                            <Mic className="h-3 w-3 fill-red-600 text-red-600" />
                                            Reading Script...
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-400 italic">Idle</span>
                                    )}
                                </div>

                                {/* Last Seen */}
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
