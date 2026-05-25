'use client';

import { RefObject } from 'react';
import { Gauge, Pause, Play, RotateCcw } from 'lucide-react';

export interface TicketAudioHeroProps {
    isPlaying: boolean;
    togglePlayback: () => void | Promise<void>;
    restartPlayback: () => void | Promise<void>;
    seekBy: (seconds: number) => void | Promise<void>;
    formatTime: (seconds: number) => string;
    displayedCurrentTime: number;
    duration: number;
    progressPercent: number;
    bufferedPercent: number;
    waveformHeights: number[];
    waveformBarCount: number;
    waveformShellRef: RefObject<HTMLDivElement | null>;
    handleSeekInput: (value: number) => void;
    commitScrub: () => void;
    setIsScrubbing: (value: boolean) => void;
    toggleMute: () => void;
    isMuted: boolean;
    VolumeIcon: React.ComponentType<{ className?: string }>;
    volumePercent: number;
    effectiveVolume: number;
    applyVolume: (value: number) => void;
    cyclePlaybackSpeed: () => void;
    formatSpeed: (speed: number) => string;
    playbackSpeed: number;
    audioError: string | null;
    audioUrl: string | null;
    audioRef: RefObject<HTMLAudioElement | null>;
    updateBufferedProgress: () => void;
    setCurrentTime: (value: number) => void;
    setDuration: (value: number) => void;
    setIsPlaying: (value: boolean) => void;
    setScrubTime: (value: number | null) => void;
    setAudioError: (value: string | null) => void;
    playbackSpeedValue: number;
    volume: number;
    clamp: (value: number, min: number, max: number) => number;
    timelineMarkers?: Array<{ time: string; label: string; sentiment?: string; category?: string; positionPct?: number; confidence?: number }>;
    onMarkerClick?: (time: string) => void;
}

function categoryClass(category?: string, sentiment?: string): string {
    const cat = String(category || '').toLowerCase();
    const sent = String(sentiment || '').toLowerCase();
    if (cat === 'objection') return 'objection';
    if (cat === 'commitment') return 'commitment';
    if (cat === 'qualification') return 'qualification';
    if (cat === 'positive' || sent === 'positive') return 'positive';
    if (cat === 'negative' || sent === 'negative') return 'negative';
    return 'neutral';
}

export function TicketAudioHero(props: TicketAudioHeroProps) {
    const {
        isPlaying,
        togglePlayback,
        restartPlayback,
        seekBy,
        formatTime,
        displayedCurrentTime,
        duration,
        progressPercent,
        bufferedPercent,
        waveformHeights,
        waveformBarCount,
        waveformShellRef,
        handleSeekInput,
        commitScrub,
        setIsScrubbing,
        toggleMute,
        isMuted,
        VolumeIcon,
        volumePercent,
        effectiveVolume,
        applyVolume,
        cyclePlaybackSpeed,
        formatSpeed,
        playbackSpeed,
        audioError,
        audioUrl,
        audioRef,
        updateBufferedProgress,
        setCurrentTime,
        setDuration,
        setIsPlaying,
        setScrubTime,
        setAudioError,
        playbackSpeedValue,
        volume,
        clamp,
        timelineMarkers = [],
        onMarkerClick,
    } = props;

    return (
        <section className="ci-audio-hero">
            <div className="ci-audio-hero__glow" aria-hidden />
            <div className="ci-audio-hero__inner">
                <div className="ci-audio-hero__head">
                    <div>
                        <p className="ci-audio-hero__eyebrow">Conversation recording</p>
                        <h2 className="ci-audio-hero__title">Listen & review with AI context</h2>
                    </div>
                    <span className="ci-audio-hero__duration">
                        {formatTime(displayedCurrentTime)} / {formatTime(duration)}
                    </span>
                </div>

                <div className="ci-audio-hero__toolbar">
                    <div className="ci-audio-hero__controls ci-audio-hero__controls--start">
                        <button
                            type="button"
                            onClick={() => { void togglePlayback(); }}
                            className={`ci-audio-hero__play ${isPlaying ? 'is-playing' : ''}`}
                            aria-label={isPlaying ? 'Pause' : 'Play'}
                        >
                            {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
                        </button>
                        <button type="button" onClick={() => { void restartPlayback(); }} className="ci-audio-hero__btn" aria-label="Restart">
                            <RotateCcw className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => { void seekBy(-10); }} className="ci-audio-hero__btn ci-audio-hero__btn--text">-10s</button>
                    </div>

                    <div className="ci-audio-hero__timeline">
                        <div ref={waveformShellRef} className="ticket-audio-waveform-shell ci-audio-hero__waveform">
                            {waveformHeights.map((h, i) => {
                                const barEndPct = ((i + 1) / waveformBarCount) * 100;
                                const isPlayed = progressPercent > 0 && barEndPct <= progressPercent;
                                const isBuffered = !isPlayed && bufferedPercent > 0 && barEndPct <= bufferedPercent;
                                const classes = ['ticket-audio-waveform-bar'];
                                if (isPlayed) classes.push('wf-played');
                                if (isPlayed && isPlaying) classes.push('wf-live');
                                if (isBuffered) classes.push('wf-buffered');
                                return (
                                    <div
                                        key={i}
                                        className={classes.join(' ')}
                                        style={{ height: `${Math.max(10, Math.round(h * 100))}%` }}
                                    />
                                );
                            })}
                            <div
                                className={`ticket-audio-waveform-cursor${isPlaying ? ' wf-playing' : ''}`}
                                style={{ left: `${Math.max(0, Math.min(100, progressPercent))}%` }}
                            />
                            {timelineMarkers.map((m, idx) => {
                                const pct = typeof m.positionPct === 'number'
                                    ? m.positionPct
                                    : null;
                                if (pct === null || pct < 0 || pct > 100) return null;
                                const cls = categoryClass(m.category, m.sentiment);
                                return (
                                    <button
                                        key={`wave-marker-${idx}-${m.time}`}
                                        type="button"
                                        className={`ci-wave-marker ci-wave-marker--${cls}`}
                                        style={{ left: `${pct}%` }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onMarkerClick?.(m.time);
                                        }}
                                        aria-label={`Jump to ${m.label} at ${m.time}`}
                                    >
                                        <span className="ci-wave-marker__tip">
                                            {m.time} · {m.label}
                                            {typeof m.confidence === 'number' ? ` · ${m.confidence}%` : ''}
                                        </span>
                                    </button>
                                );
                            })}
                            <input
                                type="range"
                                min={0}
                                max={Math.max(duration, 0.1)}
                                step={0.01}
                                value={displayedCurrentTime}
                                onMouseDown={() => setIsScrubbing(true)}
                                onTouchStart={() => setIsScrubbing(true)}
                                onChange={(e) => handleSeekInput(Number(e.currentTarget.value))}
                                onMouseUp={commitScrub}
                                onTouchEnd={commitScrub}
                                onKeyUp={commitScrub}
                                onBlur={commitScrub}
                                className="ticket-audio-waveform-input"
                                aria-label="Seek"
                            />
                        </div>
                    </div>

                    <div className="ci-audio-hero__controls ci-audio-hero__controls--end">
                        <button type="button" onClick={() => { void seekBy(10); }} className="ci-audio-hero__btn ci-audio-hero__btn--text">+10s</button>
                        <button type="button" onClick={toggleMute} className="ci-audio-hero__btn" aria-label={isMuted ? 'Unmute' : 'Mute'}>
                            <VolumeIcon className="h-4 w-4" />
                        </button>
                        <div className="ticket-audio-volume-shell ci-audio-hero__volume">
                            <div className="ticket-audio-volume-track ticket-audio-volume-track-base" />
                            <div className="ticket-audio-volume-track ticket-audio-volume-track-fill" style={{ width: `${volumePercent}%` }} />
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={effectiveVolume}
                                onChange={(e) => applyVolume(Number(e.currentTarget.value))}
                                className="ticket-audio-volume-input"
                                aria-label="Volume"
                            />
                        </div>
                        <button type="button" onClick={cyclePlaybackSpeed} className="ci-audio-hero__btn ci-audio-hero__btn--text">
                            <Gauge className="h-4 w-4" />
                            {formatSpeed(playbackSpeed)}
                        </button>
                    </div>
                </div>

                {timelineMarkers.length > 0 && (
                    <div className="ci-audio-hero__markers">
                        {timelineMarkers.slice(0, 6).map((m, i) => {
                            const cls = categoryClass(m.category, m.sentiment);
                            return (
                                <button
                                    key={`${m.time}-${i}`}
                                    type="button"
                                    onClick={() => onMarkerClick?.(m.time)}
                                    className={`ci-audio-hero__marker ci-audio-hero__marker--${cls}`}
                                >
                                    <span className="ci-audio-hero__marker-time">{m.time}</span>
                                    <span className="ci-audio-hero__marker-label">{m.label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {audioError && <p className="ci-audio-hero__error">{audioError}</p>}
                {!audioUrl && <p className="ci-audio-hero__hint">Loading signed playback URL…</p>}
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
                    const audioDuration = Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0;
                    setDuration(audioDuration);
                    e.currentTarget.playbackRate = playbackSpeedValue;
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
                    setAudioError('Failed to load recording.');
                    setIsPlaying(false);
                }}
            />
        </section>
    );
}
