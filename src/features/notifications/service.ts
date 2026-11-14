import { browser } from 'wxt/browser';

import type { JobRecord } from '../../entities/job/model';
import {
    inferSupportedPlatformIdFromUrl,
    isPlatformId,
    type PlatformId,
} from '../../platforms/platform-ids';
import type { AdminMessage } from '../../shared/storage/modules/admin-message-storage';
import type { ExtensionStorage } from '../../shared/storage/extension-storage';

const NOTIFICATION_ALLOWED_HOSTS = ['mostaql.com', 'khamsat.com', 'nafezly.com'] as const;
const JOB_NOTIFICATION_BUTTON_TITLE = '🔗 عرض تفاصيل المشروع';
export const NOTIFICATION_STAGGER_MS = 300;

export interface NotificationServiceOptions {
    readonly staggerMs?: number;
}

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

function resolveNotificationPlatformId(
    job: Pick<JobRecord, 'platformId' | 'url'>
): PlatformId | undefined {
    if (isPlatformId(job.platformId)) {
        return job.platformId;
    }

    return inferSupportedPlatformIdFromUrl(job.url) ?? undefined;
}

function getNotificationIcon(platformId: PlatformId | undefined): string {
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
    readonly priority?: number;
    readonly requireInteraction?: boolean;
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
        priority: options.priority ?? 2,
        requireInteraction: options.requireInteraction ?? true,
    };
}

function buildJobNotificationBody(job: JobRecord): {
    title: string;
    message: string;
    platformId: PlatformId | undefined;
} {
    const platformId = resolveNotificationPlatformId(job);

    const title = job.title?.trim() ? `مشروع جديد: ${job.title.trim()}` : 'مشروع جديد';
    const budgetStr = job.budget?.trim() ? `الميزانية: ${job.budget.trim()}` : '';
    const trimmedDesc = job.description?.slice(0, 100).trim();
    const descriptionStr = trimmedDesc ? `${trimmedDesc}...` : '';

    const message = [budgetStr, descriptionStr].filter(Boolean).join('\n');

    return {
        title,
        message,
        platformId,
    };
}

export function createNotificationService(
    storage: ExtensionStorage,
    options?: NotificationServiceOptions
): NotificationService {
    let handlersRegistered = false;
    let notificationSequence = 0;
    const defaultStaggerMs = import.meta.env.BROWSER === 'firefox' ? 0 : NOTIFICATION_STAGGER_MS;
    const staggerMs = options?.staggerMs !== undefined ? options.staggerMs : defaultStaggerMs;

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

        const notificationPromises = jobs.map(async (job, index) => {
            if (!job) {
                return null;
            }

            if (index > 0 && staggerMs > 0) {
                await new Promise<void>((resolve) => setTimeout(resolve, index * staggerMs));
            }

            const { title, message, platformId } = buildJobNotificationBody(job);
            const notificationId = `rasid-${Date.now()}-${++notificationSequence}-${Math.random().toString(36).slice(2) || '0'}`;
            const payloadUrl = normalizeNotificationUrl(job.url);

            const storePromise = payloadUrl
                ? storage.storeNotificationPayload(notificationId, {
                      url: payloadUrl,
                      jobId: job.id,
                      createdAt: new Date().toISOString(),
                  })
                : Promise.resolve();

            try {
                const createPromise = browser.notifications.create(
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
                                  buttons: [{ title: JOB_NOTIFICATION_BUTTON_TITLE }],
                              }
                    )
                );

                await Promise.all([createPromise, storePromise]);
                return notificationId;
            } catch (error) {
                if (payloadUrl) {
                    await storePromise.catch(() => undefined);
                    await storage.removeNotificationPayload(notificationId).catch(() => undefined);
                }
                throw error;
            }
        });

        const results = await Promise.all(notificationPromises);
        return results.filter((id): id is string => id !== null);
    }

    async function showAdminMessageNotification(msg: AdminMessage): Promise<string> {
        const notificationId = `rasid-admin-${Date.now()}-${Math.random().toString(36).slice(2) || '0'}`;
        const payloadUrl = msg.url ? normalizeNotificationUrl(msg.url) : null;

        const storePromise = payloadUrl
            ? storage.storeNotificationPayload(notificationId, {
                  url: payloadUrl,
                  createdAt: new Date().toISOString(),
              })
            : Promise.resolve();

        try {
            const createPromise = browser.notifications.create(
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
                              buttons: msg.url ? [{ title: '🔗 فتح الرابط' }] : undefined,
                          }
                )
            );
            await Promise.all([createPromise, storePromise]);
        } catch (error) {
            if (payloadUrl) {
                await storePromise.catch(() => undefined);
                await storage.removeNotificationPayload(notificationId);
            }
            throw error;
        }

        return notificationId;
    }

    async function showTestNotification(): Promise<string> {
        const notificationId = `rasid-test-${Date.now()}-${++notificationSequence}`;
        const payloadUrl = 'https://mostaql.com/projects';

        const storePromise = storage
            .storeNotificationPayload(notificationId, {
                url: payloadUrl,
                jobId: 'test-job',
                createdAt: new Date().toISOString(),
            })
            .catch((error) => {
                console.warn('[notifications] failed to store test notification payload', error);
            });

        const iconUrl = getNotificationIcon('mostaql');
        const options = buildNotificationOptions(
            import.meta.env.BROWSER === 'firefox'
                ? {
                      iconUrl,
                      title: 'هذا إشعار تجريبي - مشروع تطوير موقع إلكتروني',
                      message: 'هذا مثال للتأكد من أن مسار الإشعارات يعمل بعد إعادة هيكلة الخلفية.',
                  }
                : {
                      iconUrl,
                      title: 'هذا إشعار تجريبي - مشروع تطوير موقع إلكتروني',
                      message: 'هذا مثال للتأكد من أن مسار الإشعارات يعمل بعد إعادة هيكلة الخلفية.',
                      buttons: [{ title: JOB_NOTIFICATION_BUTTON_TITLE }],
                  }
        );

        try {
            const createPromise = browser.notifications.create(notificationId, options);
            await Promise.all([createPromise, storePromise]);
            return notificationId;
        } catch (error) {
            await storePromise.catch(() => undefined);
            await storage.removeNotificationPayload(notificationId).catch(() => undefined);
            throw error;
        }
    }

    return {
        registerHandlers,
        showJobsNotification,
        showAdminMessageNotification,
        showTestNotification,
    };
}
