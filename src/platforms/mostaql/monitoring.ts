import { MOSTAQL_FEEDS } from './feeds';
import type { PlatformMonitoringAdapter } from '../contracts';
import type { PlatformMonitoringHtmlParser } from '../monitoring-html-parser';
import { isPlatformMonitoringEnabled } from '../../entities/settings/model';

export function createMostaqlMonitoringAdapter(
    htmlParser: PlatformMonitoringHtmlParser
): PlatformMonitoringAdapter {
    return {
        id: 'mostaql',
        displayName: 'Mostaql',
        debugProbeUrl: MOSTAQL_FEEDS.all,
        resolveFeeds(settings) {
            if (!isPlatformMonitoringEnabled(settings, 'mostaql')) {
                return [];
            }

            if (settings.all !== false) {
                return [MOSTAQL_FEEDS.all];
            }

            return Object.entries(MOSTAQL_FEEDS)
                .filter(([category]) => settings[category as keyof typeof MOSTAQL_FEEDS] !== false)
                .map(([, url]) => url);
        },
        parseListingHtml(html) {
            return htmlParser.parseListingHtml('mostaql', html);
        },
        parseProjectHtml(html) {
            return htmlParser.parseProjectHtml('mostaql', html);
        },
    };
}
