import { describe, expect, it, vi } from 'vitest';

import type {
    OffscreenManager,
    OffscreenTask,
    OffscreenTaskPayloadMap,
} from '../../../src/features/offscreen/manager';
import {
    createPlatformMonitoringHtmlParser,
    pruneHtmlForParsing,
} from '../../../src/platforms/monitoring-html-parser';
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
                handlers.get('monitoring.parse-listing-html')?.({
                    platformId: 'khamsat',
                    html: '<div id="challenge-container"><script src="https://token.awswaf.com/challenge.js"></script></div>',
                })
            )
        ).resolves.toEqual([]);
        await expect(
            Promise.resolve(
                handlers.get('monitoring.parse-listing-html')?.({
                    platformId: 'nafezly',
                    html: '<div class="cf-turnstile">Please verify that you\'re not a robot</div>',
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

    it('prunes non-essential markup before serializing across offscreen IPC', async () => {
        const rawHtml = `
            <!doctype html>
            <html>
                <head>
                    <title>Test Page</title>
                    <style>.heavy { color: red; }</style>
                    <link rel="stylesheet" href="/app.css">
                    <script src="/tracking.js"></script>
                    <script>window.__PRELOADED_STATE__ = { large: "state" };</script>
                </head>
                <body>
                    <!-- A comment block -->
                    <svg viewBox="0 0 100 100"><path d="M10 10 H 90 V 90 H 10 L 10 10"/></svg>
                    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==">
                    <noscript><p>Please enable JS</p></noscript>
                    <main>
                        <div class="job-card">Clean Job Content</div>
                    </main>
                </body>
            </html>
        `;

        const pruned = pruneHtmlForParsing(rawHtml);
        expect(pruned).not.toContain('<script');
        expect(pruned).not.toContain('<style');
        expect(pruned).not.toContain('<svg');
        expect(pruned).not.toContain('<img');
        expect(pruned).not.toContain('<noscript');
        expect(pruned).not.toContain('A comment block');
        expect(pruned).toContain('<div class="job-card">Clean Job Content</div>');

        const request = vi.fn(async () => []);
        const offscreen = {
            bootstrap: vi.fn(async () => undefined),
            request: request as unknown as OffscreenManager['request'],
            registerLocalHandler: vi.fn(),
        } as unknown as OffscreenManager;
        const parser = createPlatformMonitoringHtmlParser(offscreen);

        await parser.parseListingHtml('mostaql', rawHtml);
        expect(request).toHaveBeenCalledWith('monitoring.parse-listing-html', {
            platformId: 'mostaql',
            html: pruned,
        });

        // Challenge and empty HTML should return immediately without making an IPC request
        const emptyResult = await parser.parseListingHtml('mostaql', '   ');
        expect(emptyResult).toEqual([]);
        expect(request).toHaveBeenCalledOnce();

        const challengeResult = await parser.parseProjectHtml(
            'khamsat',
            '<title>Just a moment...</title>'
        );
        expect(challengeResult).toBeNull();
        expect(request).toHaveBeenCalledOnce();
    });
});
