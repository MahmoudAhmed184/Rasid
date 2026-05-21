import { isPlatformMonitoringEnabled } from '../../entities/settings/model';
import type { PlatformMonitoringAdapter } from '../contracts';
import type { PlatformMonitoringHtmlParser } from '../monitoring-html-parser';
import { NAFEZLY_FEEDS } from './feeds';

export function createNafezlyMonitoringAdapter(
    htmlParser: PlatformMonitoringHtmlParser
): PlatformMonitoringAdapter {
    return {
        id: 'nafezly',
        displayName: 'Nafezly',
        debugProbeUrl: NAFEZLY_FEEDS.projects,
        resolveFeeds(settings) {
            return isPlatformMonitoringEnabled(settings, 'nafezly') ? [NAFEZLY_FEEDS.projects] : [];
        },
        parseListingHtml(html) {
            return htmlParser.parseListingHtml('nafezly', html);
        },
        parseProjectHtml(html) {
            return htmlParser.parseProjectHtml('nafezly', html);
        },
    };
}
