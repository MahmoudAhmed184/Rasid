import type { OffscreenManager } from '../offscreen/manager';
import { registerNotificationAudioTask, requestNotificationAudioTask } from '../offscreen/tasks';

export interface AudioService {
    playNotification(): Promise<void>;
}

function getAudioContextCtor(): (new () => AudioContext) | undefined {
    return globalThis.AudioContext;
}

function playTone(
    audioContext: AudioContext,
    frequency: number,
    startTime: number,
    duration: number
): OscillatorNode {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';

    const now = audioContext.currentTime;
    gainNode.gain.setValueAtTime(0.3, now + startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + startTime + duration);

    oscillator.start(now + startTime);
    oscillator.stop(now + startTime + duration);

    return oscillator;
}

async function playSequence(
    steps: Array<{ frequency: number; startTime: number; duration: number }>
) {
    const AudioContextCtor = getAudioContextCtor();

    if (!AudioContextCtor) {
        throw new Error('AudioContext is not available in this extension context.');
    }

    const audioContext = new AudioContextCtor();

    try {
        if (audioContext.state === 'suspended') {
            void audioContext.resume().catch(() => undefined);
        }

        let lastOscillator: OscillatorNode | null = null;

        for (const step of steps) {
            lastOscillator = playTone(audioContext, step.frequency, step.startTime, step.duration);
        }

        const maxDurationMs = Math.max(
            ...steps.map((step) => (step.startTime + step.duration) * 1000),
            350
        );

        await new Promise<void>((resolve) => {
            if (!lastOscillator) {
                resolve();
                return;
            }

            let settled = false;
            const finish = () => {
                if (!settled) {
                    settled = true;
                    resolve();
                }
            };

            lastOscillator.onended = finish;
            // Guarantee playback promise resolution even if audio hardware is suspended or muted
            setTimeout(finish, maxDurationMs + 100);
        });
    } finally {
        if (audioContext.state !== 'closed') {
            await audioContext.close().catch(() => undefined);
        }
    }
}

let activeDirectPlayback: Promise<void> | null = null;

export async function playNotificationAudioDirect(): Promise<void> {
    if (activeDirectPlayback) {
        await activeDirectPlayback;
        return;
    }

    activeDirectPlayback = (async () => {
        try {
            await playSequence([
                { frequency: 800, startTime: 0, duration: 0.15 },
                { frequency: 1000, startTime: 0.2, duration: 0.15 },
            ]);
        } finally {
            activeDirectPlayback = null;
        }
    })();

    await activeDirectPlayback;
}

export function createAudioService(offscreen: OffscreenManager): AudioService {
    // Firefox/background-local mode registers direct handlers here; Chrome/offscreen mode
    // reuses the same task contract and executes these routines inside the offscreen page.
    registerNotificationAudioTask(offscreen, playNotificationAudioDirect);

    let activeNotificationRequest: Promise<void> | null = null;

    return {
        async playNotification() {
            if (activeNotificationRequest) {
                await activeNotificationRequest;
                return;
            }

            activeNotificationRequest = (async () => {
                try {
                    await requestNotificationAudioTask(offscreen);
                } finally {
                    activeNotificationRequest = null;
                }
            })();

            await activeNotificationRequest;
        },
    };
}
