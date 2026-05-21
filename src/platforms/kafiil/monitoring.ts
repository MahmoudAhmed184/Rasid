import { isPlatformMonitoringEnabled } from '../../entities/settings/model';
import type { PlatformMonitoringAdapter } from '../contracts';
import type { PlatformMonitoringHtmlParser } from '../monitoring-html-parser';
import { KAFIIL_FEEDS } from './feeds';

export function createKafiilMonitoringAdapter(
    htmlParser: PlatformMonitoringHtmlParser
): PlatformMonitoringAdapter {
    return {
        id: 'kafiil',
        displayName: 'Kafiil',
        debugProbeUrl: KAFIIL_FEEDS.projects,
        resolveFeeds(settings) {
            return isPlatformMonitoringEnabled(settings, 'kafiil') ? [KAFIIL_FEEDS.projects] : [];
        },
        parseListingHtml(html) {
            return htmlParser.parseListingHtml('kafiil', html);
        },
        parseProjectHtml(html) {
            return htmlParser.parseProjectHtml('kafiil', html);
        },
    };
}
