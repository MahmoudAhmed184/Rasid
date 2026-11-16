import { test, expect } from '@playwright/test';
import { launchChromiumExtension } from '../extension-fixtures';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

test.describe('Dashboard and UI screenshots across languages', () => {
    test('captures full screenshots in Arabic and English with logical layouts', async () => {
        const { context, extensionId } = await launchChromiumExtension();

        // Route Mostaql requests for bids tracker and content scripts
        await context.route('https://mostaql.com/', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'text/html; charset=utf-8',
                body: `
                    <!doctype html>
                    <html lang="ar" dir="rtl">
                        <head><title>مستقل - الرئيسية</title></head>
                        <body>
                            <main>
                                <section id="project-states"></section>
                                <a href="/dashboard/bids"><span class="text-alpha">7</span></a>
                            </main>
                        </body>
                    </html>
                `,
            });
        });

        const recentDate1 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const recentDate2 = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
        const recentDate3 = new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString();

        await context.route('https://mostaql.com/dashboard/bids*', async (route) => {
            const url = route.request().url();
            if (url.includes('page=1') || !url.includes('page=')) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        collection: [
                            `<tr class="bid-row"><td><h2><a href="https://mostaql.com/project/100">تطوير منصة وتطبيق ويب بـ Next.js و Tailwind CSS</a></h2><span class="label label-prj-pending">بانتظار الموافقة</span><time datetime="${recentDate1}"></time><ul class="project__meta"><li><i class="fa fa-money"></i><span>$850</span></li></ul></td></tr>`,
                            `<tr class="bid-row"><td><h2><a href="https://mostaql.com/project/101">تصميم واجهة مستخدم متجر إلكتروني Figma عصري</a></h2><span class="label label-prj-completed">مكتمل</span><time datetime="${recentDate2}"></time><ul class="project__meta"><li><i class="fa fa-money"></i><span>$400</span></li></ul></td></tr>`,
                            `<tr class="bid-row"><td><h2><a href="https://mostaql.com/project/102">بناء لوحة تحكم وتحليلات ذكاء اصطناعي للبيانات</a></h2><span class="label label-prj-rejected">مستبعد</span><time datetime="${recentDate3}"></time><ul class="project__meta"><li><i class="fa fa-money"></i><span>$600</span></li></ul></td></tr>`,
                        ],
                        count: 3,
                    }),
                });
            } else {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ collection: [], count: 0 }),
                });
            }
        });

        // Mock Mostaql project page
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
                                <section id="project-meta-panel">
                                    <div class="meta-row"><span class="meta-label">التواصلات</span><span class="meta-value">3</span></div>
                                    <div class="meta-row"><span class="meta-label">مدة التنفيذ</span><span class="meta-value">4 أيام</span></div>
                                    <div class="meta-row"><span class="meta-label">الميزانية</span><span class="meta-value">$150 - $300</span></div>
                                </section>
                                <div data-type="project-budget_range">$150 - $300</div>
                                <div class="profile__name"><bdi>عميل مستقل</bdi></div>
                                <span class="breadcrumb-item" data-index="2">برمجة</span>
                                <div class="skills"><span class="tag">TypeScript</span></div>
                                <h1 class="heada__title"><span data-type="page-header-title">مشروع إضافة متصفح</span></h1>
                                <section id="projectDetailsTab">
                                    <div class="carda__content">وصف مشروع مستقل لاختبار أزرار راصد الجانبية باللغتين.</div>
                                </section>
                            </main>
                        </body>
                    </html>
                `,
            });
        });

        // Mock Khamsat request page
        await context.route(
            'https://khamsat.com/community/requests/777-browser-extension',
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'text/html; charset=utf-8',
                    body: `
                    <!doctype html>
                    <html lang="ar" dir="rtl">
                        <head><title>مطلوب تطوير إضافة متصفح</title></head>
                        <body>
                            <main>
                                <nav class="breadcrumb"><a>الرئيسية</a><a>طلبات الخدمات</a><a>برمجة وتطوير</a></nav>
                                <h1>مطلوب تطوير إضافة متصفح</h1>
                                <article class="replace_urls">نحتاج إلى مستقل يطوّر إضافة متصفح تدعم اللغتين العربية والإنجليزية.</article>
                                <a href="/user/client">عميل خمسات</a>
                                <time datetime="2026-05-22">منذ ساعة</time>
                            </main>
                        </body>
                    </html>
                `,
                });
            }
        );

        // Mock Nafezly project page
        await context.route('https://nafezly.com/project/44-dashboard', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'text/html; charset=utf-8',
                body: `
                    <!doctype html>
                    <html lang="ar" dir="rtl">
                        <head><title>مشروع لوحة تحكم نفذلي</title></head>
                        <body>
                            <main>
                                <h1>مشروع لوحة تحكم نفذلي</h1>
                                <div class="project-details">وصف مشروع منصة نفذلي لاختبار لوحة راصد السريعة.</div>
                                <div id="add-offer"></div>
                            </main>
                        </body>
                    </html>
                `,
            });
        });

        const arDir = resolve(process.cwd(), 'screenshots/ar');
        const enDir = resolve(process.cwd(), 'screenshots/en');
        const legacyDir = resolve(process.cwd(), 'screenshots/iteration-3');
        const popupDir = resolve(process.cwd(), 'screenshots/popup');
        mkdirSync(arDir, { recursive: true });
        mkdirSync(enDir, { recursive: true });
        mkdirSync(legacyDir, { recursive: true });
        mkdirSync(popupDir, { recursive: true });

        const page = await context.newPage();
        await page.setViewportSize({ width: 1440, height: 900 });

        // Navigate to dashboard
        await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
        await page.waitForLoadState('domcontentloaded');
        expect(page.url()).toContain('dashboard.html');

        // Seed storage data in Arabic initially
        await page.evaluate(async () => {
            const browserChrome = (
                globalThis as unknown as {
                    chrome?: {
                        storage?: {
                            local?: {
                                set: (items: Record<string, unknown>) => Promise<void>;
                            };
                        };
                    };
                }
            ).chrome;

            if (browserChrome?.storage?.local) {
                await browserChrome.storage.local.set({
                    language: 'ar',
                    stats: {
                        todayCount: 14,
                        lastCheck: new Date().toISOString(),
                    },
                    trackedProjects: {
                        'mostaql:1000': {
                            id: '1000',
                            title: 'تطوير لوحة تحكم متكاملة بـ Next.js و Tailwind CSS',
                            platformId: 'mostaql',
                            url: 'https://mostaql.com/project/1000',
                            budget: '$500 - $1000',
                            duration: '15 يوم',
                            clientName: 'أحمد محمود',
                            publishDate: 'منذ ساعتين',
                            communications: '4',
                            status: 'مفتوح',
                            lastChecked: new Date().toISOString(),
                        },
                        'khamsat:1001': {
                            id: '1001',
                            title: 'بناء بوت تيليجرام وأتمتة الذكاء الاصطناعي',
                            platformId: 'khamsat',
                            url: 'https://khamsat.com/community/1001',
                            budget: '$50',
                            duration: '3 أيام',
                            clientName: 'سارة خالد',
                            publishDate: 'منذ 5 ساعات',
                            communications: '8',
                            status: 'قيد التنفيذ',
                            lastChecked: new Date(Date.now() - 3600000).toISOString(),
                        },
                    },
                    prompts: [
                        {
                            id: 'p1',
                            title: 'عرض تطوير مواقع Full Stack',
                            content:
                                'مرحباً أستاذي الكريم، قرأت متطلبات مشروعك بعناية، ولدي خبرة 5 سنوات في React و Node.js...',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        },
                        {
                            id: 'p2',
                            title: 'عرض تصميم واجهات Figma احترافية',
                            content:
                                'تحياتي، اطلعت على فكرة المنصة ومستعد لتصميم تجربة مستخدم عصرية تركز على التحويل والوضوح...',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        },
                    ],
                    proposalTemplate:
                        'السلام عليكم، يسعدني العمل على مشروعك وتنفيذه بأعلى معايير الجودة والسرعة.',
                });
            }
        });

        // ==========================================
        // 1. CAPTURE ARABIC SCREENS (RTL)
        // ==========================================
        await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(600);

        // Verify Arabic RTL direction
        expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
        expect(await page.locator('html').getAttribute('lang')).toBe('ar');

        // Overview
        await page.screenshot({ path: resolve(arDir, '01-overview.png') });
        await page.screenshot({ path: resolve(legacyDir, '01-overview.png') });

        // Bids tracker
        await page.click('#bids-tracker-tab-button');
        await page.waitForTimeout(800);
        await page.screenshot({ path: resolve(arDir, '02-bids-tracker.png') });
        await page.screenshot({ path: resolve(legacyDir, '02-bids-tracker.png') });

        // Filters
        await page.click('#filters-tab-button');
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(arDir, '03-filters.png') });
        await page.screenshot({ path: resolve(legacyDir, '03-filters.png') });

        // Prompts
        await page.click('#prompts-tab-button');
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(arDir, '04-prompts.png') });
        await page.screenshot({ path: resolve(legacyDir, '04-prompts.png') });

        // Prompts modal
        await page.click('#addPromptBtn');
        await page.waitForTimeout(300);
        await page.screenshot({ path: resolve(arDir, '04-prompts-modal.png') });
        await page.screenshot({ path: resolve(legacyDir, '04-prompts-modal.png') });
        await page.click('#closeModalBtn');
        await page.waitForTimeout(300);

        // Proposals
        await page.click('#proposals-tab-button');
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(arDir, '05-proposals.png') });
        await page.screenshot({ path: resolve(legacyDir, '05-proposals.png') });

        // Settings
        await page.click('#settings-tab-button');
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(arDir, '06-settings.png') });
        await page.screenshot({ path: resolve(legacyDir, '06-settings.png') });

        // Popup Arabic
        const popupPage = await context.newPage();
        await popupPage.setViewportSize({ width: 380, height: 600 });
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
        await popupPage.waitForLoadState('domcontentloaded');
        await popupPage.waitForTimeout(500);
        expect(await popupPage.locator('html').getAttribute('dir')).toBe('rtl');
        await popupPage.screenshot({ path: resolve(arDir, 'popup-normal.png') });
        await popupPage.screenshot({ path: resolve(popupDir, '01-popup-normal.png') });

        // Admin msg in Arabic popup
        await popupPage.evaluate(async () => {
            const chromeApi = (
                window as unknown as {
                    chrome?: {
                        storage?: {
                            local?: { set: (items: Record<string, unknown>) => Promise<void> };
                        };
                    };
                }
            ).chrome;
            if (chromeApi?.storage?.local) {
                await chromeApi.storage.local.set({
                    adminMessages: [
                        {
                            id: 'msg-1',
                            text: 'تم تحديث خوارزميات رصد المشاريع وتحسين أداء الإشعارات اللحظية.',
                            link: 'https://github.com/rasid',
                            read: false,
                            createdAt: new Date().toISOString(),
                        },
                    ],
                });
            }
        });
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
        await popupPage.waitForLoadState('domcontentloaded');
        await popupPage.waitForTimeout(500);
        await popupPage.screenshot({ path: resolve(arDir, 'popup-admin-msg.png') });
        await popupPage.screenshot({ path: resolve(popupDir, '02-popup-admin-msg.png') });

        // Injected action bars in Arabic
        const mostaqlPage = await context.newPage();
        await mostaqlPage.setViewportSize({ width: 1200, height: 800 });
        await mostaqlPage.goto('https://mostaql.com/');
        await mostaqlPage.waitForLoadState('domcontentloaded');
        await mostaqlPage.waitForTimeout(800);
        if (
            await mostaqlPage
                .locator('#mostaql-msg-tools')
                .isVisible()
                .catch(() => false)
        ) {
            await mostaqlPage.screenshot({ path: resolve(arDir, 'content-mostaql-home.png') });
            await mostaqlPage.click('#rasid-show-analytics-btn');
            await mostaqlPage.waitForTimeout(600);
            await mostaqlPage.screenshot({
                path: resolve(arDir, 'content-mostaql-analytics-modal.png'),
            });
            await mostaqlPage.click('#rasid-analytics-close');
            await mostaqlPage.waitForTimeout(300);
            await mostaqlPage.click('#rasid-show-monitored-btn');
            await mostaqlPage.waitForTimeout(600);
            await mostaqlPage.screenshot({
                path: resolve(arDir, 'content-mostaql-monitored-modal.png'),
            });
            await mostaqlPage.click('#rasid-monitored-close');
        }

        const projectPage = await context.newPage();
        await projectPage.setViewportSize({ width: 1200, height: 800 });
        await projectPage.goto('https://mostaql.com/project/999-test-job');
        await projectPage.waitForLoadState('domcontentloaded');
        await projectPage
            .locator('#mostaql-sidebar-btn-container')
            .waitFor({ state: 'visible', timeout: 5000 })
            .catch(() => {});
        await projectPage.waitForTimeout(400);
        await projectPage.screenshot({ path: resolve(arDir, 'content-mostaql-project.png') });

        const khamsatPage = await context.newPage();
        await khamsatPage.setViewportSize({ width: 1200, height: 800 });
        await khamsatPage.goto('https://khamsat.com/community/requests/777-browser-extension');
        await khamsatPage.waitForLoadState('domcontentloaded');
        await khamsatPage
            .locator('#rasid-khamsat-panel')
            .waitFor({ state: 'visible', timeout: 5000 })
            .catch(() => {});
        await khamsatPage.waitForTimeout(400);
        await khamsatPage.screenshot({ path: resolve(arDir, 'content-khamsat-panel.png') });

        const nafezlyPage = await context.newPage();
        await nafezlyPage.setViewportSize({ width: 1200, height: 800 });
        await nafezlyPage.goto('https://nafezly.com/project/44-dashboard');
        await nafezlyPage.waitForLoadState('domcontentloaded');
        await nafezlyPage
            .locator('#rasid-nafezly-panel')
            .waitFor({ state: 'visible', timeout: 5000 })
            .catch(() => {});
        await nafezlyPage.waitForTimeout(400);
        await nafezlyPage.screenshot({ path: resolve(arDir, 'content-nafezly-panel.png') });

        // ==========================================
        // 2. TOGGLE TO ENGLISH (LTR)
        // ==========================================
        await page.bringToFront();
        const toggleBtn = page.locator('#langToggleBtn');
        await expect(toggleBtn).toBeVisible();
        await toggleBtn.click();
        await page.waitForTimeout(600);

        // Verify English LTR direction
        expect(await page.locator('html').getAttribute('dir')).toBe('ltr');
        expect(await page.locator('html').getAttribute('lang')).toBe('en');

        // ==========================================
        // 3. CAPTURE ENGLISH SCREENS (LTR)
        // ==========================================
        // Overview
        await page.click('#overview-tab-button');
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(enDir, '01-overview.png') });

        // Bids tracker
        await page.click('#bids-tracker-tab-button');
        await page.waitForTimeout(800);
        await page.screenshot({ path: resolve(enDir, '02-bids-tracker.png') });

        // Filters
        await page.click('#filters-tab-button');
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(enDir, '03-filters.png') });

        // Prompts
        await page.click('#prompts-tab-button');
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(enDir, '04-prompts.png') });

        // Prompts modal
        await page.click('#addPromptBtn');
        await page.waitForTimeout(300);
        await page.screenshot({ path: resolve(enDir, '04-prompts-modal.png') });
        await page.click('#closeModalBtn');
        await page.waitForTimeout(300);

        // Proposals
        await page.click('#proposals-tab-button');
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(enDir, '05-proposals.png') });

        // Settings
        await page.click('#settings-tab-button');
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(enDir, '06-settings.png') });

        // Popup English
        await popupPage.bringToFront();
        await popupPage.reload();
        await popupPage.waitForLoadState('domcontentloaded');
        await popupPage.waitForTimeout(500);
        expect(await popupPage.locator('html').getAttribute('dir')).toBe('ltr');
        expect(await popupPage.locator('html').getAttribute('lang')).toBe('en');
        await popupPage.screenshot({ path: resolve(enDir, 'popup-admin-msg.png') });

        // Clear admin messages for normal English popup
        await popupPage.evaluate(async () => {
            const chromeApi = (
                window as unknown as {
                    chrome?: {
                        storage?: {
                            local?: { set: (items: Record<string, unknown>) => Promise<void> };
                        };
                    };
                }
            ).chrome;
            if (chromeApi?.storage?.local) {
                await chromeApi.storage.local.set({ adminMessages: [] });
            }
        });
        await popupPage.reload();
        await popupPage.waitForLoadState('domcontentloaded');
        await popupPage.waitForTimeout(500);
        await popupPage.screenshot({ path: resolve(enDir, 'popup-normal.png') });

        // Content scripts English
        await mostaqlPage.reload();
        await mostaqlPage.waitForLoadState('domcontentloaded');
        await mostaqlPage.waitForTimeout(800);
        if (
            await mostaqlPage
                .locator('#mostaql-msg-tools')
                .isVisible()
                .catch(() => false)
        ) {
            await mostaqlPage.screenshot({ path: resolve(enDir, 'content-mostaql-home.png') });
            await mostaqlPage.click('#rasid-show-analytics-btn');
            await mostaqlPage.waitForTimeout(600);
            await mostaqlPage.screenshot({
                path: resolve(enDir, 'content-mostaql-analytics-modal.png'),
            });
            await mostaqlPage.click('#rasid-analytics-close');
            await mostaqlPage.waitForTimeout(300);
            await mostaqlPage.click('#rasid-show-monitored-btn');
            await mostaqlPage.waitForTimeout(600);
            await mostaqlPage.screenshot({
                path: resolve(enDir, 'content-mostaql-monitored-modal.png'),
            });
            await mostaqlPage.click('#rasid-monitored-close');
        }

        await projectPage.reload();
        await projectPage.waitForLoadState('domcontentloaded');
        await projectPage
            .locator('#mostaql-sidebar-btn-container')
            .waitFor({ state: 'visible', timeout: 5000 })
            .catch(() => {});
        await projectPage.waitForTimeout(400);
        await projectPage.screenshot({ path: resolve(enDir, 'content-mostaql-project.png') });

        await khamsatPage.reload();
        await khamsatPage.waitForLoadState('domcontentloaded');
        await khamsatPage
            .locator('#rasid-khamsat-panel')
            .waitFor({ state: 'visible', timeout: 5000 })
            .catch(() => {});
        await khamsatPage.waitForTimeout(400);
        await khamsatPage.screenshot({ path: resolve(enDir, 'content-khamsat-panel.png') });

        await nafezlyPage.reload();
        await nafezlyPage.waitForLoadState('domcontentloaded');
        await nafezlyPage
            .locator('#rasid-nafezly-panel')
            .waitFor({ state: 'visible', timeout: 5000 })
            .catch(() => {});
        await nafezlyPage.waitForTimeout(400);
        await nafezlyPage.screenshot({ path: resolve(enDir, 'content-nafezly-panel.png') });

        await context.close();
    });
});
