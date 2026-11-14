import { describe, expect, it, vi } from 'vitest';

import type { OffscreenManager } from '../../../../src/features/offscreen/manager';
import {
    createAudioService,
    playNotificationAudioDirect,
} from '../../../../src/features/notifications/audio-service';

describe('notification audio service', () => {
    it('registers the direct notification task and requests playback through offscreen RPC', async () => {
        const registerLocalHandler = vi.fn();
        const request = vi.fn(async () => ({ success: true as const }));
        const offscreen = {
            registerLocalHandler:
                registerLocalHandler as unknown as OffscreenManager['registerLocalHandler'],
            request: request as unknown as OffscreenManager['request'],
            bootstrap: vi.fn(async () => undefined),
        } satisfies OffscreenManager;

        const service = createAudioService(offscreen);

        expect(registerLocalHandler).toHaveBeenCalledWith(
            'audio.play-notification',
            expect.any(Function)
        );
        await service.playNotification();
        expect(request).toHaveBeenCalledWith('audio.play-notification', {});
    });

    it('fails clearly when direct playback runs without AudioContext support', async () => {
        vi.stubGlobal('AudioContext', undefined);

        await expect(playNotificationAudioDirect()).rejects.toThrow(
            'AudioContext is not available'
        );
    });

    it('plays and closes the direct notification tone sequence with a browser AudioContext', async () => {
        vi.useFakeTimers();
        const createdFrequencies: number[] = [];
        const resume = vi.fn(async () => undefined);
        const close = vi.fn(async () => undefined);

        class FakeAudioContext {
            currentTime = 10;
            destination = {};
            state: AudioContextState = 'suspended';
            resume = resume;
            close = close;

            createOscillator() {
                const oscillator = {
                    frequency: { value: 0 },
                    type: 'sine',
                    onended: null as (() => void) | null,
                    connect: vi.fn(),
                    start: vi.fn(),
                    stop: vi.fn(() => {
                        createdFrequencies.push(oscillator.frequency.value);
                        setTimeout(() => oscillator.onended?.(), 0);
                    }),
                };

                return oscillator as unknown as OscillatorNode;
            }

            createGain() {
                return {
                    connect: vi.fn(),
                    gain: {
                        setValueAtTime: vi.fn(),
                        exponentialRampToValueAtTime: vi.fn(),
                    },
                } as unknown as GainNode;
            }
        }

        vi.stubGlobal('AudioContext', FakeAudioContext);

        const playback = playNotificationAudioDirect();
        await vi.runAllTimersAsync();
        await playback;

        expect(resume).toHaveBeenCalledOnce();
        expect(close).toHaveBeenCalledOnce();
        expect(createdFrequencies).toEqual([800, 1000]);
    });

    it('deduplicates concurrent playNotification requests to prevent overlapping audio glitches', async () => {
        let resolveFirstRequest: () => void;
        let callCount = 0;
        const request = vi.fn(() => {
            callCount++;
            if (callCount === 1) {
                return new Promise<{ success: true }>((resolve) => {
                    resolveFirstRequest = () => resolve({ success: true });
                });
            }
            return Promise.resolve({ success: true as const });
        });
        const offscreen = {
            registerLocalHandler: vi.fn(),
            request: request as unknown as OffscreenManager['request'],
            bootstrap: vi.fn(async () => undefined),
        } satisfies OffscreenManager;

        const service = createAudioService(offscreen);

        const call1 = service.playNotification();
        const call2 = service.playNotification();

        expect(request).toHaveBeenCalledOnce();

        resolveFirstRequest!();
        await Promise.all([call1, call2]);

        // After completing, subsequent requests trigger a new playback
        await service.playNotification();
        expect(request).toHaveBeenCalledTimes(2);
    });

    it('deduplicates concurrent playNotificationAudioDirect calls without overlapping AudioContext instances', async () => {
        vi.useFakeTimers();
        let contextCount = 0;
        const close = vi.fn(async () => undefined);

        class CountingAudioContext {
            currentTime = 0;
            destination = {};
            state: AudioContextState = 'running';
            resume = vi.fn(async () => undefined);
            close = close;

            constructor() {
                contextCount++;
            }

            createOscillator() {
                const osc = {
                    frequency: { value: 0 },
                    type: 'sine',
                    onended: null as (() => void) | null,
                    connect: vi.fn(),
                    start: vi.fn(),
                    stop: vi.fn(() => {
                        setTimeout(() => osc.onended?.(), 0);
                    }),
                };
                return osc as unknown as OscillatorNode;
            }

            createGain() {
                return {
                    connect: vi.fn(),
                    gain: {
                        setValueAtTime: vi.fn(),
                        exponentialRampToValueAtTime: vi.fn(),
                    },
                } as unknown as GainNode;
            }
        }

        vi.stubGlobal('AudioContext', CountingAudioContext);

        const call1 = playNotificationAudioDirect();
        const call2 = playNotificationAudioDirect();

        await vi.runAllTimersAsync();
        await Promise.all([call1, call2]);

        // Exactly one AudioContext was created for the concurrent calls
        expect(contextCount).toBe(1);
        expect(close).toHaveBeenCalledOnce();
    });

    it('does not block oscillator scheduling when AudioContext resume is suspended or slow', async () => {
        vi.useFakeTimers();
        let resumeStarted = false;
        let resolveResume: () => void;
        const resume = vi.fn(() => {
            resumeStarted = true;
            return new Promise<void>((r) => {
                resolveResume = r;
            });
        });
        let oscillatorStarted = false;
        const close = vi.fn(async () => undefined);

        class StalledResumeAudioContext {
            currentTime = 0;
            destination = {};
            state: AudioContextState = 'suspended';
            resume = resume;
            close = close;

            createOscillator() {
                const osc = {
                    frequency: { value: 0 },
                    type: 'sine',
                    onended: null as (() => void) | null,
                    connect: vi.fn(),
                    start: vi.fn(() => {
                        oscillatorStarted = true;
                    }),
                    stop: vi.fn(() => {
                        setTimeout(() => osc.onended?.(), 0);
                    }),
                };
                return osc as unknown as OscillatorNode;
            }

            createGain() {
                return {
                    connect: vi.fn(),
                    gain: {
                        setValueAtTime: vi.fn(),
                        exponentialRampToValueAtTime: vi.fn(),
                    },
                } as unknown as GainNode;
            }
        }

        vi.stubGlobal('AudioContext', StalledResumeAudioContext);

        const playback = playNotificationAudioDirect();

        expect(resumeStarted).toBe(true);
        expect(oscillatorStarted).toBe(true);

        resolveResume!();
        await vi.runAllTimersAsync();
        await playback;

        expect(close).toHaveBeenCalledOnce();
    });

    it('resolves playback and closes AudioContext even if onended never fires due to audio hardware suspension', async () => {
        vi.useFakeTimers();
        const close = vi.fn(async () => undefined);

        class NonEndingAudioContext {
            currentTime = 0;
            destination = {};
            state: AudioContextState = 'suspended';
            resume = vi.fn(async () => undefined);
            close = close;

            createOscillator() {
                const osc = {
                    frequency: { value: 0 },
                    type: 'sine',
                    onended: null as (() => void) | null,
                    connect: vi.fn(),
                    start: vi.fn(),
                    // Never triggers onended (simulates suspended audio hardware)
                    stop: vi.fn(),
                };
                return osc as unknown as OscillatorNode;
            }

            createGain() {
                return {
                    connect: vi.fn(),
                    gain: {
                        setValueAtTime: vi.fn(),
                        exponentialRampToValueAtTime: vi.fn(),
                    },
                } as unknown as GainNode;
            }
        }

        vi.stubGlobal('AudioContext', NonEndingAudioContext);

        const playback = playNotificationAudioDirect();

        // Advance timers past the sequence maxDurationMs + safety timeout
        await vi.advanceTimersByTimeAsync(600);
        await playback;

        expect(close).toHaveBeenCalledOnce();
    });
});
