import { describe, expect, it, vi } from 'vitest';

import type {
    OffscreenManager,
    OffscreenTask,
    OffscreenTaskPayloadMap,
} from '../../../src/features/offscreen/manager';
import { createPlatformMonitoringHtmlParser } from '../../../src/platforms/monitoring-html-parser';
import { readTextFixture } from '../../support/fixtures';

describe('platform monitoring HTML parser bridge', () => {
    it('registers local parser tasks that ignore empty and challenge HTML', async () => {
        const handlers = new Map<
            OffscreenTask,
            (payload: OffscreenTaskPayloadMap[OffscreenTask]) => Promise<unknown> | unknown
        >();
        const offscreen = {
            bootstrap: vi.fn(async () => undefined),
            request: vi.fn(),
            registerLocalHandler: vi.fn((task, handler) => {
                handlers.set(
                    task,
                    handler as (
                        payload: OffscreenTaskPayloadMap[OffscreenTask]
                    ) => Promise<unknown> | unknown
                );
            }),
        } satisfies OffscreenManager;

        createPlatformMonitoringHtmlParser(offscreen);

        await expect(
            Promise.resolve(
                handlers.get('monitoring.parse-listing-html')?.({
                    platformId: 'mostaql',
                    html: '<title>Just a moment</title>',
                })
            )
        ).resolves.toEqual([]);
        await expect(
            Promise.resolve(
                handlers.get('monitoring.parse-project-html')?.({
                    platformId: 'khamsat',
                    html: '   ',
                })
            )
        ).resolves.toBeNull();
    });

    it('parses supported listing and project fixtures through registered local handlers', async () => {
        const handlers = new Map<
            OffscreenTask,
            (payload: OffscreenTaskPayloadMap[OffscreenTask]) => Promise<unknown> | unknown
        >();
        const offscreen = {
            bootstrap: vi.fn(async () => undefined),
            request: vi.fn(),
            registerLocalHandler: vi.fn((task, handler) => {
                handlers.set(
                    task,
                    handler as (
                        payload: OffscreenTaskPayloadMap[OffscreenTask]
                    ) => Promise<unknown> | unknown
                );
            }),
        } satisfies OffscreenManager;

        createPlatformMonitoringHtmlParser(offscreen);

        await expect(
            Promise.resolve(
                handlers.get('monitoring.parse-listing-html')?.({
                    platformId: 'mostaql',
                    html: readTextFixture('mostaql', 'listing.html'),
                })
            )
        ).resolves.toEqual([
            expect.objectContaining({
                platformId: 'mostaql',
                title: 'تطوير لوحة متابعة عربية',
                url: 'https://mostaql.com/project/123-build-arabic-dashboard',
            }),
            expect.objectContaining({
                platformId: 'mostaql',
                title: 'تنظيف بيانات',
                url: 'https://mostaql.com/project/456-data-cleanup',
            }),
        ]);

        await expect(
            Promise.resolve(
                handlers.get('monitoring.parse-project-html')?.({
                    platformId: 'khamsat',
                    html: readTextFixture('khamsat', 'project.html'),
                })
            )
        ).resolves.toEqual(
            expect.objectContaining({
                platformId: 'khamsat',
                description: expect.stringContaining('أحتاج مطورا'),
                attachments: [
                    {
                        name: 'spec.pdf',
                        url: 'https://khamsat.com/uploads/spec.pdf',
                    },
                ],
            })
        );
    });

    it('routes public parse calls through the offscreen task contract', async () => {
        const request = vi.fn(async (task: OffscreenTask): Promise<unknown> => {
            if (task === 'monitoring.parse-listing-html') {
                return [
                    {
                        id: '1',
                        platformId: 'nafezly',
                        title: 'مشروع',
                        url: 'https://nafezly.com/projects/1',
                    },
                ];
            }

            return { description: 'تفاصيل' };
        });
        const offscreen = {
            bootstrap: vi.fn(async () => undefined),
            request: request as unknown as OffscreenManager['request'],
            registerLocalHandler: vi.fn(),
        } as unknown as OffscreenManager;
        const parser = createPlatformMonitoringHtmlParser(offscreen);

        await expect(parser.parseListingHtml('nafezly', '<main></main>')).resolves.toEqual([
            {
                id: '1',
                platformId: 'nafezly',
                title: 'مشروع',
                url: 'https://nafezly.com/projects/1',
            },
        ]);
        await expect(parser.parseProjectHtml('nafezly', '<article></article>')).resolves.toEqual({
            description: 'تفاصيل',
        });
        expect(request).toHaveBeenCalledWith('monitoring.parse-listing-html', {
            platformId: 'nafezly',
            html: '<main></main>',
        });
    });
});
