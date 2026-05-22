import { describe, expect, it, vi } from 'vitest';

import type { JobRecord } from '../../../../src/entities/job/model';
import { createKhamsatMonitoringAdapter } from '../../../../src/platforms/khamsat/monitoring';
import { createMostaqlMonitoringAdapter } from '../../../../src/platforms/mostaql/monitoring';
import { createNafezlyMonitoringAdapter } from '../../../../src/platforms/nafezly/monitoring';
import type { PlatformMonitoringHtmlParser } from '../../../../src/platforms/monitoring-html-parser';
import { DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';

function createParser(): PlatformMonitoringHtmlParser {
    const jobs: JobRecord[] = [
        {
            id: '1',
            platformId: 'mostaql',
            title: 'مشروع',
            url: 'https://mostaql.com/project/1',
        },
    ];

    return {
        parseListingHtml: vi.fn(async () => jobs),
        parseProjectHtml: vi.fn(async () => ({ description: 'تفاصيل' })),
    };
}

describe('platform monitoring adapters', () => {
    it('resolves Mostaql feeds from category settings and delegates parser calls with platform id', async () => {
        const parser = createParser();
        const adapter = createMostaqlMonitoringAdapter(parser);

        expect(adapter.resolveFeeds(DEFAULT_SETTINGS)).toEqual([
            'https://mostaql.com/projects?sort=latest',
        ]);
        expect(
            adapter.resolveFeeds({
                ...DEFAULT_SETTINGS,
                all: false,
                ai: false,
            })
        ).toEqual(['https://mostaql.com/projects?category=development&sort=latest']);
        expect(
            adapter.resolveFeeds({
                ...DEFAULT_SETTINGS,
                monitoredPlatforms: {
                    ...DEFAULT_SETTINGS.monitoredPlatforms,
                    mostaql: false,
                },
            })
        ).toEqual([]);

        await adapter.parseListingHtml('<main></main>');
        await adapter.parseProjectHtml('<article></article>');
        expect(parser.parseListingHtml).toHaveBeenCalledWith('mostaql', '<main></main>');
        expect(parser.parseProjectHtml).toHaveBeenCalledWith('mostaql', '<article></article>');
    });

    it('gates Khamsat and Nafezly feeds by monitored platform settings and delegates parser calls', async () => {
        const parser = createParser();
        const khamsat = createKhamsatMonitoringAdapter(parser);
        const nafezly = createNafezlyMonitoringAdapter(parser);

        expect(khamsat.resolveFeeds(DEFAULT_SETTINGS)).toEqual([
            'https://khamsat.com/community/requests',
        ]);
        expect(nafezly.resolveFeeds(DEFAULT_SETTINGS)).toEqual(['https://nafezly.com/projects']);
        expect(
            khamsat.resolveFeeds({
                ...DEFAULT_SETTINGS,
                monitoredPlatforms: {
                    ...DEFAULT_SETTINGS.monitoredPlatforms,
                    khamsat: false,
                },
            })
        ).toEqual([]);
        expect(
            nafezly.resolveFeeds({
                ...DEFAULT_SETTINGS,
                monitoredPlatforms: {
                    ...DEFAULT_SETTINGS.monitoredPlatforms,
                    nafezly: false,
                },
            })
        ).toEqual([]);

        await khamsat.parseListingHtml('<main>khamsat</main>');
        await khamsat.parseProjectHtml('<article>khamsat</article>');
        await nafezly.parseListingHtml('<main>nafezly</main>');
        await nafezly.parseProjectHtml('<article>nafezly</article>');

        expect(parser.parseListingHtml).toHaveBeenCalledWith('khamsat', '<main>khamsat</main>');
        expect(parser.parseProjectHtml).toHaveBeenCalledWith(
            'khamsat',
            '<article>khamsat</article>'
        );
        expect(parser.parseListingHtml).toHaveBeenCalledWith('nafezly', '<main>nafezly</main>');
        expect(parser.parseProjectHtml).toHaveBeenCalledWith(
            'nafezly',
            '<article>nafezly</article>'
        );
    });
});
