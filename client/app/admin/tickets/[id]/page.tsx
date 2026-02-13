'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
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
    AlertCircle,
    RefreshCcw,
    TrendingUp,
    TrendingDown,
    Minus,
    Sparkles
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
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const momentsContainerRef = useRef<HTMLDivElement>(null);
    const momentRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [audioError, setAudioError] = useState<string | null>(null);
    const [hoveredChartPoint, setHoveredChartPoint] = useState<HoveredChartPoint | null>(null);

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
                    <header className="bg-white border-b border-gray-200 px-5 py-4 md:px-7 sticky top-0 z-10">
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

                    <div className="px-5 py-7 md:px-7 max-w-[90rem] mx-auto space-y-6">
                        {/* Title Section */}
                        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200 uppercase tracking-wide">
                                        {ticket.status}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                        {new Date(ticket.createdat).toLocaleString()}
                                    </span>
                                </div>
                                <h1 className="text-2xl md:text-[1.85rem] font-semibold text-gray-900 mb-2 leading-tight">
                                    Ticket #{ticket.id.slice(0, 4).toUpperCase()} - {ticket.clientname || 'Client Analysis'}
                                </h1>
                                <p className="text-gray-500 text-base">
                                    Customer Intelligence Report - {ticket.visittype.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-4">
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
                                            {ticket.clientname} - Visit #{ticket.visitnumber}
                                        </p>
                                        {audioError && (
                                            <p className="text-xs text-red-300 mt-1">{audioError}</p>
                                        )}
                                        {!audioUrl && (
                                            <p className="text-xs text-amber-200 mt-1">Requesting signed playback URL from backend...</p>
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                            <div
                                title={`Exact score: ${metricCards.politeness} / 100`}
                                className="group bg-white p-5 rounded-2xl border border-gray-200 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-500 uppercase">Politeness</span>
                                    <Smile className="w-5 h-5 text-green-500 transition-transform group-hover:scale-110" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-semibold text-gray-900">{metricCards.politeness}%</span>
                                    <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">High</span>
                                </div>
                                <p className="mt-2 text-[11px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">Exact score: {metricCards.politeness} / 100</p>
                            </div>

                            <div
                                title={`Exact score: ${metricCards.confidence} / 100`}
                                className="group bg-white p-5 rounded-2xl border border-gray-200 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-500 uppercase">Confidence</span>
                                    <Zap className="w-5 h-5 text-blue-500 transition-transform group-hover:scale-110" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-semibold text-gray-900">{metricCards.confidence}%</span>
                                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Steady</span>
                                </div>
                                <p className="mt-2 text-[11px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">Exact score: {metricCards.confidence} / 100</p>
                            </div>

                            <div
                                title={`Exact score: ${metricCards.interestScore} / 100`}
                                className="group bg-gradient-to-br from-purple-600 to-indigo-700 text-white p-5 rounded-2xl border border-transparent shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-white/80 uppercase">Interest</span>
                                    <ThumbsUp className="w-5 h-5 text-white transition-transform group-hover:scale-110" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-semibold uppercase">{metricCards.interestRaw}</span>
                                </div>
                                <p className="mt-2 text-[11px] text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">Mapped score: {metricCards.interestScore} / 100</p>
                            </div>

                            <div
                                title={`Exact score: ${Math.min(metricCards.speakers * 50, 100)} / 100`}
                                className="group bg-white p-5 rounded-2xl border border-gray-200 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
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
                                <p className="mt-2 text-[11px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">Conversation complexity: {Math.min(metricCards.speakers * 50, 100)} / 100</p>
                            </div>

                            <div
                                title={`Exact score: ${metricCards.ratingOutOf100} / 100`}
                                className="group bg-white p-5 rounded-2xl border border-gray-200 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-500 uppercase">Rating</span>
                                    <Star className="w-5 h-5 text-amber-400 fill-amber-400 transition-transform group-hover:scale-110" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-2xl font-semibold text-gray-900">{Math.round((analysis?.rating || 0) / 2)} <span className="text-base text-gray-400 font-normal">/ 5</span></span>
                                    {renderStars(analysis?.rating || 0)}
                                </div>
                                <p className="mt-2 text-[11px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">Exact score: {metricCards.ratingOutOf100} / 100</p>
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
                                        <div key={i} className="analysis-suggestion-item p-4 rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-sm">
                                            <div className="flex items-start gap-3">
                                                <div className="h-6 w-6 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold flex items-center justify-center">
                                                    {i + 1}
                                                </div>
                                                <p className="text-sm leading-7 text-gray-800">{suggestion}</p>
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


