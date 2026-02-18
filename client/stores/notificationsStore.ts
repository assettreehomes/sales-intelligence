import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { API_URL, getToken } from './authStore';

const NOTIFICATION_STORAGE_KEY = 'ticketintel-notifications';
const MAX_NOTIFICATIONS = 120;

interface ExcuseQueueItem {
    id: string;
    ticket_id: string;
    reason: string;
    reason_details?: string | null;
    status: string;
    submitted_at: string;
    employee?: {
        fullname?: string | null;
        email?: string | null;
    } | null;
}

export interface QueueNotification {
    id: string;
    excuseId: string;
    ticketId: string;
    title: string;
    message: string;
    createdAt: string;
    route: string;
    read: boolean;
    source: 'excuse_queue';
    status: string;
}

type SyncResult = {
    newCount: number;
    totalPending: number;
    error?: string;
};

interface NotificationsState {
    items: QueueNotification[];
    syncing: boolean;
    lastSyncedAt: number | null;
    syncPendingExcuses: () => Promise<SyncResult>;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    clearAll: () => void;
}

function formatExcuseReason(reason: string) {
    const labels: Record<string, string> = {
        client_unavailable: 'Client unavailable',
        technical_issues: 'Technical issues',
        travel_delay: 'Travel delay',
        meeting_rescheduled: 'Meeting rescheduled',
        emergency: 'Emergency',
        other: 'Other'
    };
    return labels[reason] || reason.replaceAll('_', ' ');
}

function getTicketCode(ticketId: string) {
    return `#${String(ticketId || '').slice(0, 4).toUpperCase()}`;
}

function makeQueueNotification(excuse: ExcuseQueueItem, existing?: QueueNotification): QueueNotification {
    const ticketCode = getTicketCode(excuse.ticket_id);
    const employeeName = excuse.employee?.fullname?.trim() || 'Employee';
    const reason = excuse.reason_details?.trim() || formatExcuseReason(excuse.reason);

    return {
        id: existing?.id || `excuse:${excuse.id}`,
        excuseId: excuse.id,
        ticketId: excuse.ticket_id,
        title: `Queue Alert ${ticketCode}`,
        message: `${employeeName}: ${reason}`,
        createdAt: excuse.submitted_at || existing?.createdAt || new Date().toISOString(),
        route: `/admin/excuses?focus=${excuse.id}`,
        read: existing?.read ?? false,
        source: 'excuse_queue',
        status: excuse.status || 'pending'
    };
}

function sortNotifications(items: QueueNotification[]) {
    return [...items].sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
}

export const useNotificationsStore = create<NotificationsState>()(
    persist(
        (set, get) => ({
            items: [],
            syncing: false,
            lastSyncedAt: null,

            syncPendingExcuses: async () => {
                set({ syncing: true });
                try {
                    const token = await getToken();
                    if (!token) {
                        set({ syncing: false, lastSyncedAt: Date.now() });
                        return { newCount: 0, totalPending: 0 };
                    }

                    const response = await fetch(`${API_URL}/excuses?status=pending`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    const payload = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        throw new Error(payload.error || 'Failed to sync queue notifications');
                    }

                    const pendingExcuses = (payload.excuses || []) as ExcuseQueueItem[];
                    const existingItems = get().items;
                    const existingByExcuse = new Map(existingItems.map((item) => [item.excuseId, item]));
                    const pendingIds = new Set(pendingExcuses.map((excuse) => excuse.id));

                    let newCount = 0;
                    const freshPendingItems: QueueNotification[] = pendingExcuses.map((excuse) => {
                        const existing = existingByExcuse.get(excuse.id);
                        if (!existing) newCount += 1;
                        return makeQueueNotification(excuse, existing);
                    });

                    // Keep non-pending history for context in dropdown.
                    const historical = existingItems.filter((item) => !pendingIds.has(item.excuseId));
                    const merged = sortNotifications([...freshPendingItems, ...historical]).slice(0, MAX_NOTIFICATIONS);

                    set({
                        items: merged,
                        syncing: false,
                        lastSyncedAt: Date.now()
                    });

                    return { newCount, totalPending: pendingExcuses.length };
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Failed to sync queue notifications';
                    set({ syncing: false, lastSyncedAt: Date.now() });
                    return { newCount: 0, totalPending: 0, error: message };
                }
            },

            markAsRead: (id) => {
                set((state) => ({
                    items: state.items.map((item) => (item.id === id ? { ...item, read: true } : item))
                }));
            },

            markAllAsRead: () => {
                set((state) => ({
                    items: state.items.map((item) => ({ ...item, read: true }))
                }));
            },

            clearAll: () => {
                set({ items: [] });
            }
        }),
        {
            name: NOTIFICATION_STORAGE_KEY,
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                items: state.items
            })
        }
    )
);
