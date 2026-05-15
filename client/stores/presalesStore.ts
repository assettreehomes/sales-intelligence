import { create } from 'zustand';
import { getToken, API_URL } from './authStore';
import { notifyError, notifySuccess } from '@/lib/toast';

export interface PresalesTicket {
    id: string;
    client_id: string;       // caller phone number
    clientname: string | null;
    visittype: string;       // always 'telecmi_call'
    visitnumber: number;
    status: string;
    rating: number | null;
    durationseconds: number | null;
    createdat: string;
    createdby: string | null;
    source: string;          // always 'telecmi'
    telecmi_cmiuid: string | null;
    telecmi_call_id?: string | null;
    telecmi_filename: string | null;
    telecmi_lead_id?: string | null;
    telecmi_user?: string | null;
    telecmi_direction?: string | null;
    selldo_call_id?: string | null;
    selldo_agent_name?: string | null;
    selldo_team_name?: string | null;
    selldo_call_status?: string | null;
    selldo_direction?: string | null;
    selldo_enriched_at?: string | null;
    is_flagged?: boolean;
    creator_details?: {
        fullname: string;
        avatar_url: string | null;
    };
}

interface Employee {
    id: string;
    fullname: string;
    email: string;
    avatar_url?: string | null;
}

interface Filters {
    statusFilter: string;
    dateFilter: string;
    ratingFilter: string;
    customDateFrom: string;
    customDateTo: string;
    sortOrder: 'asc' | 'desc';
    agentFilter: string;
    searchQuery: string;
}

interface PresalesState {
    tickets: PresalesTicket[];
    employees: Employee[];
    totalTickets: number;
    loading: boolean;
    syncing: boolean;

    filters: Filters;
    currentPage: number;
    ticketsPerPage: number;
    initialized: boolean;
    employeesLoaded: boolean;

    fetchTickets: () => Promise<void>;
    fetchEmployees: () => Promise<void>;
    syncTeleCMI: (opts?: { start_date?: number; end_date?: number }) => Promise<{ processed: number; skipped: number; failed: number }>;
    setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
    clearFilters: () => void;
    setPage: (page: number) => void;
}

const DEFAULT_FILTERS: Filters = {
    statusFilter:   'all',
    dateFilter:     'all',
    ratingFilter:   'all',
    customDateFrom: '',
    customDateTo:   '',
    sortOrder:      'desc',
    agentFilter:    'all',
    searchQuery:    '',
};

export const usePresalesStore = create<PresalesState>((set, get) => ({
    tickets: [],
    employees: [],
    totalTickets: 0,
    loading: false,
    syncing: false,
    filters: { ...DEFAULT_FILTERS },
    currentPage: 1,
    ticketsPerPage: 15,
    initialized: false,
    employeesLoaded: false,

    fetchTickets: async () => {
        set({ loading: true });
        try {
            const token = await getToken();
            const { filters, currentPage, ticketsPerPage } = get();

            const params = new URLSearchParams();
            // Always filter to telecmi source only
            params.append('source', 'telecmi');
            if (filters.statusFilter !== 'all') params.append('status', filters.statusFilter);
            if (filters.dateFilter !== 'all')   params.append('dateRange', filters.dateFilter);
            if (filters.ratingFilter !== 'all') params.append('ratingFilter', filters.ratingFilter);
            if (filters.customDateFrom)         params.append('dateFrom', filters.customDateFrom);
            if (filters.customDateTo)           params.append('dateTo', filters.customDateTo);
            if (filters.sortOrder)              params.append('sortOrder', filters.sortOrder);
            if (filters.agentFilter !== 'all')  params.append('createdBy', filters.agentFilter);
            if (filters.searchQuery)            params.append('search', filters.searchQuery);
            params.append('page',  currentPage.toString());
            params.append('limit', ticketsPerPage.toString());

            const response = await fetch(`${API_URL}/tickets?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.error || 'Failed to fetch pre-sales calls');
            }

            const data = await response.json();
            set({
                tickets:      data.tickets || [],
                totalTickets: data.total   || 0,
                initialized:  true,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to fetch pre-sales calls.';
            console.error('Failed to fetch presales tickets:', error);
            notifyError(message, { toastId: 'presales-fetch-error' });
        } finally {
            set({ loading: false });
        }
    },

    fetchEmployees: async () => {
        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/users?role=employee`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                set({ employees: data.users || [], employeesLoaded: true });
            }
        } catch (error) {
            console.error('Failed to fetch employees:', error);
        }
    },

    syncTeleCMI: async (opts = {}) => {
        set({ syncing: true });
        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/telecmi/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(opts)
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Sync failed');

            notifySuccess(
                `Sync complete — ${data.processed} new calls queued for analysis, ${data.skipped} skipped`,
                { toastId: 'telecmi-sync-success' }
            );

            // Refresh list after sync
            await get().fetchTickets();

            return { processed: data.processed || 0, skipped: data.skipped || 0, failed: data.failed || 0 };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'TeleCMI sync failed';
            notifyError(message, { toastId: 'telecmi-sync-error' });
            return { processed: 0, skipped: 0, failed: 1 };
        } finally {
            set({ syncing: false });
        }
    },

    setFilter: (key, value) => {
        set(state => ({ filters: { ...state.filters, [key]: value }, currentPage: 1 }));
    },

    clearFilters: () => {
        set({ filters: { ...DEFAULT_FILTERS }, currentPage: 1 });
    },

    setPage: (page) => {
        set({ currentPage: page });
    },
}));
