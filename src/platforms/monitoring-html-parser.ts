import type { JobRecord } from '../models/jobs';
import type { OffscreenManager } from '../infrastructure/offscreen/manager';
import {
    registerMonitoringHtmlParserTasks,
    requestMonitoringListingHtmlParse,
    requestMonitoringProjectHtmlParse,
} from '../infrastructure/offscreen/tasks';
import { looksLikeChallengePage } from '../shared/network/challenge-page';
import type { PlatformId } from './contracts';
import { getPlatformMonitoringHtmlParser } from './platform-modules';

export interface PlatformMonitoringHtmlParser {
    parseListingHtml(platformId: PlatformId, html: string): Promise<readonly JobRecord[]>;
    parseProjectHtml(platformId: PlatformId, html: string): Promise<Partial<JobRecord> | null>;
}

export function createPlatformMonitoringHtmlParser(
    offscreen: OffscreenManager
): PlatformMonitoringHtmlParser {
    registerMonitoringHtmlParserTasks(offscreen, {
        parseListingHtml(platformId, html) {
            if (!html.trim() || looksLikeChallengePage(html)) {
                return [];
            }

            return getPlatformMonitoringHtmlParser(platformId).parseListingHtml(html);
        },
        parseProjectHtml(platformId, html) {
            if (!html.trim() || looksLikeChallengePage(html)) {
                return null;
            }

            return getPlatformMonitoringHtmlParser(platformId).parseProjectHtml(html);
        },
    });

    return {
        parseListingHtml(platformId, html) {
            return requestMonitoringListingHtmlParse(offscreen, platformId, html);
        },
        parseProjectHtml(platformId, html) {
            return requestMonitoringProjectHtmlParse(offscreen, platformId, html);
        },
    };
}
