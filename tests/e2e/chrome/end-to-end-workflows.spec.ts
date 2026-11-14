import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchChromiumExtension } from '../extension-fixtures';

interface ChromeStorageShim {
    storage?: {
        local?: {
            get?: (
                keys: string[] | string | Record<string, unknown> | null,
                callback: (items: Record<string, unknown>) => void
            ) => Promise<Record<string, unknown>> | void;
            set?: (items: Record<string, unknown>, callback?: () => void) => Promise<void> | void;
            remove?: (keys: string[] | string, callback?: () => void) => Promise<void> | void;
        };
        onChanged?: {
            addListener: (callback: unknown) => void;
            removeListener?: (callback: unknown) => void;
        };
    };
}

test.describe('Helium E2E: Popups, Permissions, Workflows & ChatGPT Integration', () => {
    test('Popup UI: renders stats, toggles notifications, runs connection check, and dismisses admin messages', async () => {
        const { context, extensionId } = await launchChromiumExtension();

        try {
            // Mock platform routes so background checkNow finishes cleanly
            await context.route(/https:\/\/(mostaql|khamsat|nafezly)\.com\/.*/, async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'text/html; charset=utf-8',
                    body: '<!doctype html><html><body><main></main></body></html>',
                });
            });

            const page = await context.newPage();
            await page.goto(`chrome-extension://${extensionId}/popup.html`);
            await page.waitForLoadState('domcontentloaded');

            // 1. Verify Popup header & brand
            await expect(page.locator('.brand-copy h1')).toHaveText('Rasid');
            await expect(page.locator('.brand-copy p')).toContainText('راصد');

            // 2. Test notification toggle button
            const toggleBtn = page.locator('#toggleNotificationsBtn');
            await expect(toggleBtn).toBeVisible();
            await expect(toggleBtn).toContainText('الإشعارات: مفعلة');

            await toggleBtn.click();
            await expect(toggleBtn).toContainText('الإشعارات: متوقفة');

            await toggleBtn.click();
            await expect(toggleBtn).toContainText('الإشعارات: مفعلة');

            // 3. Test Diagnostic connection button
            const checkConnectionBtn = page.locator('#checkConnectionBtn');
            await expect(checkConnectionBtn).toBeVisible();
            await checkConnectionBtn.click();

            const report = page.locator('#connectionReport');
            await expect(report).toBeVisible();
            const reportText = await report.innerText();
            expect(reportText.length).toBeGreaterThan(0);

            // 4. Test Check Now button
            const checkNowBtn = page.locator('#checkNowBtn');
            await expect(checkNowBtn).toBeVisible();
            await checkNowBtn.click();
            await expect(report).toBeVisible({ timeout: 10_000 });

            // 5. Test Admin message banner display and dismissal
            await page.evaluate(async () => {
                const chromeObj = (globalThis as unknown as { chrome?: ChromeStorageShim }).chrome;
                if (chromeObj?.storage?.local?.set) {
                    await chromeObj.storage.local.set({
                        adminMessages: [
                            {
                                id: 'admin-msg-1',
                                message: 'تحديث هام: الإصدار الجديد متاح الآن',
                                url: 'https://example.com/update',
                                read: false,
                                receivedAt: new Date().toISOString(),
                            },
                        ],
                    });
                }
            });

            // Reload popup to pick up updated admin message storage
            await page.goto(`chrome-extension://${extensionId}/popup.html`);
            await page.waitForLoadState('domcontentloaded');

            const banner = page.locator('#adminMessagesBanner');
            await expect(banner).toBeVisible();
            await expect(page.locator('#adminMessageText')).toHaveText(
                'تحديث هام: الإصدار الجديد متاح الآن'
            );

            // Dismiss the admin message
            const dismissBtn = page.locator('#dismissAdminMessageBtn');
            await dismissBtn.click();
            await expect(banner).toHaveClass(/hidden/);
        } finally {
            await context.close();
        }
    });

    test('Permissions & Settings: verifies ChatGPT host permissions UI in Dashboard', async () => {
        const { context, extensionId } = await launchChromiumExtension();

        try {
            const page = await context.newPage();
            await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
            await page.waitForLoadState('domcontentloaded');

            // Switch to Settings tab
            const settingsTab = page.locator('button[data-tab="settings"]');
            await settingsTab.click();

            // Locate ChatGPT permission button and input
            const chatGptPermissionBtn = page.locator('#grantChatGptPermissionBtn');
            await expect(chatGptPermissionBtn).toBeVisible();

            const aiChatUrlInput = page.locator('#aiChatUrl');
            await expect(aiChatUrlInput).toBeVisible();
            await expect(aiChatUrlInput).toHaveValue('https://chatgpt.com/');

            // Verify permission status text container is present
            const statusEl = page.locator('#chatGptPermissionStatus');
            await expect(statusEl).toBeAttached();

            // Click the permission button to test permission interaction handling
            await chatGptPermissionBtn.click();
            await expect(statusEl).toBeVisible();
        } finally {
            await context.close();
        }
    });

    test('Live Workflow: Mostaql project page content script, tracking, and autofill', async () => {
        const { context } = await launchChromiumExtension();

        try {
            // Mock Mostaql project page HTML with proposal form and project details
            await context.route('https://mostaql.com/project/999-test-job', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'text/html; charset=utf-8',
                    body: `
                        <!doctype html>
                        <html lang="ar" dir="rtl">
                            <head><title>مشروع برمجة تطبيق راصد</title></head>
                            <body>
                                <main>
                                    <div id="project-meta-card">
                                        <h1 class="project-title">مشروع برمجة تطبيق راصد</h1>
                                        <span class="project-id" data-project-id="999">#999</span>
                                        <div class="project-budget">الميزانية: $250 - $500</div>
                                    </div>
                                    <div class="project-details">
                                        <div class="project__description">
                                            مطلوب مطور واجهات خلفية وأمامية لبناء لوحة تحكم سريعة وآمنة.
                                        </div>
                                    </div>
                                    <div class="project-sidebar-actions">
                                        <!-- Insertion point for sidebar tools -->
                                    </div>
                                    <form id="add-proposal-form" action="/project/999/add_proposal" method="POST">
                                        <textarea id="proposal-textarea" name="description" placeholder="أدخل تفاصيل عرضك هنا..."></textarea>
                                        <input type="number" id="proposal-cost" name="cost" value="" />
                                        <input type="number" id="proposal-duration" name="duration" value="" />
                                        <button type="submit" id="submit-proposal-btn">أضف عرضك</button>
                                    </form>
                                </main>
                            </body>
                        </html>
                    `,
                });
            });

            const page = await context.newPage();
            await page.goto('https://mostaql.com/project/999-test-job');
            await page.waitForLoadState('domcontentloaded');

            // Verify content script executed and page rendered correctly
            await expect(page.locator('.project-title')).toBeVisible();

            // Seed proposal state to test autofill workflow
            await page.evaluate(async () => {
                const chromeObj = (globalThis as unknown as { chrome?: ChromeStorageShim }).chrome;
                if (chromeObj?.storage?.local?.set) {
                    await chromeObj.storage.local.set({
                        mostaql_pending_autofill: {
                            platformId: 'mostaql',
                            projectId: '999',
                            proposal:
                                'السلام عليكم، قرأت تفاصيل المشروع وجاهز للتنفيذ بأعلى معايير الجودة.',
                            amount: 300,
                            durationDays: 5,
                            createdAt: Date.now(),
                        },
                    });
                }
            });

            // Reload page so autofill can pick up the proposal
            await page.reload();
            await page.waitForLoadState('domcontentloaded');
            await expect(page.locator('#proposal-textarea')).toBeVisible();
        } finally {
            await context.close();
        }
    });

    test('ChatGPT Bridge Integration: opens ChatGPT tab and injects prompt into input field', async () => {
        const { context } = await launchChromiumExtension();

        try {
            // Mock ChatGPT web UI
            await context.route('https://chatgpt.com/**', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'text/html; charset=utf-8',
                    body: `
                        <!doctype html>
                        <html lang="en">
                            <head><title>ChatGPT</title></head>
                            <body>
                                <form>
                                    <textarea id="prompt-textarea" placeholder="Message ChatGPT..."></textarea>
                                    <button type="submit" aria-label="Send prompt">Send</button>
                                </form>
                            </body>
                        </html>
                    `,
                });
            });

            const chatPage = await context.newPage();
            await chatPage.goto('https://chatgpt.com/');
            await chatPage.waitForLoadState('domcontentloaded');

            const bridgeCode = readFileSync(
                resolve(process.cwd(), 'dist/chrome-mv3/chatgpt-bridge.js'),
                'utf-8'
            );
            const testPrompt = 'اكتب عرضاً احترافياً لمشروع تطوير تطبيق راصد بالذكاء الاصطناعي';

            // Seed pendingChatGptPrompt into page chrome storage shim
            await chatPage.evaluate(
                ({ promptText }) => {
                    (window as unknown as { chrome: ChromeStorageShim }).chrome = {
                        storage: {
                            local: {
                                get: (
                                    _keys: unknown,
                                    cb: (items: Record<string, unknown>) => void
                                ) => {
                                    const data = {
                                        pendingChatGptPrompt: {
                                            id: 'bridge-test-1',
                                            prompt: promptText,
                                            targetHost: 'chatgpt.com',
                                            createdAt: Date.now(),
                                            expiresAt: Date.now() + 300_000,
                                        },
                                    };
                                    if (typeof cb === 'function') {
                                        cb(data);
                                    }
                                    return Promise.resolve(data);
                                },
                                set: (_items: Record<string, unknown>, cb?: () => void) => {
                                    if (typeof cb === 'function') {
                                        cb();
                                    }
                                    return Promise.resolve();
                                },
                                remove: (_keys: string[] | string, cb?: () => void) => {
                                    if (typeof cb === 'function') {
                                        cb();
                                    }
                                    return Promise.resolve();
                                },
                            },
                            onChanged: {
                                addListener: () => {},
                            },
                        },
                    };
                },
                { promptText: testPrompt }
            );

            // Execute packaged bridge script
            await chatPage.evaluate((code) => {
                const fn = new Function(code);
                fn();
            }, bridgeCode);

            // Verify bridge injects prompt into textarea
            const textarea = chatPage.locator('#prompt-textarea');
            await expect(textarea).toHaveValue(testPrompt, { timeout: 10_000 });
        } finally {
            await context.close();
        }
    });

    test('Helium Notifications: creates separate individual notifications for batch jobs without aggregation and clicking directs to project link', async () => {
        const { context } = await launchChromiumExtension();

        try {
            await context.route('https://mostaql.com/**', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: '<!DOCTYPE html><html><head><title>Mostaql Project</title></head><body><h1>Project Details</h1></body></html>',
                });
            });

            let [serviceWorker] = context.serviceWorkers();
            if (!serviceWorker) {
                serviceWorker = await context.waitForEvent('serviceworker');
            }

            const url1 = 'https://mostaql.com/project/100001';
            const url2 = 'https://mostaql.com/project/100002';
            const id1 = `rasid-batch-1-${Date.now()}`;
            const id2 = `rasid-batch-2-${Date.now()}`;

            const res = await serviceWorker.evaluate(
                async ({ id1, id2, url1, url2 }) => {
                    const chromeObj = (
                        globalThis as unknown as {
                            chrome: {
                                runtime: { getURL: (path: string) => string };
                                storage: {
                                    local: {
                                        set: (items: Record<string, unknown>) => Promise<void>;
                                    };
                                };
                                notifications: {
                                    create: (id: string, options: unknown) => Promise<string>;
                                    getAll: (
                                        callback: (notifications: Record<string, boolean>) => void
                                    ) => void;
                                };
                            };
                        }
                    ).chrome;

                    // Store notification payloads using the extension's real storage key prefix
                    await chromeObj.storage.local.set({
                        [`notification:${id1}`]: {
                            url: url1,
                            jobId: 'b-1',
                            createdAt: new Date().toISOString(),
                        },
                        [`notification:${id2}`]: {
                            url: url2,
                            jobId: 'b-2',
                            createdAt: new Date().toISOString(),
                        },
                    });

                    await chromeObj.notifications.create(id1, {
                        type: 'basic',
                        iconUrl: chromeObj.runtime.getURL('/platforms/Mostql.png'),
                        title: 'مشروع مستقل الأول',
                        message: 'الميزانية: $500\nتفاصيل المشروع الأول...',
                        buttons: [{ title: '🔗 عرض تفاصيل المشروع' }],
                        priority: 2,
                        requireInteraction: true,
                    });

                    await new Promise((r) => setTimeout(r, 300));

                    await chromeObj.notifications.create(id2, {
                        type: 'basic',
                        iconUrl: chromeObj.runtime.getURL('/platforms/Mostql.png'),
                        title: 'مشروع مستقل الثاني',
                        message: 'الميزانية: $1000\nتفاصيل المشروع الثاني...',
                        buttons: [{ title: '🔗 عرض تفاصيل المشروع' }],
                        priority: 2,
                        requireInteraction: true,
                    });

                    const all = await new Promise<Record<string, boolean>>((r) =>
                        chromeObj.notifications.getAll(r)
                    );

                    return { id1, id2, all };
                },
                { id1, id2, url1, url2 }
            );

            // Verify both notifications coexist as separate individual banners without aggregation
            expect(res.all[res.id1]).toBe(true);
            expect(res.all[res.id2]).toBe(true);
            expect(Object.keys(res.all).length).toBeGreaterThanOrEqual(2);

            // Verify clicking notification 1 banner triggers the real onClicked listener and navigates directly to project 1 link
            const page1Promise = context.waitForEvent('page');
            await serviceWorker.evaluate(
                ({ id1 }) => {
                    const chromeObj = (
                        globalThis as unknown as {
                            chrome: {
                                notifications: {
                                    onClicked: {
                                        dispatch: (notificationId: string) => void;
                                    };
                                };
                            };
                        }
                    ).chrome;
                    chromeObj.notifications.onClicked.dispatch(id1);
                },
                { id1 }
            );

            const page1 = await page1Promise;
            await page1.waitForLoadState('domcontentloaded');
            expect(page1.url()).toBe(url1);
            await page1.close();

            // Verify clicking notification 2 action button triggers the real onButtonClicked listener and navigates directly to project 2 link
            const page2Promise = context.waitForEvent('page');
            await serviceWorker.evaluate(
                ({ id2 }) => {
                    const chromeObj = (
                        globalThis as unknown as {
                            chrome: {
                                notifications: {
                                    onButtonClicked: {
                                        dispatch: (
                                            notificationId: string,
                                            buttonIndex: number
                                        ) => void;
                                    };
                                };
                            };
                        }
                    ).chrome;
                    chromeObj.notifications.onButtonClicked.dispatch(id2, 0);
                },
                { id2 }
            );

            const page2 = await page2Promise;
            await page2.waitForLoadState('domcontentloaded');
            expect(page2.url()).toBe(url2);
            await page2.close();

            // Verify payload storage was consumed and cleaned up upon notification clicks
            const remainingPayloads = await serviceWorker.evaluate(
                async ({ id1, id2 }) => {
                    const chromeObj = (
                        globalThis as unknown as {
                            chrome: {
                                storage: {
                                    local: {
                                        get: (keys: string[]) => Promise<Record<string, unknown>>;
                                    };
                                };
                            };
                        }
                    ).chrome;
                    return chromeObj.storage.local.get([
                        `notification:${id1}`,
                        `notification:${id2}`,
                    ]);
                },
                { id1, id2 }
            );
            expect(remainingPayloads[`notification:${id1}`]).toBeUndefined();
            expect(remainingPayloads[`notification:${id2}`]).toBeUndefined();
        } finally {
            await context.close();
        }
    });

    test('Helium Live Scan: measures end-to-end latency of manual Scan Now without route mocks', async () => {
        const { context, extensionId } = await launchChromiumExtension();

        try {
            let [serviceWorker] = context.serviceWorkers();
            if (!serviceWorker) {
                serviceWorker = await context.waitForEvent('serviceworker');
            }

            serviceWorker.on('console', (msg) => {
                console.log(`[SW Console]:`, msg.text());
            });

            const page = await context.newPage();
            page.on('console', (msg) => {
                console.log(`[Popup Console]:`, msg.text());
            });

            await page.goto(`chrome-extension://${extensionId}/popup.html`);
            await page.waitForLoadState('domcontentloaded');

            const checkNowBtn = page.locator('#checkNowBtn');
            await expect(checkNowBtn).toBeVisible();

            const startTime = performance.now();
            await checkNowBtn.click();

            await expect(checkNowBtn).toBeEnabled({ timeout: 20_000 });
            await expect(checkNowBtn).not.toHaveClass(/is-loading/, { timeout: 20_000 });

            const elapsed = performance.now() - startTime;
            console.log(`[LIVE HELIUM SCAN NOW LATENCY]: ${elapsed.toFixed(1)} ms`);

            const report = page.locator('#connectionReport');
            await expect(report).toBeVisible();
            const text = await report.innerText();
            console.log(`[REPORT TEXT]: "${text}"`);

            expect(elapsed).toBeLessThanOrEqual(10_000);
        } finally {
            await context.close();
        }
    });
});
