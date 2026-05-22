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
            await audioContext.resume();
        }

        let lastOscillator: OscillatorNode | null = null;

        for (const step of steps) {
            lastOscillator = playTone(audioContext, step.frequency, step.startTime, step.duration);
        }

        await new Promise<void>((resolve) => {
            if (!lastOscillator) {
                resolve();
                return;
            }

            lastOscillator.onended = () => resolve();
        });
    } finally {
        if (audioContext.state !== 'closed') {
            await audioContext.close().catch(() => undefined);
        }
    }
}

export async function playNotificationAudioDirect(): Promise<void> {
    await playSequence([
        { frequency: 800, startTime: 0, duration: 0.15 },
        { frequency: 1000, startTime: 0.2, duration: 0.15 },
    ]);
}

export function createAudioService(offscreen: OffscreenManager): AudioService {
    // Firefox/background-local mode registers direct handlers here; Chrome/offscreen mode
    // reuses the same task contract and executes these routines inside the offscreen page.
    registerNotificationAudioTask(offscreen, playNotificationAudioDirect);

    return {
        playNotification() {
            return requestNotificationAudioTask(offscreen);
        },
    };
}
