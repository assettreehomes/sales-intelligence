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
    selldo_agent_email?: string | null;
    selldo_team_name?: string | null;
    selldo_call_status?: string | null;
    selldo_direction?: string | null;
    selldo_enriched_at?: string | null;
    presales_agent_id?: string | null;
    presales_team_id?: string | null;
    call_outcome?: 'interested' | 'not_interested' | 'follow_up_required' | string | null;
    call_authenticity?: 'real' | 'fake' | string | null;
    is_flagged?: boolean;
    creator_details?: {
        fullname: string;
        avatar_url: string | null;
    };
}

interface Employee {
    id: string;
    fullname?: string;
    full_name?: string;
    email: string;
    avatar_url?: string | null;
    role?: string;
    team_id?: string | null;
}

interface PresalesTeam {
    id: string;
    name: string;
    team_leader_id?: string | null;
    team_leader?: Employee | null;
}

interface Filters {
    statusFilter: string;
    dateFilter: string;
    ratingFilter: string;
    customDateFrom: string;
    customDateTo: string;
    sortOrder: 'asc' | 'desc';
    agentFilter: string;
    teamFilter: string;
    teamLeaderFilter: string;
    outcomeFilter: string;
    authenticityFilter: string;
    callStatusFilter: string;
    directionFilter: string;
    searchQuery: string;
}

interface PresalesState {
    tickets: PresalesTicket[];
    employees: Employee[];
    teams: PresalesTeam[];
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
    fetchDirectory: () => Promise<void>;
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
    teamFilter:     'all',
    teamLeaderFilter: 'all',
    outcomeFilter: 'all',
    authenticityFilter: 'all',
    callStatusFilter: 'all',
    directionFilter: 'all',
    searchQuery:    '',
};

export const usePresalesStore = create<PresalesState>((set, get) => ({
    tickets: [],
    employees: [],
    teams: [],
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
            if (filters.agentFilter !== 'all')  params.append('presalesAgentId', filters.agentFilter);
            if (filters.teamFilter !== 'all')   params.append('presalesTeamId', filters.teamFilter);
            if (filters.teamLeaderFilter !== 'all') params.append('presalesTeamLeaderId', filters.teamLeaderFilter);
            if (filters.outcomeFilter !== 'all') params.append('callOutcome', filters.outcomeFilter);
            if (filters.authenticityFilter !== 'all') params.append('callAuthenticity', filters.authenticityFilter);
            if (filters.callStatusFilter !== 'all') params.append('callStatus', filters.callStatusFilter);
            if (filters.directionFilter !== 'all') params.append('direction', filters.directionFilter);
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
        await get().fetchDirectory();
    },

    fetchDirectory: async () => {
        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/presales/directory`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                set({ employees: data.employees || [], teams: data.teams || [], employeesLoaded: true });
            }
        } catch (error) {
            console.error('Failed to fetch presales directory:', error);
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
        void get().fetchTickets();
    },

    clearFilters: () => {
        set({ filters: { ...DEFAULT_FILTERS }, currentPage: 1 });
        void get().fetchTickets();
    },

    setPage: (page) => {
        set({ currentPage: page });
        void get().fetchTickets();
    },
}));
