import { create } from 'zustand';
import { getToken, API_URL } from './authStore';
import { notifyError, notifySuccess } from '@/lib/toast';

interface Ticket {
    id: string;
    client_id: string;
    clientname: string | null;
    visittype: string;
    visitnumber: number;
    status: string;
    rating: number | null;
    istrainingcall: boolean;
    createdat: string;
    durationseconds: number | null;
    createdby: string;
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
    showLiveOnly: boolean;
    showFlaggedOnly: boolean;
}

interface TicketsState {
    // Data
    tickets: Ticket[];
    employees: Employee[];
    totalTickets: number;
    loading: boolean;

    // Filters
    filters: Filters;
    currentPage: number;
    ticketsPerPage: number;

    // Whether initial data has been loaded (prevents re-fetch on navigation back)
    initialized: boolean;
    employeesLoaded: boolean;

    // Actions
    fetchTickets: () => Promise<void>;
    fetchEmployees: () => Promise<void>;
    deleteTicket: (id: string) => Promise<boolean>;
    setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
    clearFilters: () => void;
    setPage: (page: number) => void;
}

const DEFAULT_FILTERS: Filters = {
    statusFilter: 'all',
    dateFilter: '30days',
    ratingFilter: 'all',
    customDateFrom: '',
    customDateTo: '',
    sortOrder: 'desc',
    agentFilter: 'all',
    searchQuery: '',
    showLiveOnly: false,
    showFlaggedOnly: false,
};

export const useTicketsStore = create<TicketsState>((set, get) => ({
    // Initial state
    tickets: [],
    employees: [],
    totalTickets: 0,
    loading: false,
    filters: { ...DEFAULT_FILTERS },
    currentPage: 1,
    ticketsPerPage: 12,
    initialized: false,
    employeesLoaded: false,

    fetchTickets: async () => {
        set({ loading: true });
        try {
            const token = await getToken();
            const { filters, currentPage, ticketsPerPage } = get();

            const params = new URLSearchParams();
            if (filters.statusFilter !== 'all') params.append('status', filters.statusFilter);
            if (filters.dateFilter !== 'all') params.append('dateRange', filters.dateFilter);
            if (filters.ratingFilter !== 'all') params.append('ratingFilter', filters.ratingFilter);
            if (filters.customDateFrom) params.append('dateFrom', filters.customDateFrom);
            if (filters.customDateTo) params.append('dateTo', filters.customDateTo);
            if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
            if (filters.agentFilter !== 'all') params.append('createdBy', filters.agentFilter);
            if (filters.showLiveOnly) params.append('liveOnly', 'true');
            if (filters.showFlaggedOnly) params.append('flaggedOnly', 'true');
            if (filters.searchQuery) params.append('search', filters.searchQuery);
            params.append('page', currentPage.toString());
            params.append('limit', ticketsPerPage.toString());

            const response = await fetch(`${API_URL}/tickets?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.error || 'Failed to fetch tickets');
            }

            const data = await response.json();
            set({
                tickets: data.tickets || [],
                totalTickets: data.total || 0,
                initialized: true,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to fetch tickets. Please try again.';
            console.error('Failed to fetch tickets:', error);
            notifyError(message, { toastId: 'tickets-fetch-error' });
        } finally {
            set({ loading: false });
        }
    },

    fetchEmployees: async () => {
        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/users?role=employee`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                set({ employees: data.users || [], employeesLoaded: true });
            }
        } catch (error) {
            console.error('Failed to fetch employees:', error);
            notifyError('Failed to fetch employees.', { toastId: 'employees-fetch-error' });
        }
    },

    deleteTicket: async (id: string) => {
        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/tickets/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete ticket');
            }

            set((state) => ({
                tickets: state.tickets.filter((ticket) => ticket.id !== id),
                totalTickets: Math.max(0, state.totalTickets - 1)
            }));

            notifySuccess('Ticket deleted successfully.');
            return true;
        } catch (error) {
            console.error('Delete ticket error:', error);
            notifyError(error instanceof Error ? error.message : 'Failed to delete ticket');
            return false;
        }
    },

    setFilter: (key, value) => {
        set((state) => ({
            filters: { ...state.filters, [key]: value },
            currentPage: 1, // Reset to page 1 on filter change
        }));
    },

    clearFilters: () => {
        set({ filters: { ...DEFAULT_FILTERS }, currentPage: 1 });
    },

    setPage: (page) => {
        set({ currentPage: page });
    },
}));
