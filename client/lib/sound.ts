'use client';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;

    if (!audioContext) {
        audioContext = new Context();
    }
    return audioContext;
}

export async function playNotificationTone() {
    const context = getAudioContext();
    if (!context) return;

    if (context.state === 'suspended') {
        await context.resume().catch(() => undefined);
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(1046.5, now + 0.12);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.24);
}
