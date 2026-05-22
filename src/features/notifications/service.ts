import { browser } from 'wxt/browser';

import type { JobRecord } from '../../entities/job/model';
import { getPlatformDisplayName } from '../../platforms/platform-ids';
import { resolveJobPlatformId } from '../../entities/job/identity';
import type { ExtensionStorage } from '../../shared/storage/extension-storage';

const NOTIFICATION_ALLOWED_HOSTS = ['mostaql.com', 'khamsat.com', 'nafezly.com'] as const;

export interface NotificationService {
    registerHandlers(): void;
    showJobsNotification(jobs: JobRecord[]): Promise<string>;
    showTestNotification(): Promise<string>;
}

function normalizeNotificationUrl(value: string): string | null {
    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase();
        const isAllowedHost = NOTIFICATION_ALLOWED_HOSTS.some(
            (allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
        );

        if (url.protocol !== 'https:' || !isAllowedHost) {
            return null;
        }

        url.username = '';
        url.password = '';
        url.hash = '';
        return url.href;
    } catch {
        return null;
    }
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
            const url = payload?.url ? normalizeNotificationUrl(payload.url) : null;

            if (url) {
                await browser.tabs.create({ url });
            }
        });

        browser.notifications.onClosed.addListener((notificationId) => {
            void storage.removeNotificationPayload(notificationId).catch((error) => {
                console.warn('[notifications] failed to remove closed payload', error);
            });
        });

        void storage.pruneNotificationPayloads().catch((error) => {
            console.warn('[notifications] failed to prune stale payloads', error);
        });
    }

    async function showJobsNotification(jobs: JobRecord[]): Promise<string> {
        const { title, message, primary } = buildNotificationBody(jobs);
        const notificationId = `rasid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const payloadUrl = normalizeNotificationUrl(primary.url);

        if (payloadUrl) {
            await storage.storeNotificationPayload(notificationId, {
                url: payloadUrl,
                jobId: primary.id,
                createdAt: new Date().toISOString(),
            });
        }

        try {
            await browser.notifications.create(notificationId, {
                type: 'basic',
                iconUrl: browser.runtime.getURL('/icons/icon128.png'),
                title,
                message,
            });
        } catch (error) {
            if (payloadUrl) {
                await storage.removeNotificationPayload(notificationId);
            }
            throw error;
        }

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
