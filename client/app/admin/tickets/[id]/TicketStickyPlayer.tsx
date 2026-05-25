'use client';

import { Pause, Play } from 'lucide-react';

export interface TicketStickyPlayerProps {
    visible: boolean;
    isPlaying: boolean;
    progressPercent: number;
    displayedCurrentTime: number;
    duration: number;
    formatTime: (seconds: number) => string;
    togglePlayback: () => void | Promise<void>;
    label?: string;
}

export function TicketStickyPlayer({
    visible,
    isPlaying,
    progressPercent,
    displayedCurrentTime,
    duration,
    formatTime,
    togglePlayback,
    label = 'Now playing',
}: TicketStickyPlayerProps) {
    return (
        <div
            className={`ci-mini-player ${visible ? 'is-visible' : ''}`}
            role="region"
            aria-label="Sticky audio controls"
            aria-hidden={!visible}
        >
            <button
                type="button"
                className="ci-mini-player__play"
                onClick={() => { void togglePlayback(); }}
                aria-label={isPlaying ? 'Pause' : 'Play'}
            >
                {isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
            </button>
            <span className="ci-mini-player__label">{label}</span>
            <div className="ci-mini-player__progress" aria-hidden>
                <div
                    className="ci-mini-player__progress-fill"
                    style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
                />
            </div>
            <span className="ci-mini-player__time">
                {formatTime(displayedCurrentTime)} / {formatTime(duration)}
            </span>
        </div>
    );
}
