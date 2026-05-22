import { describe, expect, it, vi } from 'vitest';

import type { OffscreenManager } from '../../../../src/features/offscreen/manager';
import {
    registerMonitoringHtmlParserTasks,
    registerNotificationAudioTask,
    requestMonitoringListingHtmlParse,
    requestMonitoringProjectHtmlParse,
    requestNotificationAudioTask,
} from '../../../../src/features/offscreen/tasks';

function createFakeOffscreen() {
    const handlers = new Map<string, (payload: unknown) => unknown>();
    const offscreen = {
        registerLocalHandler: vi.fn((task: string, handler: (payload: unknown) => unknown) => {
            handlers.set(task, handler);
        }),
        request: vi.fn(async (task: string, payload: unknown) => {
            const handler = handlers.get(task);
            if (!handler) {
                throw new Error(`missing ${task}`);
            }
            return handler(payload);
        }),
    };

    return { handlers, offscreen: offscreen as unknown as OffscreenManager };
}

describe('offscreen task helpers', () => {
    it('registers and requests notification audio through the shared task contract', async () => {
        const { offscreen } = createFakeOffscreen();
        const playNotification = vi.fn(async () => undefined);

        registerNotificationAudioTask(offscreen, playNotification);
        await requestNotificationAudioTask(offscreen);

        expect(playNotification).toHaveBeenCalledOnce();
    });

    it('registers and requests monitoring HTML parser tasks', async () => {
        const { offscreen } = createFakeOffscreen();
        registerMonitoringHtmlParserTasks(offscreen, {
            parseListingHtml(platformId, html) {
                expect(platformId).toBe('khamsat');
                expect(html).toContain('fixture');
                return [
                    {
                        id: '1',
                        platformId,
                        title: 'fixture',
                        url: 'https://khamsat.com/community/requests/1',
                    },
                ];
            },
            parseProjectHtml(platformId, html) {
                return {
                    platformId,
                    description: html,
                };
            },
        });

        await expect(
            requestMonitoringListingHtmlParse(offscreen, 'khamsat', '<main>fixture</main>')
        ).resolves.toHaveLength(1);
        await expect(
            requestMonitoringProjectHtmlParse(offscreen, 'nafezly', 'description')
        ).resolves.toEqual({
            platformId: 'nafezly',
            description: 'description',
        });
    });
});
