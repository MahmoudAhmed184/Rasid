import type { JobRecord } from '../../../entities/job/model';
import type { PlatformId } from '../../../platforms/contracts';
import type { OffscreenManager } from './manager';

export interface MonitoringHtmlTaskHandlers {
    parseListingHtml(
        platformId: PlatformId,
        html: string
    ): Promise<readonly JobRecord[]> | readonly JobRecord[];
    parseProjectHtml(
        platformId: PlatformId,
        html: string
    ): Promise<Partial<JobRecord> | null> | Partial<JobRecord> | null;
}

export function registerNotificationAudioTask(
    offscreen: OffscreenManager,
    playNotification: () => Promise<void> | void
): void {
    offscreen.registerLocalHandler('audio.play-notification', async () => {
        await playNotification();
    });
}

export function requestNotificationAudioTask(offscreen: OffscreenManager): Promise<void> {
    return offscreen.request('audio.play-notification', {});
}

export function registerMonitoringHtmlParserTasks(
    offscreen: OffscreenManager,
    handlers: MonitoringHtmlTaskHandlers
): void {
    offscreen.registerLocalHandler('monitoring.parse-listing-html', ({ platformId, html }) => {
        return handlers.parseListingHtml(platformId, html);
    });

    offscreen.registerLocalHandler('monitoring.parse-project-html', ({ platformId, html }) => {
        return handlers.parseProjectHtml(platformId, html);
    });
}

export function requestMonitoringListingHtmlParse(
    offscreen: OffscreenManager,
    platformId: PlatformId,
    html: string
): Promise<readonly JobRecord[]> {
    return offscreen.request('monitoring.parse-listing-html', {
        platformId,
        html,
    });
}

export function requestMonitoringProjectHtmlParse(
    offscreen: OffscreenManager,
    platformId: PlatformId,
    html: string
): Promise<Partial<JobRecord> | null> {
    return offscreen.request('monitoring.parse-project-html', {
        platformId,
        html,
    });
}
