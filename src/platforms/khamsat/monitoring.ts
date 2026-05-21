import type { PlatformMonitoringAdapter } from '../contracts';
import type { PlatformMonitoringHtmlParser } from '../monitoring-html-parser';
import { isPlatformMonitoringEnabled } from '../../entities/settings/model';
import { KHAMSAT_FEEDS } from './feeds';

export function createKhamsatMonitoringAdapter(
    htmlParser: PlatformMonitoringHtmlParser
): PlatformMonitoringAdapter {
    return {
        id: 'khamsat',
        displayName: 'Khamsat',
        debugProbeUrl: KHAMSAT_FEEDS.requests,
        resolveFeeds(settings) {
            return isPlatformMonitoringEnabled(settings, 'khamsat') ? [KHAMSAT_FEEDS.requests] : [];
        },
        parseListingHtml(html) {
            return htmlParser.parseListingHtml('khamsat', html);
        },
        parseProjectHtml(html) {
            return htmlParser.parseProjectHtml('khamsat', html);
        },
    };
}
