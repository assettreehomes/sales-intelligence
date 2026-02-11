import { create } from 'zustand';
import { getToken, API_URL } from './authStore';

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
}

interface Employee {
    id: string;
    fullname: string;
    email: string;
}

interface Filters {
    statusFilter: string;
    dateFilter: string;
    agentFilter: string;
    searchQuery: string;
    showLiveOnly: boolean;
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
    setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
    clearFilters: () => void;
    setPage: (page: number) => void;
}

const DEFAULT_FILTERS: Filters = {
    statusFilter: 'all',
    dateFilter: '30days',
    agentFilter: 'all',
    searchQuery: '',
    showLiveOnly: false,
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
            if (filters.agentFilter !== 'all') params.append('createdBy', filters.agentFilter);
            if (filters.showLiveOnly) params.append('liveOnly', 'true');
            if (filters.searchQuery) params.append('search', filters.searchQuery);
            params.append('page', currentPage.toString());
            params.append('limit', ticketsPerPage.toString());

            const response = await fetch(`${API_URL}/tickets?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                set({
                    tickets: data.tickets || [],
                    totalTickets: data.total || 0,
                    initialized: true,
                });
            }
        } catch (error) {
            console.error('Failed to fetch tickets:', error);
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
