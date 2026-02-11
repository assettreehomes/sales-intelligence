import { create } from 'zustand';
import { getToken, API_URL } from './authStore';

export type VisitType = 'site_visit' | 'follow_up' | 'closing' | 'inquiry' | 'other';

export interface DraftTicket {
    id: string;
    client_id: string | null;
    client_name: string;
    visit_type: VisitType;
    visit_number: number;
    notes: string | null;
    created_at: string | null;
}

interface UploadState {
    status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
    progress: number;
    message: string;
    ticketId?: string;
    visitNumber?: number;
}

interface UploadStoreState {
    // Form fields
    clientId: string;
    clientName: string;
    visitType: VisitType;
    selectedFile: File | null;
    selectedDraft: DraftTicket | null;

    // Upload state
    uploadState: UploadState;
    drafts: DraftTicket[];
    draftsLoading: boolean;

    // Actions
    setClientId: (id: string) => void;
    setClientName: (name: string) => void;
    setVisitType: (type: VisitType) => void;
    setSelectedFile: (file: File | null) => void;
    selectDraft: (draft: DraftTicket | null) => void;
    fetchDrafts: () => Promise<void>;
    setUploadState: (state: UploadState) => void;
    upload: () => Promise<void>;
    resetForm: () => void;
}

export const useUploadStore = create<UploadStoreState>((set, get) => ({
    // Initial state
    clientId: '',
    clientName: '',
    visitType: 'site_visit',
    selectedFile: null,
    selectedDraft: null,
    uploadState: { status: 'idle', progress: 0, message: '' },
    drafts: [],
    draftsLoading: false,

    // Setters
    setClientId: (id) => set({ clientId: id }),
    setClientName: (name) => set({ clientName: name }),
    setVisitType: (type) => set({ visitType: type }),
    setSelectedFile: (file) => set({ selectedFile: file }),
    selectDraft: (draft) => set(() => ({
        selectedDraft: draft,
        clientId: draft?.client_id || '',
        clientName: draft ? draft.client_name : '',
        visitType: draft ? draft.visit_type : 'site_visit',
        uploadState: { status: 'idle', progress: 0, message: '' },
    })),
    fetchDrafts: async () => {
        set({ draftsLoading: true });
        try {
            const token = await getToken();
            if (!token) {
                set({ drafts: [] });
                return;
            }

            const response = await fetch(`${API_URL}/drafts`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch drafts');
            }

            const data = await response.json();
            set({ drafts: data.drafts || [] });
        } catch (error) {
            console.error('Draft fetch error:', error);
            set({ drafts: [] });
        } finally {
            set({ draftsLoading: false });
        }
    },
    setUploadState: (state) => set({ uploadState: state }),

    upload: async () => {
        const { selectedFile, clientId, clientName, visitType, selectedDraft, fetchDrafts } = get();
        const isDraftUpload = Boolean(selectedDraft);

        if (!selectedFile || (!isDraftUpload && !clientId.trim())) {
            set({
                uploadState: {
                    status: 'error',
                    progress: 0,
                    message: isDraftUpload
                        ? 'Please select an audio file to upload.'
                        : 'Please provide Client ID and select an audio file.'
                }
            });
            return;
        }

        set({
            uploadState: { status: 'uploading', progress: 0, message: 'Uploading audio file...' }
        });

        try {
            const token = await getToken();
            if (!token) {
                throw new Error('Authentication required');
            }

            const formData = new FormData();
            formData.append('audio', selectedFile);
            if (selectedDraft) {
                formData.append('ticket_id', selectedDraft.id);
            } else {
                formData.append('client_id', clientId.trim());
            }
            if (clientName.trim() || selectedDraft?.client_name) {
                formData.append('client_name', clientName.trim() || selectedDraft?.client_name || '');
            }
            formData.append('visit_type', visitType);

            const response = await fetch(`${API_URL}/tickets/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Upload failed');
            }

            const result = await response.json();

            set({
                uploadState: {
                    status: 'success',
                    progress: 100,
                    message: selectedDraft
                        ? `Draft upload complete for ${selectedDraft.client_name} (Visit #${result.visit_number}). Analysis started.`
                        : `Upload complete! Visit #${result.visit_number} for Client ID: ${clientId}. Analysis started.`,
                    ticketId: result.ticket_id,
                    visitNumber: result.visit_number
                },
                // Reset form fields on success
                clientId: '',
                clientName: '',
                visitType: 'site_visit',
                selectedFile: null,
                selectedDraft: null,
            });
            await fetchDrafts();

        } catch (error) {
            console.error('Upload error:', error);
            set({
                uploadState: {
                    status: 'error',
                    progress: 0,
                    message: error instanceof Error ? error.message : 'Upload failed. Please try again.'
                }
            });
        }
    },

    resetForm: () => set({
        clientId: '',
        clientName: '',
        visitType: 'site_visit',
        selectedFile: null,
        selectedDraft: null,
        uploadState: { status: 'idle', progress: 0, message: '' },
    }),
}));
