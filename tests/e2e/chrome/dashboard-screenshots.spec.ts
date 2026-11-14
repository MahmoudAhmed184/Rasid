import { test, expect } from '@playwright/test';
import { launchChromiumExtension } from '../extension-fixtures';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

test.describe('Dashboard screenshots', () => {
    test('captures dashboard screenshots across all tabs with rich data', async () => {
        const { context, extensionId } = await launchChromiumExtension();

        // Route Mostaql requests for bids tracker
        await context.route('https://mostaql.com/', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'text/html; charset=utf-8',
                body: `
                    <!doctype html>
                    <html>
                        <body>
                            <a href="/dashboard/bids"><span class="text-alpha">7</span></a>
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

        const page = await context.newPage();
        await page.setViewportSize({ width: 1440, height: 900 });

        const screenshotDir = resolve(process.cwd(), 'screenshots/iteration-3');
        mkdirSync(screenshotDir, { recursive: true });

        // Navigate to dashboard
        await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
        await page.waitForLoadState('domcontentloaded');
        expect(page.url()).toContain('dashboard.html');

        // Seed storage data using the real schema keys
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

        // Reload to apply seeded data
        await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(600);

        // 1. Overview tab
        await page.screenshot({ path: resolve(screenshotDir, '01-overview.png') });

        // 2. Bids tracker tab
        await page.click('#bids-tracker-tab-button');
        await page.waitForTimeout(800);
        await page.screenshot({ path: resolve(screenshotDir, '02-bids-tracker.png') });

        // 3. Filters tab
        await page.click('#filters-tab-button');
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(screenshotDir, '03-filters.png') });

        // 4. Prompts tab
        await page.click('#prompts-tab-button');
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(screenshotDir, '04-prompts.png') });

        // Open prompt modal
        await page.click('#addPromptBtn');
        await page.waitForTimeout(300);
        await page.screenshot({ path: resolve(screenshotDir, '04-prompts-modal.png') });
        await page.click('#closeModalBtn');
        await page.waitForTimeout(300);

        // 5. Proposals tab
        await page.click('#proposals-tab-button');
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(screenshotDir, '05-proposals.png') });

        // 6. Settings tab
        await page.click('#settings-tab-button');
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(screenshotDir, '06-settings.png') });

        // Popup screenshots
        const popupDir = resolve(process.cwd(), 'screenshots/popup');
        mkdirSync(popupDir, { recursive: true });

        const popupPage = await context.newPage();
        await popupPage.setViewportSize({ width: 380, height: 600 });
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
        await popupPage.waitForLoadState('domcontentloaded');
        await popupPage.waitForTimeout(600);
        await popupPage.screenshot({ path: resolve(popupDir, '01-popup-normal.png') });

        // Trigger an admin message or active notification toggle
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
        await popupPage.screenshot({ path: resolve(popupDir, '02-popup-admin-msg.png') });

        await context.close();
    });
});
