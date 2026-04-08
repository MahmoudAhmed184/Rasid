import { browser } from 'wxt/browser';

import type { JobRecord } from '../../models/jobs';
import { getPlatformDisplayName } from '../../platforms/platform-ids';
import { resolveJobPlatformId } from '../../shared/jobs/job-identity';
import type { ExtensionStorage } from '../storage/extension-storage';

export interface NotificationService {
    registerHandlers(): void;
    showJobsNotification(jobs: JobRecord[]): Promise<string>;
    showTestNotification(): Promise<string>;
}

function buildNotificationBody(jobs: JobRecord[]): {
    title: string;
    message: string;
    primary: JobRecord;
} {
    const primary = jobs[0];
    const platformIds = [...new Set(jobs.map((job) => resolveJobPlatformId(job)))];
    const platformLabel =
        platformIds.length === 1 ? getPlatformDisplayName(platformIds[0]!) : 'المنصات المفعلة';
    const title =
        jobs.length === 1
            ? `فرصة جديدة على ${platformLabel}`
            : `${jobs.length} فرص جديدة من ${platformLabel}`;

    if (jobs.length === 1) {
        const budget = primary.budget ? `[ ${primary.budget} ]` : '';
        const description = primary.description
            ? `\n\n${primary.description.slice(0, 150)}${primary.description.length > 150 ? '...' : ''}`
            : '';

        return {
            title,
            message: `${primary.title} ${budget}${description}`.trim(),
            primary,
        };
    }

    return {
        title,
        message: `${primary.title}\nو ${jobs.length - 1} مشاريع أخرى`,
        primary,
    };
}

export function createNotificationService(storage: ExtensionStorage): NotificationService {
    let handlersRegistered = false;

    function registerHandlers(): void {
        if (handlersRegistered) {
            return;
        }

        handlersRegistered = true;

        browser.notifications.onClicked.addListener(async (notificationId) => {
            const payload = await storage.consumeNotificationPayload(notificationId);

            if (payload?.url) {
                await browser.tabs.create({ url: payload.url });
            }
        });
    }

    async function showJobsNotification(jobs: JobRecord[]): Promise<string> {
        const { title, message, primary } = buildNotificationBody(jobs);
        const notificationId = await browser.notifications.create({
            type: 'basic',
            iconUrl: browser.runtime.getURL('/icons/icon128.png'),
            title,
            message,
        });

        await storage.storeNotificationPayload(notificationId, {
            url: primary.url,
            jobId: primary.id,
        });

        return notificationId;
    }

    async function showTestNotification(): Promise<string> {
        return showJobsNotification([
            {
                id: `test-${Date.now()}`,
                platformId: 'mostaql',
                title: 'هذا إشعار تجريبي - مشروع تطوير موقع إلكتروني',
                budget: '500 $',
                url: 'https://mostaql.com/projects',
                description: 'هذا مثال للتأكد من أن مسار الإشعارات يعمل بعد إعادة هيكلة الخلفية.',
            },
        ]);
    }

    return {
        registerHandlers,
        showJobsNotification,
        showTestNotification,
    };
}
