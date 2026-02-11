'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useUploadStore, type VisitType } from '@/stores/uploadStore';
import { API_URL, getToken } from '@/stores/authStore';
import {
    Upload,
    CheckCircle,
    LogOut,
    User,
    FileAudio,
    AlertCircle,
    Loader2,
    X,
    ClipboardList,
    CalendarClock,
    Send
} from 'lucide-react';

const SUPPORTED_FORMATS = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'webm', 'aac'];
const EXCUSE_REASONS = [
    { value: 'client_unavailable', label: 'Client unavailable' },
    { value: 'technical_issues', label: 'Technical issues' },
    { value: 'travel_delay', label: 'Travel delay' },
    { value: 'meeting_rescheduled', label: 'Meeting rescheduled' },
    { value: 'emergency', label: 'Emergency' },
    { value: 'other', label: 'Other' }
] as const;

function EmployeeDashboardContent() {
    const router = useRouter();
    const { user, profile, signOut } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragActive, setDragActive] = useState(false);
    const [excuseDraftId, setExcuseDraftId] = useState<string | null>(null);
    const [excuseReason, setExcuseReason] = useState<string>('client_unavailable');
    const [excuseDetails, setExcuseDetails] = useState('');
    const [estimatedMinutes, setEstimatedMinutes] = useState('');
    const [estimatedStartTime, setEstimatedStartTime] = useState('');
    const [excuseLoading, setExcuseLoading] = useState(false);
    const [excuseFeedback, setExcuseFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Zustand store — replaces all useState for form + upload
    const {
        clientId, clientName, visitType, selectedFile, selectedDraft, uploadState,
        drafts, draftsLoading,
        setClientId, setClientName, setVisitType, setSelectedFile, setUploadState,
        fetchDrafts, selectDraft,
        upload,
    } = useUploadStore();

    const visitTypes: { value: VisitType; label: string; }[] = [
        { value: 'site_visit', label: 'Site Visit' },
        { value: 'follow_up', label: 'Follow Up' },
        { value: 'closing', label: 'Closing' },
        { value: 'inquiry', label: 'Inquiry' },
        { value: 'other', label: 'Other' }
    ];


    const validateAndSetFile = useCallback((file: File) => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!extension || !SUPPORTED_FORMATS.includes(extension)) {
            setUploadState({
                status: 'error',
                progress: 0,
                message: `Unsupported format. Please use: ${SUPPORTED_FORMATS.join(', ')}`
            });
            return;
        }

        if (file.size > 100 * 1024 * 1024) {
            setUploadState({
                status: 'error',
                progress: 0,
                message: 'File too large. Maximum size is 100MB.'
            });
            return;
        }

        setSelectedFile(file);
        setUploadState({ status: 'idle', progress: 0, message: '' });
    }, [setSelectedFile, setUploadState]);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const files = e.dataTransfer.files;
        if (files?.[0]) {
            validateAndSetFile(files[0]);
        }
    }, [validateAndSetFile]);

    // Use store's upload action
    const handleUpload = upload;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files?.[0]) {
            validateAndSetFile(files[0]);
        }
    };



    const handleSignOut = async () => {
        await signOut();
        router.push('/login');
    };

    useEffect(() => {
        fetchDrafts();
    }, [fetchDrafts]);

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatDraftDate = (dateStr: string | null) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const resetExcuseForm = () => {
        setExcuseDraftId(null);
        setExcuseReason('client_unavailable');
        setExcuseDetails('');
        setEstimatedMinutes('');
        setEstimatedStartTime('');
    };

    const submitExcuse = async () => {
        if (!excuseDraftId) return;

        setExcuseLoading(true);
        setExcuseFeedback(null);
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication required');

            const response = await fetch(`${API_URL}/excuses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    ticket_id: excuseDraftId,
                    reason: excuseReason,
                    reason_details: excuseDetails.trim() || undefined,
                    estimated_time_minutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
                    estimated_start_time: estimatedStartTime || undefined
                })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || 'Failed to submit excuse');
            }

            setExcuseFeedback({ type: 'success', message: 'Excuse submitted. Awaiting admin review.' });
            resetExcuseForm();
        } catch (error) {
            setExcuseFeedback({
                type: 'error',
                message: error instanceof Error ? error.message : 'Failed to submit excuse'
            });
        } finally {
            setExcuseLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-sm border-b border-purple-100 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#2d3a2d] rounded-lg flex items-center justify-center">
                            <span className="text-lg">🌳</span>
                        </div>
                        <span className="font-bold text-xl text-gray-900">TicketIntel</span>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                    </button>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 py-8">
                {/* Profile Card */}
                <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-purple-100">
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                            <User className="w-10 h-10 text-white" />
                        </div>
                        <div className="flex-1">
                            <h1 className="text-3xl font-bold text-gray-900 mb-1">
                                Welcome, {profile?.fullname || 'Employee'}!
                            </h1>
                            <div className="flex items-center gap-3 mb-3">
                                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium capitalize">
                                    {profile?.role || 'Employee'}
                                </span>
                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${profile?.status === 'active'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-600'
                                    }`}>
                                    {profile?.status || 'Active'}
                                </span>
                            </div>
                            <p className="text-gray-500">
                                You have successfully authenticated to the TicketIntel portal. Your session will remain active for 100 days.
                            </p>
                        </div>
                    </div>

                    {/* Session Details */}
                    <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                            <p className="text-sm text-gray-500 mb-1">Email</p>
                            <p className="font-medium text-gray-900">{profile?.email || user?.email}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 mb-1">Role</p>
                            <p className="font-medium text-gray-900 capitalize">{profile?.role}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 mb-1">Status</p>
                            <p className="font-medium text-green-600 capitalize">{profile?.status}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 mb-1">Session Duration</p>
                            <p className="font-medium text-gray-900">100 days</p>
                        </div>
                    </div>
                </div>

                {/* Assigned Drafts */}
                <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-purple-100">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <ClipboardList className="w-7 h-7 text-purple-600" />
                            Assigned Drafts
                        </h2>
                        <button
                            onClick={fetchDrafts}
                            className="px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                        >
                            Refresh
                        </button>
                    </div>

                    {draftsLoading ? (
                        <div className="flex items-center gap-2 text-gray-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading assigned drafts...
                        </div>
                    ) : drafts.length === 0 ? (
                        <p className="text-gray-500">No drafts assigned right now. You can still upload directly.</p>
                    ) : (
                        <div className="space-y-3">
                            {drafts.map((draft) => {
                                const isSelected = selectedDraft?.id === draft.id;
                                return (
                                    <div
                                        key={draft.id}
                                        className={`p-4 rounded-xl border transition-all ${isSelected
                                            ? 'border-purple-400 bg-purple-50'
                                            : 'border-gray-200 bg-gray-50'
                                            }`}
                                    >
                                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                            <div>
                                                <p className="font-semibold text-gray-900">{draft.client_name}</p>
                                                <p className="text-sm text-gray-500">
                                                    Visit #{draft.visit_number} • {draft.visit_type.replace('_', ' ')}
                                                    {draft.client_id ? ` • ${draft.client_id}` : ''}
                                                </p>
                                                {draft.notes && (
                                                    <p className="text-sm text-gray-700 mt-1">{draft.notes}</p>
                                                )}
                                                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                    <CalendarClock className="w-3 h-3" />
                                                    Assigned {formatDraftDate(draft.created_at)}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2 flex-wrap">
                                                <button
                                                    onClick={() => {
                                                        setExcuseFeedback(null);
                                                        setExcuseDraftId(draft.id);
                                                    }}
                                                    className="px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg transition-colors"
                                                >
                                                    Submit Excuse
                                                </button>
                                                {isSelected ? (
                                                    <button
                                                        onClick={() => selectDraft(null)}
                                                        className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg transition-colors"
                                                    >
                                                        Clear
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => selectDraft(draft)}
                                                        className="px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                                                    >
                                                        Upload This Draft
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {excuseFeedback && (
                        <div className={`mt-4 p-4 rounded-lg border ${excuseFeedback.type === 'success'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                            }`}>
                            {excuseFeedback.message}
                        </div>
                    )}
                </div>

                {/* Upload Form */}
                <div className="bg-white rounded-2xl shadow-xl p-8 border border-purple-100">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                        <FileAudio className="w-7 h-7 text-purple-600" />
                        {selectedDraft ? `Upload for Draft #${selectedDraft.id.slice(0, 8)}` : 'Upload Sales Call Recording'}
                    </h2>

                    <div className="grid md:grid-cols-3 gap-6 mb-6">
                        {/* Client ID - Required */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Client ID {!selectedDraft && <span className="text-red-500">*</span>}
                            </label>
                            <input
                                type="text"
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                placeholder={selectedDraft ? 'Client ID auto-filled from draft (optional)' : 'e.g., CLT-001'}
                                disabled={Boolean(selectedDraft)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all disabled:bg-gray-100 disabled:text-gray-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                {selectedDraft ? 'Draft uploads use assigned ticket id.' : 'Unique identifier for visit tracking'}
                            </p>
                        </div>

                        {/* Client Name - Optional */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Client Name <span className="text-gray-400">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder="Enter client name"
                                disabled={Boolean(selectedDraft)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all disabled:bg-gray-100 disabled:text-gray-500"
                            />
                        </div>

                        {/* Visit Type */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Visit Type
                            </label>
                            <select
                                value={visitType}
                                onChange={(e) => setVisitType(e.target.value as VisitType)}
                                disabled={Boolean(selectedDraft)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white disabled:bg-gray-100 disabled:text-gray-500"
                            >
                                {visitTypes.map((type) => (
                                    <option key={type.value} value={type.value}>
                                        {type.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Dropzone */}
                    <div
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${dragActive
                            ? 'border-purple-500 bg-purple-50'
                            : selectedFile
                                ? 'border-green-400 bg-green-50'
                                : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50/50'
                            }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,.aac"
                            onChange={handleFileSelect}
                            className="hidden"
                        />

                        {selectedFile ? (
                            <div className="flex items-center justify-center gap-4">
                                <FileAudio className="w-12 h-12 text-green-600" />
                                <div className="text-left">
                                    <p className="font-medium text-gray-900">{selectedFile.name}</p>
                                    <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedFile(null);
                                    }}
                                    className="p-2 hover:bg-red-100 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5 text-red-500" />
                                </button>
                            </div>
                        ) : (
                            <>
                                <Upload className={`w-12 h-12 mx-auto mb-4 ${dragActive ? 'text-purple-600' : 'text-gray-400'}`} />
                                <p className="text-lg font-medium text-gray-700 mb-2">
                                    {dragActive ? 'Drop your audio file here' : 'Drag and drop or click to upload'}
                                </p>
                                <p className="text-sm text-gray-500">
                                    Supported formats: MP3, WAV, M4A, OGG, FLAC, WebM, AAC (max 100MB)
                                </p>
                            </>
                        )}
                    </div>

                    {/* Status Messages */}
                    {uploadState.status !== 'idle' && (
                        <div className={`mt-4 p-4 rounded-lg flex items-center gap-3 ${uploadState.status === 'error' ? 'bg-red-50 text-red-700' :
                            uploadState.status === 'success' ? 'bg-green-50 text-green-700' :
                                'bg-blue-50 text-blue-700'
                            }`}>
                            {uploadState.status === 'uploading' && <Loader2 className="w-5 h-5 animate-spin" />}
                            {uploadState.status === 'processing' && <Loader2 className="w-5 h-5 animate-spin" />}
                            {uploadState.status === 'success' && <CheckCircle className="w-5 h-5" />}
                            {uploadState.status === 'error' && <AlertCircle className="w-5 h-5" />}
                            <span>{uploadState.message}</span>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        onClick={handleUpload}
                        disabled={!selectedFile || (!selectedDraft && !clientId.trim()) || uploadState.status === 'uploading'}
                        className="mt-6 w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                    >
                        {uploadState.status === 'uploading' ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Upload className="w-5 h-5" />
                                {selectedDraft ? 'Upload Draft Audio & Analyze' : 'Upload & Analyze'}
                            </>
                        )}
                    </button>

                    {/* Info note */}
                    <p className="mt-4 text-sm text-gray-500 text-center">
                        💡 <strong>Tip:</strong> Use the same Client ID for repeat visits to track improvements over time.
                    </p>
                </div>
            </main>

            {excuseDraftId && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-xl p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Submit Recording Excuse</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Explain why recording has not started for draft #{excuseDraftId.slice(0, 8)}.
                                </p>
                            </div>
                            <button
                                onClick={resetExcuseForm}
                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Reason</label>
                                <select
                                    value={excuseReason}
                                    onChange={(e) => setExcuseReason(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                >
                                    {EXCUSE_REASONS.map((reason) => (
                                        <option key={reason.value} value={reason.value}>
                                            {reason.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Details</label>
                                <textarea
                                    value={excuseDetails}
                                    onChange={(e) => setExcuseDetails(e.target.value)}
                                    rows={4}
                                    placeholder="Add context for the admin..."
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Delay (minutes)</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={estimatedMinutes}
                                        onChange={(e) => setEstimatedMinutes(e.target.value)}
                                        placeholder="e.g. 15"
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Start Time</label>
                                    <input
                                        type="datetime-local"
                                        value={estimatedStartTime}
                                        onChange={(e) => setEstimatedStartTime(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                onClick={resetExcuseForm}
                                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submitExcuse}
                                disabled={excuseLoading}
                                className="px-4 py-2 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {excuseLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Submit Excuse
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function EmployeePage() {
    return (
        <ProtectedRoute allowedRoles={['employee', 'superadmin', 'admin']}>
            <EmployeeDashboardContent />
        </ProtectedRoute>
    );
}
