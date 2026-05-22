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
});
