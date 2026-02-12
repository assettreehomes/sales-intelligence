'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useTicketDetailStore } from '@/stores/ticketDetailStore';
import {
    ArrowLeft,
    Play,
    Pause,
    RotateCcw,
    RotateCw,
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
    Bell,
    User,
    Radio,
    BarChart3,
    AlertCircle,
    RefreshCcw,
    LogOut
} from 'lucide-react';
import Link from 'next/link';

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { profile, signOut } = useAuth();

    // Zustand store — replaces all useState
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
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const momentsContainerRef = useRef<HTMLDivElement>(null);
    const momentRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [audioError, setAudioError] = useState<string | null>(null);
    const [actionCompletion, setActionCompletion] = useState<Record<string, boolean>>({});
    const [customActionInput, setCustomActionInput] = useState('');
    const [customActions, setCustomActions] = useState<Array<{ id: string; text: string; completed: boolean }>>([]);
    const [showCustomInput, setShowCustomInput] = useState(false);

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

    const ensureSignedAudioUrl = async (forceRefresh = false) => {
        const resolvedUrl = await fetchAudioUrl(id, forceRefresh || !audioUrl);
        if (!resolvedUrl) {
            setAudioError('Backend could not generate a signed audio URL for this ticket.');
            return null;
        }
        setAudioError(null);
        return resolvedUrl;
    };

    const togglePlayback = async () => {
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
    };

    const seekBy = async (deltaSeconds: number) => {
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

        audio.currentTime = next;
        setCurrentTime(next);
    };

    const seekToMoment = async (momentTime: string | number | null | undefined) => {
        const seconds = Math.max(0, parseTime(momentTime));
        const signedUrl = await ensureSignedAudioUrl(false);
        if (!signedUrl) return;

        const audio = audioRef.current;

        setCurrentTime(seconds);

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

    const recommendedActions = useMemo(() => {
        const fromAi = aiActionItems.map((text, idx) => ({
            id: `ai-${idx}`,
            text,
            completed: actionCompletion[`ai-${idx}`] ?? false
        }));

        const fromDb = trackedActionItems.map((item) => ({
            id: `db-${item.id}`,
            text: item.description ? `${item.title} (${item.description})` : item.title,
            completed: actionCompletion[`db-${item.id}`] ?? item.completed
        }));

        const fromCustom = customActions.map((item) => ({
            id: item.id,
            text: item.text,
            completed: actionCompletion[item.id] ?? item.completed
        }));

        return [...fromAi, ...fromDb, ...fromCustom];
    }, [aiActionItems, trackedActionItems, customActions, actionCompletion]);

    const toggleAction = (actionId: string) => {
        setActionCompletion((prev) => ({
            ...prev,
            [actionId]: !(prev[actionId] ?? false)
        }));
    };

    const addCustomAction = () => {
        const text = customActionInput.trim();
        if (!text) return;
        const customId = `custom-${Date.now()}`;
        setCustomActions((prev) => [...prev, { id: customId, text, completed: false }]);
        setCustomActionInput('');
        setShowCustomInput(false);
    };

    const radarChart = (() => {
        if (!comparison || !comparison.labels?.length) return null;

        const size = 360;
        const center = size / 2;
        const radius = 120;
        const levels = 4;
        const maxValue = Math.max(...comparison.current, ...comparison.previous, 1);
        const angleStep = (Math.PI * 2) / comparison.labels.length;

        const getPoint = (index: number, value: number) => {
            const angle = -Math.PI / 2 + angleStep * index;
            const r = (value / maxValue) * radius;
            return {
                x: center + Math.cos(angle) * r,
                y: center + Math.sin(angle) * r
            };
        };

        const buildPolygon = (values: number[]) =>
            values
                .map((value, index) => {
                    const p = getPoint(index, value);
                    return `${p.x},${p.y}`;
                })
                .join(' ');

        return {
            size,
            center,
            radius,
            levels,
            labels: comparison.labels,
            current: comparison.current,
            previous: comparison.previous,
            maxValue,
            angleStep,
            getPoint,
            currentPolygon: buildPolygon(comparison.current),
            previousPolygon: buildPolygon(comparison.previous),
            deltaScore: comparison.delta_score
        };
    })();


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
            <div className="flex min-h-screen bg-gray-50">
                {/* Sidebar - Same as Dashboard */}
                <aside className="w-60 bg-white border-r border-gray-200 flex flex-col fixed h-full z-10">
                    <div className="p-6">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                                <span className="text-white text-lg">✦</span>
                            </div>
                            <span className="font-bold text-lg text-gray-900">TicketIntel</span>
                        </div>
                    </div>

                    <nav className="flex-1 px-3">
                        <Link href="/admin/tickets" className="w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 bg-purple-600 text-white transition-all">
                            <Radio className="w-5 h-5" />
                            <span className="font-medium">Tickets</span>
                        </Link>
                        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 text-gray-600 hover:bg-gray-100 transition-all">
                            <BarChart3 className="w-5 h-5" />
                            <span className="font-medium">Analytics</span>
                        </button>
                        <Link href="/admin/excuses" className="w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 text-gray-600 hover:bg-gray-100 transition-all">
                            <AlertCircle className="w-5 h-5" />
                            <span className="font-medium">Excuses</span>
                        </Link>
                        <Link href="/admin/assign" className="w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 text-gray-600 hover:bg-gray-100 transition-all">
                            <Users className="w-5 h-5" />
                            <span className="font-medium">Assign</span>
                        </Link>
                    </nav>

                    <div className="p-4 border-t border-gray-200">
                        <div className="mt-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                                <User className="w-5 h-5 text-purple-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 truncate">{profile?.fullname}</p>
                                <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
                            </div>
                        </div>

                        <button
                            onClick={async () => { await signOut(); router.push('/login'); }}
                            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
                        >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </button>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 ml-60">
                    {/* Header */}
                    <header className="bg-white border-b border-gray-200 px-8 py-4 sticky top-0 z-10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Link
                                    href="/admin/tickets"
                                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                >
                                    <ArrowLeft className="w-5 h-5 text-gray-500" />
                                </Link>
                                <nav className="flex items-center gap-2 text-sm text-gray-500">
                                    <Link href="/admin/tickets" className="hover:text-purple-600">Tickets</Link>
                                    <ChevronRight className="w-4 h-4" />
                                    <span>{ticket.clientname || ticket.client_id}</span>
                                    <ChevronRight className="w-4 h-4" />
                                    <span className="font-medium text-gray-900">#{ticket.id.slice(0, 4).toUpperCase()}</span>
                                </nav>
                            </div>

                            <div className="flex items-center gap-3">
                                {/* Re-analyze Button */}
                                {reanalyzeStatus === 'idle' && (
                                    <button
                                        onClick={() => setReanalyzeModalOpen(true)}
                                        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 hover:text-purple-600 transition-colors shadow-sm font-medium text-sm"
                                    >
                                        <RefreshCcw className="w-4 h-4" />
                                        <span>Re-analyze</span>
                                    </button>
                                )}
                                {reanalyzeStatus === 'analyzing' && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 text-sm font-medium">
                                        <RefreshCcw className="w-4 h-4 animate-spin" />
                                        <span>Analyzing...</span>
                                    </div>
                                )}
                                {reanalyzeStatus === 'analyzed' && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg border border-green-200 text-sm font-medium">
                                        <CheckCircle className="w-4 h-4" />
                                        <span>Done! Updated.</span>
                                    </div>
                                )}
                                {reanalyzeStatus === 'failed' && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm font-medium">
                                        <XCircle className="w-4 h-4" />
                                        <span>Failed</span>
                                    </div>
                                )}

                                <button className="p-2 hover:bg-gray-100 rounded-full">
                                    <Bell className="w-5 h-5 text-gray-500" />
                                </button>
                                <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm">
                                    <Download className="w-4 h-4" />
                                    <span>Export Report</span>
                                </button>
                            </div>
                        </div>
                    </header>

                    <div className="p-8 max-w-7xl mx-auto space-y-6">
                        {/* Title Section */}
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200 uppercase tracking-wide">
                                        {ticket.status}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                        {new Date(ticket.createdat).toLocaleString()}
                                    </span>
                                </div>
                                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                                    Ticket #{ticket.id.slice(0, 4).toUpperCase()} - {ticket.clientname || 'Client Analysis'}
                                </h1>
                                <p className="text-gray-500 text-lg">
                                    Customer Intelligence Report • {ticket.visittype.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </p>
                            </div>

                            <div className="flex gap-4">
                                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm min-w-[140px]">
                                    <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Client ID</p>
                                    <p className="text-lg font-bold text-gray-900">{ticket.client_id}</p>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm min-w-[140px]">
                                    <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Agent</p>
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center">
                                            <span className="text-xs font-medium">JD</span>
                                        </div>
                                        <p className="text-sm font-medium text-gray-900">John Doe</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Audio Player */}
                        <div className="bg-gray-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
                            {/* Waveform Background (abstract) */}
                            <div className="absolute inset-0 opacity-20 flex items-center gap-1 justify-center px-12 pointer-events-none">
                                {[...Array(60)].map((_, i) => (
                                    <div
                                        key={i}
                                        className="w-1.5 bg-purple-500 rounded-full transition-all duration-300"
                                        style={{ height: `${((i * 37 + 13) % 80) + 20}%` }}
                                    />
                                ))}
                            </div>

                            <div className="relative z-10 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={togglePlayback}
                                        className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center hover:bg-purple-500 transition-colors shadow-lg hover:shadow-purple-500/30"
                                    >
                                        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                                    </button>
                                    <div>
                                        <h3 className="font-semibold text-lg">Call Recording</h3>
                                        <p className="text-sm text-gray-400">
                                            {ticket.clientname} • Visit #{ticket.visitnumber}
                                        </p>
                                        {audioError && (
                                            <p className="text-xs text-red-300 mt-1">{audioError}</p>
                                        )}
                                        {!audioUrl && (
                                            <p className="text-xs text-amber-200 mt-1">Requesting signed playback URL from backend…</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 bg-black/30 px-4 py-2 rounded-lg backdrop-blur-sm">
                                    <span className="font-mono">{formatTime(currentTime)}</span>
                                    <span className="text-gray-500">/</span>
                                    <span className="font-mono text-gray-400">{formatTime(duration)}</span>
                                    <div className="w-px h-4 bg-gray-700 mx-2" />
                                    <button
                                        onClick={() => { void seekBy(-10); }}
                                        className="hover:text-purple-400 transition-colors"
                                        aria-label="Rewind 10 seconds"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => { void seekBy(10); }}
                                        className="hover:text-purple-400 transition-colors"
                                        aria-label="Forward 10 seconds"
                                    >
                                        <RotateCw className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <audio
                                ref={audioRef}
                                src={audioUrl || undefined}
                                className="hidden"
                                preload="metadata"
                                crossOrigin="anonymous"
                                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                                onLoadedMetadata={(e) => {
                                    const audioDuration = Number.isFinite(e.currentTarget.duration)
                                        ? e.currentTarget.duration
                                        : 0;
                                    setDuration(audioDuration);
                                    setAudioError(null);
                                }}
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                onEnded={() => {
                                    setIsPlaying(false);
                                    setCurrentTime(0);
                                }}
                                onError={() => {
                                    setAudioError('Failed to load recording URL.');
                                    setIsPlaying(false);
                                }}
                            />
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-5 gap-4">
                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-500 uppercase">Politeness</span>
                                    <Smile className="w-5 h-5 text-green-500" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold text-gray-900">{analysis?.scores?.politeness ?? analysis?.politeness_score ?? 0}%</span>
                                    <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">High</span>
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-500 uppercase">Confidence</span>
                                    <Zap className="w-5 h-5 text-blue-500" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold text-gray-900">{analysis?.scores?.confidence ?? analysis?.confidence_score ?? 0}%</span>
                                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Steady</span>
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-purple-600 to-indigo-700 text-white border-transparent">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-white/80 uppercase">Interest</span>
                                    <ThumbsUp className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold uppercase">{analysis?.scores?.interest ?? analysis?.customer_interest_level ?? 'N/A'}</span>
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-500 uppercase">Speakers</span>
                                    <Users className="w-5 h-5 text-gray-400" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold text-gray-900">{analysis?.scores?.speakers ?? analysis?.speakers_detected ?? 2}</span>
                                    <div className="flex -space-x-2">
                                        <div className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white" />
                                        <div className="w-6 h-6 rounded-full bg-purple-200 border-2 border-white" />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-500 uppercase">Rating</span>
                                    <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-3xl font-bold text-gray-900">{Math.round((analysis?.rating || 0) / 2)} <span className="text-lg text-gray-400 font-normal">/ 5</span></span>
                                    {renderStars(analysis?.rating || 0)}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                            {/* Executive Brief */}
                            <div className="col-span-2 space-y-6">
                                <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
                                    <div className="flex items-center gap-2 mb-6">
                                        <div className="p-2 bg-purple-100 rounded-lg">
                                            <Zap className="w-5 h-5 text-purple-600" />
                                        </div>
                                        <h2 className="text-xl font-bold text-gray-900">Executive Brief</h2>
                                    </div>

                                    <div className="prose prose-lg text-gray-600 max-w-none">
                                        <p>{analysis?.summary || 'No summary available.'}</p>
                                    </div>

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
                                <div className="grid grid-cols-2 gap-6">
                                    {/* Objections */}
                                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                        <div className="flex items-center gap-2 mb-4 text-red-600">
                                            <AlertTriangle className="w-5 h-5" />
                                            <h3 className="font-bold">Key Objections</h3>
                                        </div>
                                        <ul className="space-y-3">
                                            {analysis?.objections?.length ? (
                                                analysis.objections.map((obj, i) => (
                                                    <li key={i} className="flex gap-3 items-start p-3 bg-red-50 rounded-xl">
                                                        <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                                        <div className="flex flex-col">
                                                            <span className="text-sm text-gray-800 font-medium">
                                                                {typeof obj === 'string' ? obj : obj.objection}
                                                            </span>
                                                            {typeof obj !== 'string' && obj.response && (
                                                                <span className="text-xs text-gray-500 mt-1">Response: {obj.response}</span>
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
                                            <CheckCircle className="w-5 h-5" />
                                            <h3 className="font-bold">Next Steps</h3>
                                        </div>
                                        {hasAnyActionItems ? (
                                            <div className="space-y-4">
                                                {aiActionItems.length > 0 && (
                                                    <ul className="space-y-3">
                                                        {aiActionItems.map((item, i) => (
                                                            <li key={`ai-${i}`} className="flex gap-3 items-start p-3 bg-green-50 rounded-xl">
                                                                <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                                                <span className="text-sm text-gray-800 font-medium">{item}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}

                                                {trackedActionItems.length > 0 && (
                                                    <ul className="space-y-3">
                                                        {trackedActionItems.map((item) => (
                                                            <li key={item.id} className="flex gap-3 items-start p-3 bg-blue-50 rounded-xl border border-blue-100">
                                                                <CheckCircle className={`w-5 h-5 shrink-0 mt-0.5 ${item.completed ? 'text-green-500' : 'text-blue-500'}`} />
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

                            {/* Key Moments Sidebar */}
                            <div className="col-span-1">
                                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm sticky top-24">
                                    <div className="flex items-center gap-2 mb-6">
                                        <div className="p-2 bg-blue-100 rounded-lg">
                                            <Clock className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <h2 className="text-xl font-bold text-gray-900">Key Moments</h2>
                                    </div>

                                    <div
                                        ref={momentsContainerRef}
                                        className="space-y-6 relative max-h-[480px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
                                    >
                                        {/* Timeline Line - Extended to cover scrollable area */}
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
                                                        ref={el => { momentRefs.current[i] = el; }}
                                                        onClick={() => seekToMoment(momentTime)}
                                                        className={`relative pl-10 group cursor-pointer p-3 rounded-xl transition-all duration-300 border ${isActive
                                                            ? 'bg-purple-50 border-purple-200 shadow-sm scale-[1.02]'
                                                            : 'hover:bg-gray-50 border-transparent'
                                                            }`}
                                                    >
                                                        {/* Timeline Dot */}
                                                        <div className={`absolute left-[11px] top-7 w-2.5 h-2.5 rounded-full border-2 border-white ring-2 z-10 transition-colors ${isActive ? 'bg-purple-600 ring-purple-200 scale-125' :
                                                            moment.sentiment === 'positive' ? 'bg-green-500 ring-green-100' :
                                                                moment.sentiment === 'negative' ? 'bg-red-500 ring-red-100' :
                                                                    'bg-gray-400 ring-gray-100'
                                                            }`} />

                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded transition-colors ${isActive ? 'text-purple-700 bg-purple-100' : 'text-gray-500 bg-gray-100'
                                                                }`}>
                                                                {momentTime}
                                                            </span>
                                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${getSentimentColor(moment.sentiment)}`}>
                                                                {moment.sentiment}
                                                            </span>
                                                        </div>
                                                        <h4 className={`font-bold text-sm mb-1 transition-colors ${isActive ? 'text-purple-900' : 'text-gray-900 group-hover:text-purple-600'
                                                            }`}>
                                                            {momentLabel}
                                                        </h4>
                                                        <p className={`text-xs line-clamp-2 transition-colors ${isActive ? 'text-purple-700' : 'text-gray-500'
                                                            }`}>
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
                            </div>
                        </div>

                        {/* Comparison + Raw Analysis */}
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                            <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold text-gray-900">Current vs Previous Conversation</h3>
                                    <div className="flex items-center gap-4 text-xs font-medium">
                                        <div className="flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-sm bg-gray-300" />
                                            <span className="text-gray-500">Previous</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-sm bg-purple-500" />
                                            <span className="text-gray-700">Current</span>
                                        </div>
                                    </div>
                                </div>

                                {radarChart ? (
                                    <div className="overflow-x-auto">
                                        <svg
                                            viewBox={`0 0 ${radarChart.size} ${radarChart.size}`}
                                            className="w-full max-w-[560px] mx-auto"
                                        >
                                            {[...Array(radarChart.levels)].map((_, levelIdx) => {
                                                const levelRatio = (levelIdx + 1) / radarChart.levels;
                                                const points = radarChart.labels
                                                    .map((_, axisIdx) => {
                                                        const angle = -Math.PI / 2 + radarChart.angleStep * axisIdx;
                                                        const r = radarChart.radius * levelRatio;
                                                        const x = radarChart.center + Math.cos(angle) * r;
                                                        const y = radarChart.center + Math.sin(angle) * r;
                                                        return `${x},${y}`;
                                                    })
                                                    .join(' ');
                                                return (
                                                    <polygon
                                                        key={`grid-${levelIdx}`}
                                                        points={points}
                                                        fill="none"
                                                        stroke="#e5e7eb"
                                                        strokeWidth="1"
                                                    />
                                                );
                                            })}

                                            {radarChart.labels.map((label, axisIdx) => {
                                                const angle = -Math.PI / 2 + radarChart.angleStep * axisIdx;
                                                const x = radarChart.center + Math.cos(angle) * radarChart.radius;
                                                const y = radarChart.center + Math.sin(angle) * radarChart.radius;
                                                const labelX = radarChart.center + Math.cos(angle) * (radarChart.radius + 20);
                                                const labelY = radarChart.center + Math.sin(angle) * (radarChart.radius + 20);
                                                return (
                                                    <g key={`axis-${label}`}>
                                                        <line
                                                            x1={radarChart.center}
                                                            y1={radarChart.center}
                                                            x2={x}
                                                            y2={y}
                                                            stroke="#d1d5db"
                                                            strokeWidth="1"
                                                        />
                                                        <text
                                                            x={labelX}
                                                            y={labelY}
                                                            textAnchor="middle"
                                                            dominantBaseline="middle"
                                                            fontSize="11"
                                                            fill="#4b5563"
                                                            className="font-medium"
                                                        >
                                                            {label}
                                                        </text>
                                                    </g>
                                                );
                                            })}

                                            <polygon
                                                points={radarChart.previousPolygon}
                                                fill="rgba(156,163,175,0.2)"
                                                stroke="#9ca3af"
                                                strokeDasharray="4 3"
                                                strokeWidth="2"
                                            />
                                            <polygon
                                                points={radarChart.currentPolygon}
                                                fill="rgba(124,58,237,0.18)"
                                                stroke="#7c3aed"
                                                strokeWidth="2"
                                            />
                                        </svg>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 italic">No comparable previous analysis available.</p>
                                )}

                                {analysis?.comparisonwithprevious && (
                                    <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
                                        <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Delta Summary</p>
                                        <p className={`font-semibold ${typeof radarChart?.deltaScore === 'number' && radarChart.deltaScore >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                            Delta Score: {radarChart?.deltaScore ?? analysis.comparisonwithprevious.delta_score ?? 0}
                                        </p>
                                        {previousAnalysis?.rating && (
                                            <p className="text-xs text-gray-600 mt-1">
                                                Previous rating: {previousAnalysis.rating}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-6">
                                <div className="bg-[#2f224c] text-white p-6 rounded-3xl shadow-sm border border-[#3e2d64]">
                                    <h3 className="text-3xl font-extrabold leading-tight">
                                        Recommended
                                        <br />
                                        Actions
                                    </h3>
                                    <div className="my-5 h-px bg-[#5d4a85]" />

                                    <div className="space-y-4 max-h-[260px] overflow-auto pr-1">
                                        {recommendedActions.length > 0 ? (
                                            recommendedActions.map((action) => (
                                                <button
                                                    key={action.id}
                                                    onClick={() => toggleAction(action.id)}
                                                    className="w-full text-left flex items-start gap-3 group"
                                                >
                                                    <span className={`mt-0.5 w-7 h-7 rounded-xl border-2 transition-colors flex items-center justify-center ${action.completed
                                                        ? 'bg-[#6c42d9] border-[#6c42d9] text-white'
                                                        : 'border-[#6a6390] text-transparent group-hover:border-[#9f8be3]'
                                                        }`}>
                                                        ✓
                                                    </span>
                                                    <span className={`text-lg leading-8 transition-colors ${action.completed ? 'text-[#9d93be] line-through' : 'text-[#e6ddff]'
                                                        }`}>
                                                        {action.text}
                                                    </span>
                                                </button>
                                            ))
                                        ) : (
                                            <p className="text-sm text-[#b9aed6] italic">No action items detected.</p>
                                        )}
                                    </div>

                                    <div className="mt-6">
                                        {showCustomInput ? (
                                            <div className="space-y-3">
                                                <input
                                                    value={customActionInput}
                                                    onChange={(e) => setCustomActionInput(e.target.value)}
                                                    placeholder="Add custom action"
                                                    className="w-full rounded-xl bg-[#3b2b61] border border-[#5b4a86] px-4 py-2 text-sm text-white placeholder:text-[#a99bcf] focus:outline-none focus:ring-2 focus:ring-[#7f5ee0]"
                                                />
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={addCustomAction}
                                                        className="px-3 py-2 rounded-lg bg-[#6c42d9] text-white text-sm font-semibold hover:bg-[#7a50e8]"
                                                    >
                                                        Add
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setShowCustomInput(false);
                                                            setCustomActionInput('');
                                                        }}
                                                        className="px-3 py-2 rounded-lg border border-[#65568f] text-[#d6caf6] text-sm hover:bg-[#3b2b61]"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setShowCustomInput(true)}
                                                className="w-full rounded-2xl border border-[#65568f] text-[#d6caf6] py-3 px-4 text-sm font-semibold hover:bg-[#3b2b61] transition-colors"
                                            >
                                                + Add Custom Action
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                    <h3 className="text-lg font-bold text-gray-900 mb-4">Raw Analysis JSON</h3>
                                    <div className="max-h-[300px] overflow-auto rounded-lg border border-gray-200 bg-gray-950 p-4">
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
                                                        {formatExcuseReason(excuse.reason)} • {excuse.employee?.fullname || 'Unknown employee'}
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
                            <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-900 mb-4">Improvement Suggestions</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {analysis.improvementsuggestions.map((suggestion, i) => (
                                        <div key={i} className="p-4 bg-yellow-50 rounded-xl border border-yellow-100 flex gap-3">
                                            <Zap className="w-5 h-5 text-yellow-600 shrink-0" />
                                            <p className="text-sm text-gray-800">{suggestion}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div >

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
