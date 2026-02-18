'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useNotificationsStore } from '@/stores/notificationsStore';
import { notifyError, notifyInfo } from '@/lib/toast';
import { playNotificationTone } from '@/lib/sound';

const POLL_INTERVAL_MS = 30000;

function formatRelativeTime(value: string) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return 'just now';

    const diffMs = Date.now() - timestamp;
    const diffMins = Math.max(1, Math.floor(diffMs / 60000));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
}

interface NotificationBellProps {
    className?: string;
}

export function NotificationBell({ className = '' }: NotificationBellProps) {
    const router = useRouter();
    const {
        items,
        syncing,
        syncPendingExcuses,
        markAsRead,
        markAllAsRead
    } = useNotificationsStore();

    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    const unreadCount = useMemo(
        () => items.filter((item) => !item.read).length,
        [items]
    );

    const syncNotifications = useCallback(async () => {
        const result = await syncPendingExcuses();

        if (result.error) {
            notifyError(result.error, { toastId: 'queue-sync-error' });
            return;
        }

        if (result.newCount > 0) {
            await playNotificationTone().catch(() => undefined);
            notifyInfo(
                `${result.newCount} new excuse queue notification${result.newCount > 1 ? 's' : ''}`,
                { toastId: `queue-new-${Date.now()}` }
            );
        }
    }, [syncPendingExcuses]);

    useEffect(() => {
        void syncNotifications();
        const timer = setInterval(() => {
            void syncNotifications();
        }, POLL_INTERVAL_MS);

        return () => clearInterval(timer);
    }, [syncNotifications]);

    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [open]);

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Open notifications"
            >
                <Bell className="w-5 h-5 text-gray-600" />
                {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                        <div>
                            <p className="text-sm font-semibold text-gray-900">Notifications</p>
                            <p className="text-xs text-gray-500">
                                {unreadCount} unread • queue updates
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={markAllAsRead}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Mark All
                        </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                        {syncing && items.length === 0 ? (
                            <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading notifications...
                            </div>
                        ) : items.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-gray-500">
                                No queue notifications right now.
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {items.map((item) => (
                                    <div key={item.id} className="px-4 py-3">
                                        <button
                                            type="button"
                                            className="block w-full rounded-lg p-2 text-left transition-colors hover:bg-gray-50"
                                            onClick={() => {
                                                markAsRead(item.id);
                                                setOpen(false);
                                                router.push(item.route);
                                            }}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                                                {!item.read && (
                                                    <span className="mt-0.5 inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                                                        New
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 text-xs leading-5 text-gray-600">{item.message}</p>
                                            <div className="mt-2 flex items-center justify-between">
                                                <span className="text-[11px] text-gray-500">
                                                    {formatRelativeTime(item.createdAt)}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        markAsRead(item.id);
                                                        setOpen(false);
                                                        router.push(`/admin/tickets/${item.ticketId}`);
                                                    }}
                                                    className="text-[11px] font-semibold text-purple-600 hover:text-purple-700"
                                                >
                                                    Open Ticket
                                                </button>
                                            </div>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-gray-200 px-4 py-2.5">
                        <Link
                            href="/admin/excuses"
                            onClick={() => setOpen(false)}
                            className="text-xs font-semibold text-purple-600 hover:text-purple-700"
                        >
                            View Excuse Approval Queue
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
