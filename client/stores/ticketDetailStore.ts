import { create } from 'zustand';
import { getToken, API_URL } from './authStore';
import { notifyError } from '@/lib/toast';

interface Analysis {
    id: string;
    summary: string;
    rating: number;
    scores: {
        politeness?: number;
        confidence?: number;
        interest?: string;
        speakers?: number;
        [key: string]: unknown;
    };
    // Top-level fallbacks (old Gemini format)
    politeness_score?: number;
    confidence_score?: number;
    customer_interest_level?: string;
    speakers_detected?: number;
    keymoments: Array<{
        time?: string;
        timestamp?: string;
        label?: string;
        description?: string;
        sentiment: 'positive' | 'negative' | 'neutral';
    }>;
    improvementsuggestions: string[];
    objections: (string | { objection: string; response?: string; effectiveness?: string })[];
    actionitems: (string | { item: string } | { action: string })[];
    comparisonwithprevious?: {
        improvements?: string[];
        regressions?: string[];
        unchanged?: string[];
        delta_score?: number;
        key_differences?: string[];
        overall_narrative?: string;
        score_changes?: Record<string, {
            current?: number;
            previous?: number;
            change?: number;
        }>;
    } | null;
}

interface Ticket {
    id: string;
    client_id: string;
    clientname: string | null;
    visittype: string;
    visitnumber: number;
    status: string;
    createdat: string;
    createdby: string;
}

interface TicketExcuse {
    id: string;
    ticket_id: string;
    employee_id: string;
    reason: string;
    reason_details: string | null;
    estimated_time_minutes: number | null;
    estimated_start_time: string | null;
    status: 'pending' | 'accepted' | 'rejected' | string;
    submitted_at: string;
    reviewed_at: string | null;
    admin_notes: string | null;
    employee: {
        fullname: string;
        email: string;
    } | null;
}

interface TicketActionItem {
    id: string;
    ticket_id: string;
    assigned_to: string | null;
    title: string;
    description: string | null;
    due_date: string | null;
    completed: boolean;
    completed_at: string | null;
    completed_by: string | null;
    created_by: string | null;
    created_at: string | null;
}

interface TicketComparison {
    keys: string[];
    labels: string[];
    current: number[];
    previous: number[];
    delta_score: number | null;
}

type ReanalyzeStatus = 'idle' | 'analyzing' | 'analyzed' | 'failed';

interface TicketDetailState {
    // Data
    ticket: Ticket | null;
    analysis: Analysis | null;
    previousAnalysis: Analysis | null;
    comparison: TicketComparison | null;
    actionItemsDb: TicketActionItem[];
    excuses: TicketExcuse[];
    audioUrl: string | null;
    loading: boolean;

    // Re-analyze
    reanalyzeStatus: ReanalyzeStatus;
    isReanalyzeModalOpen: boolean;

    // Audio player
    isPlaying: boolean;
    currentTime: number;
    duration: number;

    // Currently loaded ticket ID (to detect when we need to refetch)
    currentTicketId: string | null;

    // Actions
    fetchTicket: (id: string) => Promise<void>;
    fetchAudioUrl: (id: string, forceRefresh?: boolean) => Promise<string | null>;
    reanalyze: (id: string) => Promise<void>;
    setReanalyzeModalOpen: (open: boolean) => void;
    setIsPlaying: (playing: boolean) => void;
    setCurrentTime: (time: number) => void;
    setDuration: (duration: number) => void;
    reset: () => void;
}

export const useTicketDetailStore = create<TicketDetailState>((set, get) => ({
    // Initial state
    ticket: null,
    analysis: null,
    previousAnalysis: null,
    comparison: null,
    actionItemsDb: [],
    excuses: [],
    audioUrl: null,
    loading: true,
    reanalyzeStatus: 'idle',
    isReanalyzeModalOpen: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    currentTicketId: null,

    fetchTicket: async (id: string) => {
        // If we already have this ticket loaded, skip the fetch
        if (get().currentTicketId === id && get().ticket) {
            set({ loading: false });
            return;
        }

        set({ loading: true, currentTicketId: id });
        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/tickets/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                set({
                    ticket: data.ticket,
                    analysis: data.analysis,
                    previousAnalysis: data.previous_analysis || null,
                    comparison: data.comparison || null,
                    actionItemsDb: data.action_items_db || [],
                    excuses: data.excuses || [],
                    audioUrl: null,
                });
            }
        } catch (error) {
            console.error('Failed to fetch ticket details:', error);
            notifyError('Failed to fetch ticket details.', { toastId: 'ticket-detail-fetch-error' });
        } finally {
            set({ loading: false });
        }
    },

    fetchAudioUrl: async (id: string, forceRefresh = false) => {
        if (!forceRefresh && get().audioUrl) {
            return get().audioUrl;
        }

        try {
            const token = await getToken();
            const response = await fetch(`${API_URL}/tickets/${id}/audio-url`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Failed to fetch signed audio URL:', errorData?.error || response.statusText);
                notifyError('Could not load audio playback URL.', { toastId: 'audio-url-error' });
                set({ audioUrl: null });
                return null;
            }

            const data = await response.json();
            const url = typeof data.audio_url === 'string' ? data.audio_url : null;
            set({ audioUrl: url });
            return url;
        } catch (error) {
            console.error('Failed to fetch signed audio URL:', error);
            notifyError('Could not load audio playback URL.', { toastId: 'audio-url-error' });
            set({ audioUrl: null });
            return null;
        }
    },

    reanalyze: async (id: string) => {
        set({ isReanalyzeModalOpen: false, reanalyzeStatus: 'analyzing' });

        try {
            const token = await getToken();
            if (!token) throw new Error('No authentication token found');

            const res = await fetch(`${API_URL}/tickets/${id}/analyze`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Analysis failed');
            }

            const data = await res.json();

            // Update ticket and analysis directly from response — no page reload needed
            set({
                ticket: data.ticket || get().ticket,
                analysis: data.analysis || get().analysis,
                reanalyzeStatus: 'analyzed',
            });

            // Reset status after a brief display of success
            setTimeout(() => set({ reanalyzeStatus: 'idle' }), 3000);

        } catch (e: unknown) {
            console.error('Re-analysis error:', e);
            set({ reanalyzeStatus: 'failed' });
            setTimeout(() => set({ reanalyzeStatus: 'idle' }), 3000);
        }
    },

    setReanalyzeModalOpen: (open) => set({ isReanalyzeModalOpen: open }),
    setIsPlaying: (playing) => set({ isPlaying: playing }),
    setCurrentTime: (time) => set({ currentTime: time }),
    setDuration: (duration) => set({ duration: duration }),

    reset: () => set({
        ticket: null,
        analysis: null,
        previousAnalysis: null,
        comparison: null,
        actionItemsDb: [],
        excuses: [],
        audioUrl: null,
        loading: true,
        reanalyzeStatus: 'idle',
        isReanalyzeModalOpen: false,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        currentTicketId: null,
    }),
}));
