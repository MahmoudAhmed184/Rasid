import { browser } from 'wxt/browser';

import type { JobRecord } from '../../entities/job/model';
import { getPlatformDisplayName } from '../../platforms/platform-ids';
import { resolveJobPlatformId } from '../../entities/job/identity';
import type { AdminMessage } from '../../shared/storage/modules/admin-message-storage';
import type { ExtensionStorage } from '../../shared/storage/extension-storage';

const NOTIFICATION_ALLOWED_HOSTS = ['mostaql.com', 'khamsat.com', 'nafezly.com'] as const;
const JOB_NOTIFICATION_BUTTON_TITLE = '🔗 عرض تفاصيل المشروع';

export interface NotificationService {
    registerHandlers(): void;
    showJobsNotification(jobs: JobRecord[]): Promise<string[]>;
    showAdminMessageNotification(msg: AdminMessage): Promise<string>;
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

function getNotificationIcon(platformId: string | undefined): string {
    switch (platformId) {
        case 'mostaql':
            return browser.runtime.getURL('/platforms/Mostql.png');
        case 'khamsat':
            return browser.runtime.getURL('/platforms/Khamsat.png');
        case 'nafezly':
            return browser.runtime.getURL('/platforms/Nafezly.png');
        default:
            return browser.runtime.getURL('/icons/icon128.png');
    }
}

function buildNotificationOptions(options: {
    readonly iconUrl: string;
    readonly title: string;
    readonly message: string;
    readonly contextMessage?: string;
    readonly buttons?: Browser.notifications.NotificationButton[];
}): Browser.notifications.NotificationCreateOptions {
    const basicOptions: Browser.notifications.NotificationCreateOptions = {
        type: 'basic',
        iconUrl: options.iconUrl,
        title: options.title,
        message: options.message,
    };

    if (import.meta.env.BROWSER === 'firefox') {
        return basicOptions;
    }

    return {
        ...basicOptions,
        ...(options.contextMessage ? { contextMessage: options.contextMessage } : {}),
        ...(options.buttons && options.buttons.length > 0 ? { buttons: options.buttons } : {}),
    };
}

function buildJobNotificationBody(job: JobRecord): {
    title: string;
    message: string;
    contextMessage: string;
    platformId: string | undefined;
} {
    const platformId = resolveJobPlatformId(job) ?? job.platformId;
    const platformLabel = platformId ? getPlatformDisplayName(platformId) : 'منصات العمل الحر';
    const contextMessage = `Rasid - ${platformLabel}`;

    const title = `مشروع جديد: ${job.title}`;
    const budgetStr = job.budget ? `الميزانية: ${job.budget}` : '';
    const descriptionStr = job.description ? `${job.description.slice(0, 100).trim()}...` : '';

    const message = [budgetStr, descriptionStr].filter(Boolean).join('\n');

    return {
        title,
        message,
        contextMessage,
        platformId,
    };
}

export function createNotificationService(storage: ExtensionStorage): NotificationService {
    let handlersRegistered = false;
    let notificationSequence = 0;

    function registerHandlers(): void {
        if (handlersRegistered) {
            return;
        }

        handlersRegistered = true;

        browser.notifications.onClicked.addListener((notificationId) => {
            void (async () => {
                const payload = await storage.consumeNotificationPayload(notificationId);
                const url = payload?.url ? normalizeNotificationUrl(payload.url) : null;

                if (url) {
                    await browser.tabs.create({ url });
                }
            })();
        });

        if (import.meta.env.BROWSER !== 'firefox') {
            browser.notifications.onButtonClicked?.addListener((notificationId) => {
                void (async () => {
                    const payload = await storage.consumeNotificationPayload(notificationId);
                    const url = payload?.url ? normalizeNotificationUrl(payload.url) : null;

                    if (url) {
                        await browser.tabs.create({ url });
                    }
                })();
            });
        }

        browser.notifications.onClosed.addListener((notificationId) => {
            void storage.removeNotificationPayload(notificationId).catch((error) => {
                console.warn('[notifications] failed to remove closed payload', error);
            });
        });

        void storage.pruneNotificationPayloads().catch((error) => {
            console.warn('[notifications] failed to prune stale payloads', error);
        });
    }

    async function showJobsNotification(jobs: JobRecord[]): Promise<string[]> {
        if (!jobs || jobs.length === 0) {
            return [];
        }

        const notificationIds: string[] = [];

        for (const job of jobs) {
            const { title, message, contextMessage, platformId } = buildJobNotificationBody(job);
            const notificationId = `rasid-${Date.now()}-${++notificationSequence}-${Math.random().toString(36).slice(2)}`;
            const payloadUrl = normalizeNotificationUrl(job.url);

            if (payloadUrl) {
                await storage.storeNotificationPayload(notificationId, {
                    url: payloadUrl,
                    jobId: job.id,
                    createdAt: new Date().toISOString(),
                });
            }

            try {
                await browser.notifications.create(
                    notificationId,
                    buildNotificationOptions(
                        import.meta.env.BROWSER === 'firefox'
                            ? {
                                  iconUrl: getNotificationIcon(platformId),
                                  title,
                                  message,
                              }
                            : {
                                  iconUrl: getNotificationIcon(platformId),
                                  title,
                                  message,
                                  contextMessage,
                                  buttons: [{ title: JOB_NOTIFICATION_BUTTON_TITLE }],
                              }
                    )
                );
                notificationIds.push(notificationId);
            } catch (error) {
                if (payloadUrl) {
                    await storage.removeNotificationPayload(notificationId);
                }
                throw error;
            }
        }

        return notificationIds;
    }

    async function showAdminMessageNotification(msg: AdminMessage): Promise<string> {
        const notificationId = `rasid-admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const payloadUrl = msg.url ? normalizeNotificationUrl(msg.url) : null;

        if (payloadUrl) {
            await storage.storeNotificationPayload(notificationId, {
                url: payloadUrl,
                createdAt: new Date().toISOString(),
            });
        }

        try {
            await browser.notifications.create(
                notificationId,
                buildNotificationOptions(
                    import.meta.env.BROWSER === 'firefox'
                        ? {
                              iconUrl: getNotificationIcon(undefined),
                              title: '📢 تنبيهات من المطورين',
                              message: msg.message,
                          }
                        : {
                              iconUrl: getNotificationIcon(undefined),
                              title: '📢 تنبيهات من المطورين',
                              message: msg.message,
                              contextMessage: 'Rasid',
                          }
                )
            );
        } catch (error) {
            if (payloadUrl) {
                await storage.removeNotificationPayload(notificationId);
            }
            throw error;
        }

        return notificationId;
    }

    async function showTestNotification(): Promise<string> {
        const ids = await showJobsNotification([
            {
                id: `test-${Date.now()}`,
                platformId: 'mostaql',
                title: 'هذا إشعار تجريبي - مشروع تطوير موقع إلكتروني',
                budget: '500 $',
                url: 'https://mostaql.com/projects',
                description: 'هذا مثال للتأكد من أن مسار الإشعارات يعمل بعد إعادة هيكلة الخلفية.',
            },
        ]);

        return ids[0] ?? '';
    }

    return {
        registerHandlers,
        showJobsNotification,
        showAdminMessageNotification,
        showTestNotification,
    };
}
