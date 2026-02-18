'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { useTicketDetailStore } from '@/stores/ticketDetailStore';
import { API_URL, getToken } from '@/stores/authStore';
import { notifyError, notifyInfo, notifySuccess } from '@/lib/toast';
import {
    ArrowLeft,
    Play,
    Pause,
    RotateCcw,
    VolumeX,
    Volume1,
    Volume2,
    Gauge,
    Download,
    ThumbsUp,
    Smile,
    Zap,
    Users,
    Star,
    Clock,
    CheckCircle,
    XCircle,
    AlertTriangle,
    ChevronRight,
    AlertCircle,
    RefreshCcw,
    TrendingUp,
    TrendingDown,
    Minus,
    Sparkles,
    Loader2
} from 'lucide-react';
import Link from 'next/link';

type HoveredChartPoint = {
    x: number;
    y: number;
    label: string;
    current: number;
    previous: number;
};

type ParsedScoreChange = {
    key: string;
    label: string;
    current: number;
    previous: number;
    change: number;
};

type ComparisonInsights = {
    deltaScore: number | null;
    overallNarrative: string | null;
    keyDifferences: string[];
    improvements: string[];
    regressions: string[];
    unchanged: string[];
    scoreChanges: ParsedScoreChange[];
};

const AUDIO_VOLUME_STORAGE_KEY = 'ticketintel-audio-volume';
const AUDIO_MUTE_STORAGE_KEY = 'ticketintel-audio-muted';
const AUDIO_LAST_VOLUME_STORAGE_KEY = 'ticketintel-audio-last-volume';
const AUDIO_SPEED_STORAGE_KEY = 'ticketintel-audio-speed';
const AUDIO_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type AudioPreferences = {
    volume: number;
    isMuted: boolean;
    lastVolume: number;
    speed: number;
};

const getStoredAudioPreferences = (): AudioPreferences => {
    if (typeof window === 'undefined') {
        return {
            volume: 1,
            isMuted: false,
            lastVolume: 1,
            speed: 1
        };
    }

    const storedVolume = Number(window.localStorage.getItem(AUDIO_VOLUME_STORAGE_KEY));
    const normalizedVolume = Number.isFinite(storedVolume) ? clamp(storedVolume, 0, 1) : 1;

    const storedLastVolume = Number(window.localStorage.getItem(AUDIO_LAST_VOLUME_STORAGE_KEY));
    const normalizedLastVolume = Number.isFinite(storedLastVolume)
        ? clamp(storedLastVolume, 0, 1)
        : Math.max(normalizedVolume, 0.5);

    const storedMuted = window.localStorage.getItem(AUDIO_MUTE_STORAGE_KEY) === '1';
    const storedSpeed = Number(window.localStorage.getItem(AUDIO_SPEED_STORAGE_KEY));
    const normalizedSpeed = (AUDIO_SPEED_OPTIONS as readonly number[]).includes(storedSpeed)
        ? storedSpeed
        : 1;

    return {
        volume: normalizedVolume,
        isMuted: storedMuted || normalizedVolume <= 0,
        lastVolume: normalizedLastVolume > 0 ? normalizedLastVolume : 1,
        speed: normalizedSpeed
    };
};

const isEditableShortcutTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    if (target.tagName === 'TEXTAREA') return true;
    if (target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        return input.type !== 'range' && input.type !== 'button' && input.type !== 'checkbox' && input.type !== 'radio';
    }
    return false;
};

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);

    // Zustand store
    const {
        ticket,
        analysis,
        previousAnalysis,
        comparison,
        actionItemsDb,
        excuses,
        audioUrl,
        loading,
        reanalyzeStatus,
        isReanalyzeModalOpen,
        isPlaying,
        currentTime,
        duration,

        fetchTicket,
        fetchAudioUrl,
        reanalyze,
        setReanalyzeModalOpen,
        setIsPlaying,
        setCurrentTime,
        setDuration
    } = useTicketDetailStore();

    // Refs for auto-scrolling key moments
    const initialAudioPreferences = useMemo<AudioPreferences>(() => getStoredAudioPreferences(), []);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const momentsContainerRef = useRef<HTMLDivElement>(null);
    const momentRefs = useRef<(HTMLDivElement | null)[]>([]);
    const lastVolumeRef = useRef(initialAudioPreferences.lastVolume);
    const seekPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reportMenuRef = useRef<HTMLDivElement | null>(null);
    const previousReanalyzeStatusRef = useRef(reanalyzeStatus);
    const [audioError, setAudioError] = useState<string | null>(null);
    const [hoveredChartPoint, setHoveredChartPoint] = useState<HoveredChartPoint | null>(null);
    const [bufferedPercent, setBufferedPercent] = useState(0);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [scrubTime, setScrubTime] = useState<number | null>(null);
    const [volume, setVolume] = useState(initialAudioPreferences.volume);
    const [isMuted, setIsMuted] = useState(initialAudioPreferences.isMuted);
    const [playbackSpeed, setPlaybackSpeed] = useState(initialAudioPreferences.speed);
    const [isReportMenuOpen, setIsReportMenuOpen] = useState(false);
    const [reportActionLoading, setReportActionLoading] = useState<'download' | 'copy' | 'share' | null>(null);
    const [reportShareUrl, setReportShareUrl] = useState<string | null>(null);

    // Parse timestamps from multiple formats (MM:SS, HH:MM:SS, seconds, or milliseconds)
    const parseTime = (value?: string | number | null): number => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value > 10000 ? value / 1000 : value;
        }

        if (typeof value !== 'string') return 0;
        const raw = value.trim();
        if (!raw) return 0;

        if (/^\d+(\.\d+)?$/.test(raw)) {
            const numeric = Number(raw);
            return Number.isFinite(numeric) ? (numeric > 10000 ? numeric / 1000 : numeric) : 0;
        }

        const parts = raw.split(':').map((part) => Number(part.trim()));
        if (parts.some((part) => !Number.isFinite(part))) return 0;

        if (parts.length === 3) {
            const [hours, minutes, seconds] = parts;
            return hours * 3600 + minutes * 60 + seconds;
        }
        if (parts.length === 2) {
            const [minutes, seconds] = parts;
            return minutes * 60 + seconds;
        }
        return parts[0] ?? 0;
    };

    const sortedMoments = analysis?.keymoments
        ? [...analysis.keymoments].sort((a, b) => {
            const aTime = a.time || a.timestamp || '00:00';
            const bTime = b.time || b.timestamp || '00:00';
            return parseTime(aTime) - parseTime(bTime);
        })
        : [];

    // Find the current active moment (the one that started most recently)
    const activeMomentIndex = sortedMoments.findIndex((m, i) => {
        const startTime = parseTime(m.time || m.timestamp || '00:00');
        const nextTime = i < sortedMoments.length - 1
            ? parseTime(sortedMoments[i + 1].time || sortedMoments[i + 1].timestamp || '00:00')
            : Infinity;
        return currentTime >= startTime && currentTime < nextTime;
    });

    // Auto-scroll to active moment
    useEffect(() => {
        if (activeMomentIndex !== -1 && momentRefs.current[activeMomentIndex]) {
            momentRefs.current[activeMomentIndex]?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }
    }, [activeMomentIndex]);


    useEffect(() => {
        let active = true;

        const loadTicket = async () => {
            await fetchTicket(id);
            if (!active) return;
            await fetchAudioUrl(id, true);
        };

        void loadTicket();
        return () => { active = false; };
    }, [id, fetchTicket, fetchAudioUrl]);
    const formatTime = (time: number) => {
        if (!Number.isFinite(time) || time < 0) return '00:00';
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const formatSpeed = (speed: number) => `${Number.isInteger(speed) ? speed.toFixed(0) : speed}\u00D7`;

    const ensureSignedAudioUrl = useCallback(async (forceRefresh = false) => {
        const resolvedUrl = await fetchAudioUrl(id, forceRefresh || !audioUrl);
        if (!resolvedUrl) {
            setAudioError('Backend could not generate a signed audio URL for this ticket.');
            return null;
        }
        setAudioError(null);
        return resolvedUrl;
    }, [fetchAudioUrl, id, audioUrl]);

    const getSeekLimit = useCallback((audio: HTMLAudioElement | null) => {
        if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
            return audio.duration;
        }
        return Math.max(duration, 0);
    }, [duration]);

    const setPlaybackPosition = useCallback((nextTime: number) => {
        const audio = audioRef.current;
        const max = getSeekLimit(audio);
        const bounded = clamp(nextTime, 0, max > 0 ? max : Math.max(nextTime, 0));
        if (audio) {
            audio.currentTime = bounded;
        }
        setCurrentTime(bounded);
        return bounded;
    }, [getSeekLimit, setCurrentTime]);

    const updateBufferedProgress = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || audio.buffered.length === 0) {
            setBufferedPercent(0);
            return;
        }

        try {
            const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
            const max = getSeekLimit(audio);
            if (max <= 0) {
                setBufferedPercent(0);
                return;
            }
            setBufferedPercent(clamp((bufferedEnd / max) * 100, 0, 100));
        } catch {
            setBufferedPercent(0);
        }
    }, [getSeekLimit]);

    const applyVolume = useCallback((nextVolume: number) => {
        const clampedVolume = clamp(nextVolume, 0, 1);
        setVolume(clampedVolume);
        if (clampedVolume <= 0) {
            setIsMuted(true);
            return;
        }
        lastVolumeRef.current = clampedVolume;
        setIsMuted(false);
    }, []);

    const changeVolumeBy = useCallback((delta: number) => {
        const baseVolume = isMuted ? Math.max(lastVolumeRef.current, 0.25) : volume;
        applyVolume(baseVolume + delta);
    }, [isMuted, volume, applyVolume]);

    const toggleMute = useCallback(() => {
        if (isMuted || volume <= 0) {
            const restoredVolume = clamp(lastVolumeRef.current || 1, 0.05, 1);
            setVolume(restoredVolume);
            setIsMuted(false);
            return;
        }

        if (volume > 0) {
            lastVolumeRef.current = volume;
        }
        setIsMuted(true);
    }, [isMuted, volume]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(AUDIO_VOLUME_STORAGE_KEY, volume.toString());
        if (volume > 0) {
            lastVolumeRef.current = volume;
            window.localStorage.setItem(AUDIO_LAST_VOLUME_STORAGE_KEY, volume.toString());
        }
    }, [volume]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(AUDIO_MUTE_STORAGE_KEY, isMuted ? '1' : '0');
    }, [isMuted]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(AUDIO_SPEED_STORAGE_KEY, playbackSpeed.toString());
    }, [playbackSpeed]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = clamp(volume, 0, 1);
        audio.muted = isMuted;
        audio.playbackRate = playbackSpeed;
    }, [volume, isMuted, playbackSpeed]);

    const togglePlayback = useCallback(async () => {
        const signedUrl = await ensureSignedAudioUrl(false);
        if (!signedUrl) return;

        const audio = audioRef.current;
        if (!audio) {
            setAudioError('Audio player is still initializing. Please try again.');
            return;
        }

        if (!audio.currentSrc || audio.currentSrc !== signedUrl) {
            audio.src = signedUrl;
            audio.load();
        }

        if (audio.paused) {
            try {
                await audio.play();
                setAudioError(null);
                setIsPlaying(true);
            } catch (err) {
                console.error('Audio play failed:', err);
                const refreshedUrl = await ensureSignedAudioUrl(true);
                if (refreshedUrl) {
                    try {
                        audio.src = refreshedUrl;
                        audio.load();
                        await audio.play();
                        setAudioError(null);
                        setIsPlaying(true);
                        return;
                    } catch (retryError) {
                        console.error('Audio retry failed:', retryError);
                    }
                }
                setAudioError('Unable to play this recording.');
                setIsPlaying(false);
            }
            return;
        }

        audio.pause();
        setIsPlaying(false);
    }, [ensureSignedAudioUrl, setIsPlaying]);

    const setSeekPreview = useCallback((nextTime: number, keepMs = 240) => {
        if (seekPreviewTimerRef.current) {
            clearTimeout(seekPreviewTimerRef.current);
        }
        setScrubTime(nextTime);
        seekPreviewTimerRef.current = setTimeout(() => {
            setScrubTime(null);
            seekPreviewTimerRef.current = null;
        }, keepMs);
    }, []);

    useEffect(() => {
        return () => {
            if (seekPreviewTimerRef.current) {
                clearTimeout(seekPreviewTimerRef.current);
            }
        };
    }, []);

    const restartPlayback = useCallback(async () => {
        const signedUrl = await ensureSignedAudioUrl(false);
        if (!signedUrl) return;

        const audio = audioRef.current;
        if (!audio) return;

        if (!audio.currentSrc || audio.currentSrc !== signedUrl) {
            audio.src = signedUrl;
            audio.load();
        }

        const resetPoint = setPlaybackPosition(0);
        setIsScrubbing(false);
        setSeekPreview(resetPoint);
    }, [ensureSignedAudioUrl, setPlaybackPosition, setSeekPreview]);

    const seekBy = useCallback(async (deltaSeconds: number) => {
        const signedUrl = await ensureSignedAudioUrl(false);
        if (!signedUrl) return;

        const audio = audioRef.current;
        if (!audio) return;

        if (!audio.currentSrc || audio.currentSrc !== signedUrl) {
            audio.src = signedUrl;
            audio.load();
        }

        const max = Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : Math.max(duration, 0);
        const unclamped = audio.currentTime + deltaSeconds;
        const next = Math.max(0, max > 0 ? Math.min(unclamped, max) : unclamped);

        setPlaybackPosition(next);
        setIsScrubbing(false);
        setSeekPreview(next);
    }, [duration, ensureSignedAudioUrl, setPlaybackPosition, setSeekPreview]);

    const handleSeekInput = useCallback((nextTime: number) => {
        const bounded = setPlaybackPosition(nextTime);
        setIsScrubbing(true);
        setScrubTime(bounded);
    }, [setPlaybackPosition]);

    const commitScrub = useCallback(() => {
        setIsScrubbing(false);
        if (seekPreviewTimerRef.current) {
            clearTimeout(seekPreviewTimerRef.current);
        }
        seekPreviewTimerRef.current = setTimeout(() => {
            setScrubTime(null);
            seekPreviewTimerRef.current = null;
        }, 160);
    }, []);

    const cyclePlaybackSpeed = useCallback(() => {
        const currentIndex = AUDIO_SPEED_OPTIONS.findIndex((speed) => speed === playbackSpeed);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % AUDIO_SPEED_OPTIONS.length : 0;
        setPlaybackSpeed(AUDIO_SPEED_OPTIONS[nextIndex]);
    }, [playbackSpeed]);

    const seekToMoment = async (momentTime: string | number | null | undefined) => {
        const seconds = Math.max(0, parseTime(momentTime));
        const signedUrl = await ensureSignedAudioUrl(false);
        if (!signedUrl) return;

        const audio = audioRef.current;

        const target = setPlaybackPosition(seconds);
        setIsScrubbing(false);
        setSeekPreview(target);

        if (!audio) return;

        if (!audio.currentSrc || audio.currentSrc !== signedUrl) {
            audio.src = signedUrl;
            audio.load();
        }

        audio.currentTime = seconds;
        try {
            await audio.play();
            setAudioError(null);
            setIsPlaying(true);
        } catch (err) {
            console.error('Moment playback failed:', err);
            setAudioError('Unable to jump to selected key moment.');
            setIsPlaying(false);
        }
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
            if (isEditableShortcutTarget(event.target)) return;

            if (event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                void togglePlayback();
                return;
            }

            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                void seekBy(-5);
                return;
            }

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                void seekBy(event.shiftKey ? 10 : 5);
                return;
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                changeVolumeBy(0.05);
                return;
            }

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                changeVolumeBy(-0.05);
                return;
            }

            if (event.key.toLowerCase() === 'm') {
                event.preventDefault();
                toggleMute();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [togglePlayback, seekBy, changeVolumeBy, toggleMute]);

    const triggerReportDownload = useCallback((blob: Blob) => {
        const objectUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = `ticket-report-${id.slice(0, 8)}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(objectUrl);
    }, [id]);

    const fetchReportBlob = useCallback(async () => {
        const token = await getToken();
        if (!token) {
            throw new Error('Authentication required');
        }

        const response = await fetch(`${API_URL}/tickets/${id}/report?download=true`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || 'Failed to generate ticket report');
        }

        return await response.blob();
    }, [id]);

    const getReportShareLink = useCallback(async (forceRefresh = false) => {
        if (!forceRefresh && reportShareUrl) {
            return reportShareUrl;
        }

        const token = await getToken();
        if (!token) {
            throw new Error('Authentication required');
        }

        const response = await fetch(`${API_URL}/tickets/${id}/report/share-link`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({})
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || 'Failed to create share link');
        }

        const shareUrl = typeof payload.share_url === 'string' ? payload.share_url : null;
        if (!shareUrl) {
            throw new Error('Report share URL not available');
        }

        setReportShareUrl(shareUrl);
        return shareUrl;
    }, [id, reportShareUrl]);

    const handleDownloadReport = useCallback(async () => {
        setReportActionLoading('download');
        try {
            const blob = await fetchReportBlob();
            triggerReportDownload(blob);
            notifySuccess('Report downloaded successfully.');
            setIsReportMenuOpen(false);
        } catch (error) {
            notifyError(error instanceof Error ? error.message : 'Report download failed');
        } finally {
            setReportActionLoading(null);
        }
    }, [fetchReportBlob, triggerReportDownload]);

    const handleCopyReportLink = useCallback(async () => {
        setReportActionLoading('copy');
        try {
            const shareLink = await getReportShareLink(false);
            if (!navigator.clipboard) {
                throw new Error('Clipboard is not available on this browser');
            }
            await navigator.clipboard.writeText(shareLink);
            notifySuccess('Report share link copied to clipboard.');
            setIsReportMenuOpen(false);
        } catch (error) {
            notifyError(error instanceof Error ? error.message : 'Could not copy report link');
        } finally {
            setReportActionLoading(null);
        }
    }, [getReportShareLink]);

    const handleShareReport = useCallback(async () => {
        setReportActionLoading('share');
        try {
            const shareLink = await getReportShareLink(false);

            if (navigator.share) {
                await navigator.share({
                    title: `Ticket Report #${id.slice(0, 4).toUpperCase()}`,
                    text: 'TicketIntel detailed report',
                    url: shareLink
                });
                notifySuccess('Report link shared.');
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(shareLink);
                notifyInfo('Share is not supported on this device. Link copied to clipboard.');
            } else {
                window.open(shareLink, '_blank', 'noopener,noreferrer');
                notifyInfo('Opened the share link in a new tab.');
            }

            setIsReportMenuOpen(false);
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                setReportActionLoading(null);
                return;
            }
            notifyError(error instanceof Error ? error.message : 'Could not share report');
        } finally {
            setReportActionLoading(null);
        }
    }, [getReportShareLink, id]);

    useEffect(() => {
        if (!isReportMenuOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!reportMenuRef.current) return;
            if (!reportMenuRef.current.contains(event.target as Node)) {
                setIsReportMenuOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsReportMenuOpen(false);
            }
        };

        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isReportMenuOpen]);

    useEffect(() => {
        const previousStatus = previousReanalyzeStatusRef.current;
        if (reanalyzeStatus === previousStatus) return;

        previousReanalyzeStatusRef.current = reanalyzeStatus;

        if (reanalyzeStatus === 'analyzing') {
            notifyInfo('Re-analysis started for this ticket.');
        } else if (reanalyzeStatus === 'analyzed') {
            notifySuccess('Re-analysis completed successfully.');
        } else if (reanalyzeStatus === 'failed') {
            notifyError('Re-analysis failed. Please try again.');
        }
    }, [reanalyzeStatus]);

    const displayedCurrentTime = scrubTime ?? currentTime;
    const progressPercent = duration > 0 ? clamp((displayedCurrentTime / duration) * 100, 0, 100) : 0;
    const effectiveVolume = isMuted ? 0 : volume;
    const volumePercent = clamp(effectiveVolume * 100, 0, 100);
    const VolumeIcon = effectiveVolume <= 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

    const getSentimentColor = (sentiment: string) => {
        switch (sentiment) {
            case 'positive': return 'bg-green-100 text-green-700 border-green-200';
            case 'negative': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const getExcuseStatusClass = (status: string) => {
        if (status === 'pending') return 'bg-amber-100 text-amber-700 border-amber-200';
        if (status === 'accepted') return 'bg-green-100 text-green-700 border-green-200';
        if (status === 'rejected') return 'bg-red-100 text-red-700 border-red-200';
        return 'bg-gray-100 text-gray-700 border-gray-200';
    };

    const formatExcuseReason = (reason: string) => {
        const labels: Record<string, string> = {
            client_unavailable: 'Client unavailable',
            technical_issues: 'Technical issues',
            travel_delay: 'Travel delay',
            meeting_rescheduled: 'Meeting rescheduled',
            emergency: 'Emergency',
            other: 'Other'
        };
        return labels[reason] || reason.replaceAll('_', ' ');
    };

    const renderStars = (rating: number) => {
        const score = Math.round(rating / 2);
        return (
            <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                        key={star}
                        className={`w-5 h-5 ${star <= score ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
                    />
                ))}
            </div>
        );
    };

    const aiActionItems = useMemo(() => {
        if (!analysis) return [] as string[];

        const candidateRaw =
            (analysis as unknown as Record<string, unknown>).actionitems ??
            (analysis as unknown as Record<string, unknown>).action_items ??
            (analysis as unknown as Record<string, unknown>).actionItems ??
            [];

        let list: unknown[] = [];

        if (Array.isArray(candidateRaw)) {
            list = candidateRaw;
        } else if (typeof candidateRaw === 'string') {
            try {
                const parsed = JSON.parse(candidateRaw);
                if (Array.isArray(parsed)) list = parsed;
            } catch {
                list = [candidateRaw];
            }
        }

        const normalized = list
            .map((item) => {
                if (typeof item === 'string') return item.trim();
                if (item && typeof item === 'object') {
                    const row = item as Record<string, unknown>;
                    const primary =
                        (typeof row.item === 'string' && row.item) ||
                        (typeof row.action === 'string' && row.action) ||
                        (typeof row.title === 'string' && row.title) ||
                        null;

                    const desc = typeof row.description === 'string' ? row.description : null;
                    if (primary && desc) return `${primary} - ${desc}`;
                    if (primary) return primary;
                }
                return null;
            })
            .filter((item): item is string => Boolean(item && item.length));

        return [...new Set(normalized)];
    }, [analysis]);

    const trackedActionItems = useMemo(() => actionItemsDb.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        completed: item.completed,
        due_date: item.due_date
    })), [actionItemsDb]);

    const hasAnyActionItems = aiActionItems.length > 0 || trackedActionItems.length > 0;

    const comparisonChart = (() => {
        if (!comparison || !comparison.labels?.length) return null;

        const labels = comparison.labels;
        const currentValues = labels.map((_, index) => comparison.current[index] ?? 0);
        const previousValues = labels.map((_, index) => comparison.previous[index] ?? 0);
        const maxValue = Math.max(...currentValues, ...previousValues, 1);

        const width = 680;
        const height = 280;
        const padding = { top: 22, right: 16, bottom: 62, left: 46 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const yTicks = 5;

        const getX = (index: number) => (
            labels.length === 1
                ? padding.left + chartWidth / 2
                : padding.left + (index / (labels.length - 1)) * chartWidth
        );

        const getY = (value: number) => (
            padding.top + chartHeight - (Math.max(value, 0) / maxValue) * chartHeight
        );

        const buildPoints = (values: number[]) => values.map((value, index) => ({
            x: getX(index),
            y: getY(value),
            value,
            label: labels[index]
        }));

        const buildPath = (points: Array<{ x: number; y: number }>) => {
            if (!points.length) return '';
            if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

            let path = `M ${points[0].x} ${points[0].y}`;
            for (let index = 1; index < points.length; index += 1) {
                const prev = points[index - 1];
                const point = points[index];
                const deltaX = point.x - prev.x;
                const cp1x = prev.x + deltaX / 3;
                const cp2x = prev.x + (deltaX * 2) / 3;
                path += ` C ${cp1x} ${prev.y}, ${cp2x} ${point.y}, ${point.x} ${point.y}`;
            }
            return path;
        };

        const buildAreaPath = (points: Array<{ x: number; y: number }>, baselineY: number) => {
            if (!points.length) return '';
            const line = buildPath(points);
            const first = points[0];
            const last = points[points.length - 1];
            return `${line} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
        };

        const currentPoints = buildPoints(currentValues);
        const previousPoints = buildPoints(previousValues);

        return {
            width,
            height,
            padding,
            chartWidth,
            chartHeight,
            labels,
            maxValue,
            yTicks,
            currentPoints,
            previousPoints,
            currentPath: buildPath(currentPoints),
            previousPath: buildPath(previousPoints),
            currentAreaPath: buildAreaPath(currentPoints, padding.top + chartHeight),
            deltaScore: comparison.delta_score
        };
    })();

    const formatScoreLabel = (key: string) =>
        key
            .replaceAll('_', ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());

    const comparisonInsights = useMemo<ComparisonInsights | null>(() => {
        if (!analysis?.comparisonwithprevious) return null;

        const raw = analysis.comparisonwithprevious as unknown as Record<string, unknown>;

        const toArray = (value: unknown): string[] =>
            Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

        const scoreChangesRaw = raw.score_changes as Record<string, unknown> | undefined;
        const scoreChanges: ParsedScoreChange[] = scoreChangesRaw
            ? Object.entries(scoreChangesRaw).flatMap(([key, value]) => {
                if (!value || typeof value !== 'object') return [];
                const row = value as Record<string, unknown>;
                const current = typeof row.current === 'number' ? row.current : 0;
                const previous = typeof row.previous === 'number' ? row.previous : 0;
                const change = typeof row.change === 'number' ? row.change : current - previous;
                return [{
                    key,
                    label: formatScoreLabel(key),
                    current,
                    previous,
                    change
                }];
            })
            : [];

        return {
            deltaScore: typeof raw.delta_score === 'number' ? raw.delta_score : null,
            overallNarrative: typeof raw.overall_narrative === 'string' ? raw.overall_narrative : null,
            keyDifferences: toArray(raw.key_differences),
            improvements: toArray(raw.improvements),
            regressions: toArray(raw.regressions),
            unchanged: toArray(raw.unchanged),
            scoreChanges
        };
    }, [analysis]);

    const metricCards = useMemo(() => {
        const politeness = analysis?.scores?.politeness ?? analysis?.politeness_score ?? 0;
        const confidence = analysis?.scores?.confidence ?? analysis?.confidence_score ?? 0;
        const speakers = analysis?.scores?.speakers ?? analysis?.speakers_detected ?? 2;
        const interestRaw = String(analysis?.scores?.interest ?? analysis?.customer_interest_level ?? 'N/A').toLowerCase();
        const interestScore = interestRaw === 'high' ? 90 : interestRaw === 'medium' ? 65 : interestRaw === 'low' ? 35 : 0;
        const ratingOutOf100 = Math.round(((analysis?.rating || 0) / 10) * 100);

        return { politeness, confidence, speakers, interestRaw, interestScore, ratingOutOf100 };
    }, [analysis]);


    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    if (!ticket) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <p className="text-gray-500">Ticket not found</p>
            </div>
        );
    }

    return (
        <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
            <AdminShell activeSection="tickets">
                <main className="min-h-screen">
                    {/* Header */}
                    <header className="bg-white border-b border-gray-200 px-5 py-4 md:px-7">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
                                <Link
                                    href="/admin/tickets"
                                    className="rounded-full p-2 transition-colors hover:bg-gray-100"
                                >
                                    <ArrowLeft className="w-5 h-5 text-gray-500" />
                                </Link>
                                <nav className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 sm:text-sm">
                                    <Link href="/admin/tickets" className="hover:text-purple-600">Tickets</Link>
                                    <ChevronRight className="w-4 h-4" />
                                    <span className="max-w-[9rem] truncate sm:max-w-none">{ticket.clientname || ticket.client_id}</span>
                                    <ChevronRight className="hidden w-4 h-4 sm:block" />
                                    <span className="font-medium text-gray-900">#{ticket.id.slice(0, 4).toUpperCase()}</span>
                                </nav>
                            </div>

                            <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3 lg:w-auto lg:justify-end">
                                {/* Re-analyze Button */}
                                {reanalyzeStatus === 'idle' && (
                                    <button
                                        onClick={() => setReanalyzeModalOpen(true)}
                                        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-purple-600"
                                    >
                                        <RefreshCcw className="w-4 h-4" />
                                        <span>Re-analyze</span>
                                    </button>
                                )}
                                {reanalyzeStatus === 'analyzing' && (
                                    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                                        <RefreshCcw className="w-4 h-4 animate-spin" />
                                        <span>Analyzing...</span>
                                    </div>
                                )}
                                {reanalyzeStatus === 'analyzed' && (
                                    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                                        <CheckCircle className="w-4 h-4" />
                                        <span>Done! Updated.</span>
                                    </div>
                                )}
                                {reanalyzeStatus === 'failed' && (
                                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                        <XCircle className="w-4 h-4" />
                                        <span>Failed</span>
                                    </div>
                                )}

                                <NotificationBell />

                                <div ref={reportMenuRef} className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsReportMenuOpen((prev) => !prev)}
                                        disabled={reportActionLoading !== null}
                                        className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                        {reportActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                        <span>Export Report</span>
                                    </button>

                                    {isReportMenuOpen && (
                                        <div className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                                            <button
                                                type="button"
                                                onClick={() => { void handleDownloadReport(); }}
                                                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                                            >
                                                Download PDF
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { void handleCopyReportLink(); }}
                                                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                                            >
                                                Copy Share Link
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { void handleShareReport(); }}
                                                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                                            >
                                                Share Link
                                            </button>
                                            {reportShareUrl && (
                                                <a
                                                    href={reportShareUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-1 block rounded-lg px-3 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50"
                                                >
                                                    Open Share Link
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </header>

                    <div className="px-5 py-7 md:px-7 max-w-[90rem] mx-auto space-y-5">
                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="inline-flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5">
                                    <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200 uppercase tracking-wide">
                                        {ticket.status}
                                    </span>
                                    <span className="text-sm font-medium text-gray-500">
                                        {new Date(ticket.createdat).toLocaleString()}
                                    </span>
                                </div>

                                <div className="flex flex-wrap items-stretch gap-3 lg:justify-end">
                                    <div className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:w-auto sm:min-w-[150px]">
                                        <p className="text-xs text-gray-500 uppercase font-semibold mb-1 tracking-wide">Client ID</p>
                                        <p className="text-[1.65rem] leading-none font-semibold text-gray-900">{ticket.client_id}</p>
                                    </div>
                                    <div className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:w-auto sm:min-w-[170px]">
                                        <p className="text-xs text-gray-500 uppercase font-semibold mb-1 tracking-wide">Agent</p>
                                        <div className="flex items-center gap-2.5">
                                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 ring-1 ring-gray-200">
                                                <span className="text-xs font-semibold text-gray-700">JD</span>
                                            </div>
                                            <p className="text-lg font-semibold leading-none text-gray-900">John Doe</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Audio Player */}
                        <div className="ticket-audio-player rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden border border-white/8 bg-[radial-gradient(130%_190%_at_0%_0%,rgba(141,59,197,0.35),rgba(13,16,31,0.97)_54%,rgba(4,7,20,0.98)_100%)] text-white">
                            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(90deg,rgba(141,59,197,0.14),rgba(87,26,155,0.08),transparent)]" />

                            <div className="relative z-10 space-y-4">
                                <div className="ticket-audio-strip rounded-full border border-white/15 bg-[linear-gradient(90deg,rgba(9,12,26,0.93),rgba(6,9,21,0.96))] px-3 py-2.5 sm:px-4 sm:py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
                                    <div className="flex items-center gap-2 sm:gap-3">
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => { void togglePlayback(); }}
                                                className={`ticket-audio-main-btn inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-gradient-to-r from-purple-600 to-indigo-600 text-white transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/35 ${isPlaying ? 'shadow-md shadow-purple-500/35' : ''}`}
                                                aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
                                            >
                                                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                                            </button>
                                            <button
                                                onClick={() => { void restartPlayback(); }}
                                                className="ticket-audio-action-btn hidden h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition-colors hover:bg-white/10 md:inline-flex"
                                                aria-label="Replay from start"
                                            >
                                                <RotateCcw className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => { void seekBy(-10); }}
                                                className="ticket-audio-action-btn inline-flex h-9 min-w-10 items-center justify-center rounded-full border border-white/20 bg-white/5 px-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
                                                aria-label="Skip backward 10 seconds"
                                            >
                                                -10
                                            </button>
                                        </div>

                                        <div className="mx-1 sm:mx-2 md:mx-4 flex min-w-[120px] flex-1 items-center gap-2 sm:gap-3">
                                            <span className="w-11 text-right font-mono text-xs text-gray-200">
                                                {formatTime(displayedCurrentTime)}
                                            </span>

                                            <div className="relative flex h-4 flex-1 items-center group">
                                                <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/20 transition-shadow duration-200 ease-out group-hover:shadow-[0_0_0_3px_rgba(168,85,247,0.16)]" />
                                                <div
                                                    className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/35 transition-[width] duration-200 ease-out"
                                                    style={{ width: `${bufferedPercent}%` }}
                                                />
                                                <div
                                                    className={`absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gradient-to-r from-purple-600 via-purple-400 to-indigo-300 ${isScrubbing ? '' : 'transition-[width] duration-200 ease-out'}`}
                                                    style={{ width: `${progressPercent}%` }}
                                                />
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={Math.max(duration, 0.1)}
                                                    step={0.01}
                                                    value={displayedCurrentTime}
                                                    onMouseDown={() => setIsScrubbing(true)}
                                                    onTouchStart={() => setIsScrubbing(true)}
                                                    onChange={(event) => handleSeekInput(Number(event.currentTarget.value))}
                                                    onMouseUp={commitScrub}
                                                    onTouchEnd={commitScrub}
                                                    onKeyUp={commitScrub}
                                                    onBlur={commitScrub}
                                                    className={`ticket-audio-seek-input relative z-10 h-4 w-full cursor-pointer appearance-none bg-transparent accent-purple-500 ${isScrubbing ? 'ticket-audio-seek-input--dragging' : ''}`}
                                                    aria-label="Seek timeline"
                                                />
                                            </div>

                                            <span className="w-11 font-mono text-xs text-gray-300">
                                                {formatTime(duration)}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => { void seekBy(10); }}
                                                className="ticket-audio-action-btn inline-flex h-9 min-w-10 items-center justify-center rounded-full border border-white/20 bg-white/5 px-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
                                                aria-label="Skip forward 10 seconds"
                                            >
                                                +10
                                            </button>

                                            <button
                                                onClick={toggleMute}
                                                className="ticket-audio-action-btn inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition-colors hover:bg-white/10"
                                                aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                                            >
                                                <VolumeIcon className="w-4 h-4" />
                                            </button>

                                            <div className="ticket-audio-volume-shell">
                                                <div className="ticket-audio-volume-track ticket-audio-volume-track-base" />
                                                <div
                                                    className="ticket-audio-volume-track ticket-audio-volume-track-fill"
                                                    style={{ width: `${volumePercent}%` }}
                                                />
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={1}
                                                    step={0.01}
                                                    value={effectiveVolume}
                                                    onChange={(event) => applyVolume(Number(event.currentTarget.value))}
                                                    className="ticket-audio-volume-input ticket-audio-volume-inline"
                                                    aria-label="Volume"
                                                />
                                            </div>

                                            <button
                                                onClick={cyclePlaybackSpeed}
                                                className="ticket-audio-action-btn inline-flex h-9 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/5 px-2 text-white transition-colors hover:bg-white/10"
                                                aria-label={`Playback speed ${formatSpeed(playbackSpeed)}`}
                                                title="Cycle playback speed"
                                            >
                                                <Gauge className="w-4 h-4" />
                                                <span className="hidden sm:inline text-xs font-semibold">{formatSpeed(playbackSpeed)}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {audioError && (
                                    <p className="text-xs text-red-300 px-1">{audioError}</p>
                                )}
                                {!audioUrl && (
                                    <p className="text-xs text-amber-200 px-1">Requesting signed playback URL from backend...</p>
                                )}
                            </div>

                            <audio
                                ref={audioRef}
                                src={audioUrl || undefined}
                                className="hidden"
                                preload="metadata"
                                crossOrigin="anonymous"
                                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                                onProgress={updateBufferedProgress}
                                onLoadedMetadata={(e) => {
                                    const audioDuration = Number.isFinite(e.currentTarget.duration)
                                        ? e.currentTarget.duration
                                        : 0;
                                    setDuration(audioDuration);
                                    e.currentTarget.playbackRate = playbackSpeed;
                                    e.currentTarget.volume = clamp(volume, 0, 1);
                                    e.currentTarget.muted = isMuted;
                                    updateBufferedProgress();
                                    setAudioError(null);
                                }}
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                onEnded={() => {
                                    setIsPlaying(false);
                                    setCurrentTime(0);
                                    setScrubTime(null);
                                }}
                                onError={() => {
                                    setAudioError('Failed to load recording URL.');
                                    setIsPlaying(false);
                                }}
                            />
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                            <div
                                title={`Exact score: ${metricCards.politeness} / 100`}
                                className="group relative overflow-hidden bg-white p-5 rounded-2xl border border-gray-200 shadow-sm transition-shadow hover:shadow-lg"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-500 uppercase">Politeness</span>
                                    <Smile className="w-5 h-5 text-green-500 transition-transform group-hover:scale-110" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-semibold text-gray-900">{metricCards.politeness}%</span>
                                    <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">High</span>
                                </div>
                                <p className="ticket-metric-score-hint pointer-events-none absolute left-5 bottom-4 inline-flex rounded-md border border-gray-200 bg-white/95 px-2 py-1 text-[11px] text-gray-600 opacity-0 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0">
                                    Exact score: {metricCards.politeness} / 100
                                </p>
                            </div>

                            <div
                                title={`Exact score: ${metricCards.confidence} / 100`}
                                className="group relative overflow-hidden bg-white p-5 rounded-2xl border border-gray-200 shadow-sm transition-shadow hover:shadow-lg"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-500 uppercase">Confidence</span>
                                    <Zap className="w-5 h-5 text-blue-500 transition-transform group-hover:scale-110" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-semibold text-gray-900">{metricCards.confidence}%</span>
                                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Steady</span>
                                </div>
                                <p className="ticket-metric-score-hint pointer-events-none absolute left-5 bottom-4 inline-flex rounded-md border border-gray-200 bg-white/95 px-2 py-1 text-[11px] text-gray-600 opacity-0 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0">
                                    Exact score: {metricCards.confidence} / 100
                                </p>
                            </div>

                            <div
                                title={`Exact score: ${metricCards.interestScore} / 100`}
                                className="group relative overflow-hidden bg-gradient-to-br from-purple-600 to-indigo-700 text-white p-5 rounded-2xl border border-transparent shadow-sm transition-shadow hover:shadow-lg"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-white/80 uppercase">Interest</span>
                                    <ThumbsUp className="w-5 h-5 text-white transition-transform group-hover:scale-110" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-semibold uppercase">{metricCards.interestRaw}</span>
                                </div>
                                <p className="ticket-metric-score-hint pointer-events-none absolute left-5 bottom-4 inline-flex rounded-md border border-white/25 bg-black/20 px-2 py-1 text-[11px] text-white/90 opacity-0 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0">
                                    Mapped score: {metricCards.interestScore} / 100
                                </p>
                            </div>

                            <div
                                title={`Exact score: ${Math.min(metricCards.speakers * 50, 100)} / 100`}
                                className="group relative overflow-hidden bg-white p-5 rounded-2xl border border-gray-200 shadow-sm transition-shadow hover:shadow-lg"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-500 uppercase">Speakers</span>
                                    <Users className="w-5 h-5 text-gray-400 transition-transform group-hover:scale-110" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-semibold text-gray-900">{metricCards.speakers}</span>
                                    <div className="flex -space-x-2">
                                        <div className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white" />
                                        <div className="w-6 h-6 rounded-full bg-purple-200 border-2 border-white" />
                                    </div>
                                </div>
                                <p className="ticket-metric-score-hint pointer-events-none absolute left-5 bottom-4 inline-flex rounded-md border border-gray-200 bg-white/95 px-2 py-1 text-[11px] text-gray-600 opacity-0 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0">
                                    Conversation complexity: {Math.min(metricCards.speakers * 50, 100)} / 100
                                </p>
                            </div>

                            <div
                                title={`Exact score: ${metricCards.ratingOutOf100} / 100`}
                                className="group relative overflow-hidden bg-white p-5 rounded-2xl border border-gray-200 shadow-sm transition-shadow hover:shadow-lg"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-500 uppercase">Rating</span>
                                    <Star className="w-5 h-5 text-amber-400 fill-amber-400 transition-transform group-hover:scale-110" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-2xl font-semibold text-gray-900">{Math.round((analysis?.rating || 0) / 2)} <span className="text-base text-gray-400 font-normal">/ 5</span></span>
                                    {renderStars(analysis?.rating || 0)}
                                </div>
                                <p className="ticket-metric-score-hint pointer-events-none absolute left-5 bottom-4 inline-flex rounded-md border border-gray-200 bg-white/95 px-2 py-1 text-[11px] text-gray-600 opacity-0 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0">
                                    Exact score: {metricCards.ratingOutOf100} / 100
                                </p>
                            </div>
                        </div>

                        {/* Main Analysis Grid */}
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                            <div className="xl:col-span-2 space-y-6">
                                {/* Executive Brief */}
                                <div className="space-y-6">
                                    <div className="bg-white p-7 rounded-2xl border border-gray-200 shadow-sm">
                                        <div className="flex items-center gap-2 mb-6">
                                            <div className="p-2 bg-purple-100 rounded-lg">
                                                <Zap className="w-5 h-5 text-purple-600" />
                                            </div>
                                            <h2 className="text-lg font-semibold text-gray-900">Executive Brief</h2>
                                        </div>

                                        <p className="text-[15px] leading-8 text-gray-700">{analysis?.summary || 'No summary available.'}</p>

                                        <div className="mt-6 flex flex-wrap gap-2">
                                            {ticket.visittype && (
                                                <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-sm font-medium">
                                                    #{ticket.visittype}
                                                </span>
                                            )}
                                            <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-sm font-medium">
                                                #Pricing
                                            </span>
                                            <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-sm font-medium">
                                                #Negotiation
                                            </span>
                                        </div>
                                    </div>

                                    {/* Objections / Action Items */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Objections */}
                                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                            <div className="flex items-center gap-2 mb-4 text-red-600">
                                                <AlertCircle className="w-5 h-5" />
                                                <h3 className="text-lg font-semibold">Key Objections</h3>
                                            </div>
                                            <ul className="space-y-3">
                                                {analysis?.objections?.length ? (
                                                    analysis.objections.map((obj, i) => (
                                                        <li key={i} className="analysis-objection-item flex gap-3 items-start p-4 rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-sm">
                                                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600 shrink-0 mt-0.5">
                                                                <AlertCircle className="w-4 h-4" />
                                                            </span>
                                                            <div className="flex-1">
                                                                <p className="text-base leading-7 text-gray-900 font-semibold">
                                                                    {typeof obj === 'string' ? obj : obj.objection}
                                                                </p>
                                                                {typeof obj !== 'string' && obj.response && (
                                                                    <p className="text-sm leading-6 text-gray-600 mt-1.5">Response: {obj.response}</p>
                                                                )}
                                                            </div>
                                                        </li>
                                                    ))
                                                ) : (
                                                    <p className="text-gray-500 text-sm italic">No objections detected.</p>
                                                )}
                                            </ul>
                                        </div>

                                        {/* Action Items */}
                                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                            <div className="flex items-center gap-2 mb-4 text-green-600">
                                                <Sparkles className="w-5 h-5" />
                                                <h3 className="text-lg font-semibold">Next Steps</h3>
                                            </div>
                                            {hasAnyActionItems ? (
                                                <div className="space-y-4">
                                                    {aiActionItems.length > 0 && (
                                                        <ul className="space-y-3">
                                                            {aiActionItems.map((item, i) => (
                                                                <li key={`ai-${i}`} className="analysis-next-step-item flex gap-3 items-start p-4 rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-sm">
                                                                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700 shrink-0 mt-0.5">
                                                                        <ChevronRight className="w-4 h-4" />
                                                                    </span>
                                                                    <span className="text-base leading-7 text-gray-900 font-semibold">{item}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}

                                                    {trackedActionItems.length > 0 && (
                                                        <ul className="space-y-3">
                                                            {trackedActionItems.map((item) => (
                                                                <li key={item.id} className="flex gap-3 items-start p-4 bg-blue-50 rounded-xl border border-blue-100 transition-all hover:-translate-y-0.5 hover:shadow-sm">
                                                                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full shrink-0 mt-0.5 ${item.completed ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                                                                        <ChevronRight className="w-4 h-4" />
                                                                    </span>
                                                                    <div className="flex-1">
                                                                        <p className="text-sm text-gray-900 font-semibold">{item.title}</p>
                                                                        {item.description && (
                                                                            <p className="text-xs text-gray-600 mt-1">{item.description}</p>
                                                                        )}
                                                                        <div className="flex gap-2 mt-2">
                                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.completed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                                {item.completed ? 'COMPLETED' : 'OPEN'}
                                                                            </span>
                                                                            {item.due_date && (
                                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                                                                    DUE {new Date(item.due_date).toLocaleDateString()}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-gray-500 text-sm italic">No action items detected.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white p-5 md:p-6 rounded-2xl border border-gray-200 shadow-sm">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                <h3 className="text-base md:text-lg font-semibold text-gray-900">Current vs Previous Conversation</h3>
                                <div className="flex items-center gap-4 text-xs font-medium">
                                    <div className="flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--chart-previous)' }} />
                                        <span className="text-gray-500">Previous</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--chart-current)' }} />
                                        <span className="text-gray-700">Current</span>
                                    </div>
                                </div>
                            </div>

                            {comparisonChart ? (
                                <div className="ticket-advanced-chart overflow-x-auto border border-gray-200/70 p-3 md:p-4">
                                    <svg
                                        viewBox={`0 0 ${comparisonChart.width} ${comparisonChart.height}`}
                                        className="w-full min-w-[520px]"
                                        onMouseLeave={() => setHoveredChartPoint(null)}
                                    >
                                        <defs>
                                            <linearGradient id="chart-current-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" stopColor="#a855f7" />
                                                <stop offset="100%" stopColor="#4f46e5" />
                                            </linearGradient>
                                            <linearGradient id="chart-current-area" x1="0%" y1="0%" x2="0%" y2="100%">
                                                <stop offset="0%" stopColor="var(--chart-current)" stopOpacity="0.45" />
                                                <stop offset="100%" stopColor="var(--chart-current)" stopOpacity="0.03" />
                                            </linearGradient>
                                            <filter id="chart-current-glow" x="-20%" y="-20%" width="140%" height="140%">
                                                <feGaussianBlur stdDeviation="3" result="blur" />
                                                <feMerge>
                                                    <feMergeNode in="blur" />
                                                    <feMergeNode in="SourceGraphic" />
                                                </feMerge>
                                            </filter>
                                        </defs>

                                        {[...Array(comparisonChart.yTicks)].map((_, tickIndex) => {
                                            const ratio = tickIndex / (comparisonChart.yTicks - 1);
                                            const y = comparisonChart.padding.top + ratio * comparisonChart.chartHeight;
                                            const value = Math.round((1 - ratio) * comparisonChart.maxValue);
                                            return (
                                                <g key={`y-grid-compact-${tickIndex}`}>
                                                    <line
                                                        x1={comparisonChart.padding.left}
                                                        y1={y}
                                                        x2={comparisonChart.padding.left + comparisonChart.chartWidth}
                                                        y2={y}
                                                        stroke="var(--chart-grid)"
                                                        strokeOpacity="0.45"
                                                        strokeWidth="1"
                                                    />
                                                    <text x={comparisonChart.padding.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--chart-grid-label)">
                                                        {value}
                                                    </text>
                                                </g>
                                            );
                                        })}

                                        {comparisonChart.labels.map((label, index) => {
                                            const point = comparisonChart.currentPoints[index];
                                            return (
                                                <g key={`compact-x-${label}-${index}`}>
                                                    <line
                                                        x1={point.x}
                                                        y1={comparisonChart.padding.top}
                                                        x2={point.x}
                                                        y2={comparisonChart.padding.top + comparisonChart.chartHeight}
                                                        stroke="var(--chart-grid)"
                                                        strokeOpacity="0.16"
                                                        strokeWidth="1"
                                                    />
                                                    <text
                                                        x={point.x}
                                                        y={comparisonChart.padding.top + comparisonChart.chartHeight + 26}
                                                        textAnchor="middle"
                                                        dominantBaseline="middle"
                                                        fontSize="11"
                                                        fill="var(--chart-grid-label)"
                                                        className="font-medium"
                                                    >
                                                        {label}
                                                    </text>
                                                </g>
                                            );
                                        })}

                                        <path d={comparisonChart.currentAreaPath} fill="url(#chart-current-area)" />
                                        <path d={comparisonChart.previousPath} fill="none" stroke="var(--chart-previous)" strokeDasharray="7 6" strokeWidth="2.5" />
                                        <path d={comparisonChart.currentPath} fill="none" stroke="url(#chart-current-stroke)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#chart-current-glow)" />

                                        {comparisonChart.currentPoints.map((point, index) => (
                                            <g
                                                key={`compact-current-${index}`}
                                                onMouseEnter={() => setHoveredChartPoint({
                                                    x: point.x,
                                                    y: point.y,
                                                    label: comparisonChart.labels[index],
                                                    current: point.value,
                                                    previous: comparisonChart.previousPoints[index]?.value ?? 0
                                                })}
                                            >
                                                <title>{`${comparisonChart.labels[index]}: ${Math.round(point.value)}/100`}</title>
                                                <circle cx={point.x} cy={point.y} r="7.8" fill="var(--chart-current)" fillOpacity="0.16" />
                                                <circle cx={point.x} cy={point.y} r="4.8" fill="var(--chart-current)" stroke="#ffffff" strokeWidth="1.4" />
                                            </g>
                                        ))}

                                        {comparisonChart.previousPoints.map((point, index) => (
                                            <g
                                                key={`compact-prev-${index}`}
                                                onMouseEnter={() => setHoveredChartPoint({
                                                    x: point.x,
                                                    y: point.y,
                                                    label: comparisonChart.labels[index],
                                                    current: comparisonChart.currentPoints[index]?.value ?? 0,
                                                    previous: point.value
                                                })}
                                            >
                                                <title>{`${comparisonChart.labels[index]}: previous ${Math.round(point.value)}/100`}</title>
                                                <circle cx={point.x} cy={point.y} r="4.1" fill="var(--chart-previous)" />
                                            </g>
                                        ))}

                                        {hoveredChartPoint && (
                                            <g pointerEvents="none" transform={`translate(${Math.max(110, Math.min(comparisonChart.width - 110, hoveredChartPoint.x))},${Math.max(42, hoveredChartPoint.y - 52)})`}>
                                                <rect x="-96" y="-38" width="192" height="56" rx="10" fill="rgba(10,10,14,0.92)" stroke="rgba(255,255,255,0.15)" />
                                                <text x="0" y="-20" textAnchor="middle" fontSize="11" fill="#e5e7eb" fontWeight="600">{hoveredChartPoint.label}</text>
                                                <text x="0" y="-5" textAnchor="middle" fontSize="10.5" fill="#c4b5fd">{`Current: ${Math.round(hoveredChartPoint.current)} / 100`}</text>
                                                <text x="0" y="10" textAnchor="middle" fontSize="10.5" fill="#d1d5db">{`Previous: ${Math.round(hoveredChartPoint.previous)} / 100`}</text>
                                            </g>
                                        )}
                                    </svg>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 italic">No comparable previous analysis available.</p>
                            )}

                            {comparisonInsights && (
                                <div className="mt-5 space-y-3">
                                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                                        <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white p-4">
                                            <p className="text-[11px] uppercase tracking-wider text-purple-700 mb-2">Overall Narrative</p>
                                            <p className="text-sm text-gray-700 leading-relaxed">
                                                {comparisonInsights.overallNarrative || 'No narrative generated for this comparison yet.'}
                                            </p>
                                            {comparisonInsights.keyDifferences.length > 0 && (
                                                <ul className="mt-3 space-y-1.5">
                                                    {comparisonInsights.keyDifferences.map((item, idx) => (
                                                        <li key={`${item}-${idx}`} className="text-xs text-gray-600 leading-relaxed">- {item}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>

                                        <div className={`rounded-xl border p-4 ${comparisonInsights.deltaScore !== null && comparisonInsights.deltaScore >= 0 ? 'border-green-200 bg-green-50/60' : 'border-red-200 bg-red-50/60'}`}>
                                            <p className="text-[11px] uppercase tracking-wider text-gray-600 mb-1">Delta Summary</p>
                                            <div className="flex items-center justify-between">
                                                <p className={`text-3xl font-semibold ${comparisonInsights.deltaScore !== null && comparisonInsights.deltaScore >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {comparisonInsights.deltaScore ?? 0}
                                                </p>
                                                {comparisonInsights.deltaScore !== null && comparisonInsights.deltaScore > 0 ? <TrendingUp className="w-5 h-5 text-green-600" /> :
                                                    comparisonInsights.deltaScore !== null && comparisonInsights.deltaScore < 0 ? <TrendingDown className="w-5 h-5 text-red-600" /> :
                                                        <Minus className="w-5 h-5 text-gray-500" />}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-2">Overall movement vs previous visit</p>
                                            {previousAnalysis?.rating !== undefined && (
                                                <p className="mt-3 text-sm text-gray-600">
                                                    Previous rating: <span className="font-semibold">{previousAnalysis.rating}</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {comparisonInsights.scoreChanges.length > 0 && (
                                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                                            <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">Skill Score Changes</p>
                                            <div className="space-y-2.5">
                                                {comparisonInsights.scoreChanges.map((row) => (
                                                    <div key={row.key} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <p className="text-sm font-semibold text-gray-900">{row.label}</p>
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${row.change > 0 ? 'bg-green-100 text-green-700' : row.change < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                {row.change > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : row.change < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                                                                {row.change > 0 ? `+${row.change}` : row.change}
                                                            </span>
                                                        </div>
                                                        <div className="mt-2 h-1.5 rounded-full bg-gray-200">
                                                            <div className={`h-1.5 rounded-full ${row.change > 0 ? 'bg-green-500' : row.change < 0 ? 'bg-red-500' : 'bg-gray-400'}`} style={{ width: `${Math.min(100, Math.max(8, row.current))}%` }} />
                                                        </div>
                                                        <p className="mt-1.5 text-xs text-gray-500">{`Previous ${row.previous}/100 -> Current ${row.current}/100`}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div className="rounded-xl border border-green-200 bg-white p-3">
                                            <p className="text-xs uppercase tracking-wide text-green-700 mb-2">Improvements</p>
                                            <ul className="space-y-1.5">
                                                {(comparisonInsights.improvements.length > 0 ? comparisonInsights.improvements : ['No explicit improvements listed.']).map((item, idx) => (
                                                    <li key={`${item}-${idx}`} className="text-xs text-gray-700 leading-relaxed">- {item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="rounded-xl border border-red-200 bg-white p-3">
                                            <p className="text-xs uppercase tracking-wide text-red-700 mb-2">Regressions</p>
                                            <ul className="space-y-1.5">
                                                {(comparisonInsights.regressions.length > 0 ? comparisonInsights.regressions : ['No regressions identified.']).map((item, idx) => (
                                                    <li key={`${item}-${idx}`} className="text-xs text-gray-700 leading-relaxed">- {item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="rounded-xl border border-gray-200 bg-white p-3">
                                            <p className="text-xs uppercase tracking-wide text-gray-600 mb-2">Unchanged</p>
                                            <ul className="space-y-1.5">
                                                {(comparisonInsights.unchanged.length > 0 ? comparisonInsights.unchanged : ['No unchanged items listed.']).map((item, idx) => (
                                                    <li key={`${item}-${idx}`} className="text-xs text-gray-700 leading-relaxed">- {item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}
                            </div>
                            </div>

                            <div className="xl:col-span-1 space-y-6">
                                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm xl:sticky xl:top-24">
                                    <div className="flex items-center gap-2 mb-6">
                                        <div className="p-2 bg-blue-100 rounded-lg">
                                            <Clock className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <h2 className="text-lg font-semibold text-gray-900">Key Moments</h2>
                                    </div>

                                    <div
                                        ref={momentsContainerRef}
                                        className="space-y-5 relative max-h-[360px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
                                    >
                                        <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-gray-100 min-h-full" />
                                        {sortedMoments.length ? (
                                            sortedMoments.map((moment, i) => {
                                                const isActive = i === activeMomentIndex;
                                                const momentTime = moment.time || moment.timestamp || '00:00';
                                                const momentLabel = moment.label || moment.description || 'Key moment';
                                                const momentDescription = moment.description || moment.label || '';
                                                return (
                                                    <div
                                                        key={i}
                                                        ref={(el) => { momentRefs.current[i] = el; }}
                                                        onClick={() => seekToMoment(momentTime)}
                                                        className={`relative pl-10 group cursor-pointer p-3 rounded-xl transition-all duration-300 border ${isActive
                                                            ? 'bg-purple-50 border-purple-200 shadow-sm scale-[1.01]'
                                                            : 'hover:bg-gray-50 border-transparent'
                                                            }`}
                                                    >
                                                        <div className={`absolute left-[11px] top-7 w-2.5 h-2.5 rounded-full border-2 border-white ring-2 z-10 transition-colors ${isActive ? 'bg-purple-600 ring-purple-200 scale-125' :
                                                            moment.sentiment === 'positive' ? 'bg-green-500 ring-green-100' :
                                                                moment.sentiment === 'negative' ? 'bg-red-500 ring-red-100' :
                                                                    'bg-gray-400 ring-gray-100'
                                                            }`} />

                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded transition-colors ${isActive ? 'text-purple-700 bg-purple-100' : 'text-gray-500 bg-gray-100'}`}>
                                                                {momentTime}
                                                            </span>
                                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${getSentimentColor(moment.sentiment)}`}>
                                                                {moment.sentiment}
                                                            </span>
                                                        </div>
                                                        <h4 className={`font-semibold text-sm mb-1 transition-colors ${isActive ? 'text-purple-900' : 'text-gray-900 group-hover:text-purple-600'}`}>
                                                            {momentLabel}
                                                        </h4>
                                                        <p className={`text-xs line-clamp-2 transition-colors ${isActive ? 'text-purple-700' : 'text-gray-500'}`}>
                                                            &quot;{momentDescription}&quot;
                                                        </p>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <p className="text-gray-500 text-sm italic pl-10">No key moments found.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                    <h3 className="text-base font-semibold text-gray-900 mb-4">Raw Analysis JSON</h3>
                                    <div className="max-h-[280px] overflow-auto rounded-lg border border-gray-200 bg-gray-950 p-4">
                                        <pre className="text-xs text-green-200 whitespace-pre-wrap break-words">
                                            {analysis
                                                ? JSON.stringify(analysis, null, 2)
                                                : 'No analysis JSON found for this ticket.'}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Excuses Timeline */}
                        {excuses.length > 0 && (
                            <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-5">
                                    <div className="p-2 bg-amber-100 rounded-lg">
                                        <AlertCircle className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900">Excuse Timeline</h3>
                                </div>

                                <div className="space-y-4">
                                    {excuses.map((excuse) => (
                                        <div key={excuse.id} className="p-4 rounded-xl border border-gray-200 bg-gray-50">
                                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                                <div>
                                                    <p className="font-semibold text-gray-900">
                                                        {excuse.reason_details?.trim() || formatExcuseReason(excuse.reason)}
                                                    </p>
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        {formatExcuseReason(excuse.reason)} - {excuse.employee?.fullname || 'Unknown employee'}
                                                    </p>
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-full border text-xs font-semibold uppercase ${getExcuseStatusClass(excuse.status)}`}>
                                                    {excuse.status}
                                                </span>
                                            </div>

                                            <div className="mt-3 text-sm text-gray-600 grid md:grid-cols-2 gap-2">
                                                <p>Submitted: {new Date(excuse.submitted_at).toLocaleString()}</p>
                                                <p>Estimated Start: {excuse.estimated_start_time ? new Date(excuse.estimated_start_time).toLocaleString() : 'N/A'}</p>
                                            </div>

                                            {excuse.admin_notes && (
                                                <div className="mt-3 p-3 rounded-lg border border-gray-200 bg-white">
                                                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Admin Notes</p>
                                                    <p className="text-sm text-gray-700">{excuse.admin_notes}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Suggestions Section */}
                        {analysis?.improvementsuggestions && analysis.improvementsuggestions.length > 0 && (
                            <div className="bg-white p-6 md:p-7 rounded-2xl border border-gray-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <Sparkles className="w-5 h-5 text-amber-500" />
                                    <h3 className="text-lg font-semibold text-gray-900">Improvement Suggestions</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {analysis.improvementsuggestions.map((suggestion, i) => (
                                        <div key={i} className="analysis-suggestion-item p-4 rounded-xl transition-all hover:shadow-sm">
                                            <div className="flex items-start gap-3">
                                                <div className="analysis-suggestion-index h-7 w-7 rounded-lg bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 text-sm font-semibold flex items-center justify-center border border-amber-200 shadow-sm">
                                                    {i + 1}
                                                </div>
                                                <p className="text-sm leading-6 text-gray-800">{suggestion}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </AdminShell>

            {/* Re-analyze Confirmation Modal */}
            {
                isReanalyzeModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                            <div className="flex items-center gap-3 mb-4 text-amber-600">
                                <AlertTriangle className="w-6 h-6" />
                                <h3 className="text-lg font-semibold text-gray-900">Re-analyze Ticket?</h3>
                            </div>

                            <p className="text-gray-600 mb-6">
                                This will re-run the AI analysis and overwrite all existing scores, key moments, and insights with new data. This may take 30-60 seconds.
                            </p>

                            <div className="flex items-center justify-end gap-3">
                                <button
                                    onClick={() => setReanalyzeModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => reanalyze(id)}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center gap-2"
                                >
                                    <RefreshCcw className="w-4 h-4" />
                                    Yes, Re-analyze
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </ProtectedRoute >
    );
}


