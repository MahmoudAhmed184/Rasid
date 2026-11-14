import type { JobRecord } from '../entities/job/model';
import type { OffscreenManager } from '../features/offscreen/manager';
import {
    registerMonitoringHtmlParserTasks,
    requestMonitoringListingHtmlParse,
    requestMonitoringProjectHtmlParse,
} from '../features/offscreen/tasks';
import { looksLikeChallengePage } from '../shared/network/challenge-page';
import type { PlatformId } from './contracts';
import { getPlatformMonitoringHtmlParser } from './registry';

export interface PlatformMonitoringHtmlParser {
    parseListingHtml(platformId: PlatformId, html: string): Promise<readonly JobRecord[]>;
    parseProjectHtml(platformId: PlatformId, html: string): Promise<Partial<JobRecord> | null>;
}

const SCRIPT_BLOCK_PATTERN = /<script\b[\s\S]*?<\/script\s*>/gi;
const UNCLOSED_SCRIPT_PATTERN = /<script\b[^>]*\/?>/gi;
const STYLE_BLOCK_PATTERN = /<style\b[\s\S]*?<\/style\s*>/gi;
const SVG_BLOCK_PATTERN = /<svg\b[\s\S]*?<\/svg\s*>/gi;
const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const NOSCRIPT_BLOCK_PATTERN = /<noscript\b[\s\S]*?<\/noscript\s*>/gi;
const IFRAME_BLOCK_PATTERN = /<iframe\b[\s\S]*?<\/iframe\s*>/gi;
const MEDIA_BLOCK_PATTERN = /<(?:video|audio|canvas)\b[\s\S]*?<\/(?:video|audio|canvas)\s*>/gi;
const LINK_TAG_PATTERN = /<link\b[^>]*\/?>/gi;
const IMG_TAG_PATTERN = /<img\b[^>]*\/?>/gi;

/**
 * Strips non-essential markup (scripts, styles, svg, media, images, comments)
 * prior to IPC transfer or DOMParser work. This significantly cuts serialization
 * overhead and offscreen memory consumption in Chrome MV3.
 */
export function pruneHtmlForParsing(html: string): string {
    if (!html || typeof html !== 'string') {
        return '';
    }

    return html
        .replace(COMMENT_PATTERN, '')
        .replace(SCRIPT_BLOCK_PATTERN, '')
        .replace(UNCLOSED_SCRIPT_PATTERN, '')
        .replace(STYLE_BLOCK_PATTERN, '')
        .replace(SVG_BLOCK_PATTERN, '')
        .replace(NOSCRIPT_BLOCK_PATTERN, '')
        .replace(IFRAME_BLOCK_PATTERN, '')
        .replace(MEDIA_BLOCK_PATTERN, '')
        .replace(LINK_TAG_PATTERN, '')
        .replace(IMG_TAG_PATTERN, '')
        .trim();
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
            if (!html.trim() || looksLikeChallengePage(html)) {
                return Promise.resolve([]);
            }

            return requestMonitoringListingHtmlParse(
                offscreen,
                platformId,
                pruneHtmlForParsing(html)
            );
        },
        parseProjectHtml(platformId, html) {
            if (!html.trim() || looksLikeChallengePage(html)) {
                return Promise.resolve(null);
            }

            return requestMonitoringProjectHtmlParse(
                offscreen,
                platformId,
                pruneHtmlForParsing(html)
            );
        },
    };
}
