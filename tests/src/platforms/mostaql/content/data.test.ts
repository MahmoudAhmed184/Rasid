import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    extractProjectDetailsFull,
    extractMyProposalFull,
    extractProjectData,
    fetchDeepProjectData,
    getBudgetFromPage,
    getProjectDescription,
} from '../../../../../src/platforms/mostaql/content/data';
import { installTestDom } from '../../../../support/html';

function installMostaqlDom(
    markup: string,
    href = 'https://mostaql.com/project/123-title'
): Document {
    const document = installTestDom(markup);
    const location = new URL(href);

    Object.defineProperty(window, 'location', {
        configurable: true,
        value: location,
    });
    Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: location,
    });
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
        configurable: true,
        get(this: HTMLElement) {
            return this.textContent ?? '';
        },
        set(this: HTMLElement, value: string) {
            this.textContent = value;
        },
    });

    return document;
}

function createProjectMarkup(): string {
    return `
        <main>
            <span class="label-prj-open"> مفتوح </span>
            <section id="project-meta-panel">
                <div class="meta-row"><span class="meta-label">التواصلات</span><span class="meta-value">4</span></div>
                <div class="meta-row"><span class="meta-label">مدة التنفيذ</span><span class="meta-value">5 أيام</span></div>
                <div class="meta-row"><span class="meta-label">الميزانية</span><span class="meta-value">$250 - $500</span></div>
                <span class="tag">React</span>
            </section>
            <div data-type="project-budget_range">$250 - $500</div>
            <time itemprop="datePublished" datetime="2026-05-22T10:00:00Z">منذ يوم</time>
            <div class="profile__name"><bdi>عميل مستقل</bdi></div>
            <span class="breadcrumb-item" data-index="2">برمجة وتطوير</span>
            <aside class="profile_card">
                <table class="table-meta">
                    <tr><td>معدل التوظيف</td><td>75%</td></tr>
                    <tr><td>المشاريع المفتوحة</td><td>2</td></tr>
                    <tr><td>مشاريع قيد التنفيذ</td><td>1</td></tr>
                    <tr><td>تاريخ التسجيل</td><td>2021</td></tr>
                </table>
                <ul class="meta_items"><li>صاحب عمل موثق</li></ul>
            </aside>
            <div class="skills"><span class="tag">TypeScript</span><span class="tag">Extensions</span></div>
            <h1 class="heada__title"><span data-type="page-header-title">إضافة متصفح لمراقبة المشاريع</span></h1>
            <section id="projectDetailsTab">
                <div class="carda__content">
                    وصف تفصيلي لاختبار الاستخلاص من صفحة مشروع مستقل مع نص عربي طويل.
                </div>
                <div class="pdn--ts">
                    <span class="field-label">المطلوب</span>
                    <span class="text-wrapper-div">تجهيز اختبارات دقيقة</span>
                </div>
                <div id="project-files-panel">
                    <div class="attachment">
                        <a href="/uploads/spec.pdf" title="spec.pdf">spec</a>
                        <a href="https://evil.example/malware.pdf" title="bad.pdf">bad</a>
                    </div>
                </div>
            </section>
        </main>
    `;
}

function createRemoteProjectMarkup(): string {
    return `
        <html>
            <head><title>مشروع بعيد - مستقل</title></head>
            <body>
                <h1 class="heada__title"><span data-type="page-header-title">مشروع بعيد</span></h1>
                <ul class="breadcrumb">
                    <li><a>الرئيسية</a></li>
                    <li><a>برمجة</a></li>
                    <li><a>تفاصيل</a></li>
                </ul>
                <div class="project-header"><span class="label">مفتوح</span></div>
                <div class="meta-row"><span class="meta-label">حالة المشروع</span><span class="meta-value">مفتوح</span></div>
                <div class="meta-row"><span class="meta-label">الميزانية</span><span class="meta-value">$300 - $600</span></div>
                <div class="meta-row"><span class="meta-label">مدة التنفيذ</span><span class="meta-value">10 أيام</span></div>
                <time itemprop="datePublished" datetime="2026-05-22 10:00:00">منذ ساعة</time>
                <aside class="profile_card">
                    <h3 class="profile__name">عميل بعيد</h3>
                    <table>
                        <tr><td>معدل التوظيف</td><td>90%</td></tr>
                        <tr><td>تاريخ التسجيل</td><td>2020</td></tr>
                        <tr><td>المشاريع المفتوحة</td><td>3</td></tr>
                        <tr><td>مشاريع قيد التنفيذ</td><td>2</td></tr>
                        <tr><td>التواصلات الجارية</td><td>1</td></tr>
                    </table>
                    <ul class="meta_items"><li>شركة ناشئة</li></ul>
                </aside>
                <section id="projectDetailsTab">
                    <div class="carda__content">وصف بعيد مفصل لاختبار جلب صفحة المشروع.</div>
                    <div class="pdn--ts"><span class="field-label">ملاحظة</span><span class="text-wrapper-div">تفصيل إضافي</span></div>
                    <div id="project-files-panel">
                        <div class="attachment">
                            <a href="/uploads/remote.pdf" title="remote.pdf">remote</a>
                            <a href="https://evil.example/remote.pdf" title="bad.pdf">bad</a>
                        </div>
                    </div>
                </section>
                <span class="tag">TypeScript</span>
                <span class="tag">TypeScript</span>
                <span class="tag">Chrome</span>
                <section id="project-bids">
                    <article class="bid">
                        <div class="profile__name"><a href="/u/dev"><bdi>مستقل مميز</bdi></a></div>
                        <div class="bid__meta">
                            <span class="title">مهندس برمجيات</span>
                            <span class="time"><time datetime="2026-05-22 11:30:00">منذ دقائق</time></span>
                        </div>
                        <div class="bid__details"><div class="text-wrapper-div">عرض مناسب للمشروع.</div></div>
                    </article>
                </section>
            </body>
        </html>
    `;
}

describe('Mostaql content data extraction', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('extracts project data from fixture DOM and sanitizes unsupported attachment hosts', () => {
        installMostaqlDom(createProjectMarkup());
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));

        expect(getBudgetFromPage()).toBe(250);
        expect(getProjectDescription()).toContain('وصف تفصيلي');
        expect(getProjectDescription()).toContain('المطلوب: تجهيز اختبارات دقيقة');

        expect(extractProjectData()).toMatchObject({
            id: '123',
            status: 'مفتوح',
            communications: '4',
            title: 'إضافة متصفح لمراقبة المشاريع',
            url: 'https://mostaql.com/project/123-title',
            duration: '5 أيام',
            budget: '$250 - $500',
            publishDate: 'منذ يوم',
            clientName: 'عميل مستقل',
            tags: 'TypeScript, Extensions',
            category: 'برمجة وتطوير',
            hiringRate: '75%',
            openProjects: '2',
            underwayProjects: '1',
            clientJoined: '2021',
            clientType: 'صاحب عمل موثق',
            attachments: [
                {
                    name: 'spec.pdf',
                    url: 'https://mostaql.com/uploads/spec.pdf',
                },
            ],
        });
    });

    it('fetches deep project data from sanitized Mostaql URLs only', async () => {
        installMostaqlDom('<main></main>');
        const fetchMock = vi.fn(async () => new Response(createRemoteProjectMarkup()));
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: fetchMock,
        });

        await expect(fetchDeepProjectData('https://evil.example/project/1')).resolves.toBeNull();
        await expect(
            fetchDeepProjectData('https://mostaql.com/projects/999-remote')
        ).resolves.toMatchObject({
            title: 'مشروع بعيد',
            category: 'برمجة',
            status: 'مفتوح',
            budget: '$300 - $600',
            duration: '10 أيام',
            publishDate: 'منذ ساعة',
            publishDatetime: '2026-05-22 10:00:00',
            clientName: 'عميل بعيد',
            hiringRate: '90%',
            clientJoined: '2020',
            openProjects: '3',
            underwayProjects: '2',
            ongoingCommunications: '1',
            clientTitle: 'شركة ناشئة',
            tags: 'TypeScript, Chrome',
            attachments: [
                {
                    name: 'remote.pdf',
                    url: 'https://mostaql.com/uploads/remote.pdf',
                },
            ],
            bids: [
                {
                    name: 'مستقل مميز',
                    link: 'https://mostaql.com/u/dev',
                    title: 'مهندس برمجيات',
                    timeRaw: '2026-05-22 11:30:00',
                    timeText: 'منذ دقائق',
                    timeOffset: 'بعد 1 ساعة',
                    content: 'عرض مناسب للمشروع.',
                },
            ],
        });
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('returns null for failed deep project fetches and logs thrown fetch failures', async () => {
        installMostaqlDom('<main></main>');
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('not found', { status: 404 }))
            .mockRejectedValueOnce(new Error('network down'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: fetchMock,
        });

        await expect(fetchDeepProjectData('/projects/404-missing')).resolves.toBeNull();
        await expect(fetchDeepProjectData('/projects/500-throws')).resolves.toBeNull();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
            'https://mostaql.com/projects/404-missing',
            'https://mostaql.com/projects/500-throws',
        ]);
        expect(errorSpy).toHaveBeenCalledWith('Deep fetch failed:', expect.any(Error));
    });

    it('extracts conservative defaults from sparse project pages without unsafe URLs', () => {
        installMostaqlDom(
            `
                <html>
                    <head><title>Fallback Project</title></head>
                    <body>
                        <main>
                            <div data-type="project-budget_range">USD 1,250.50 - 2,000</div>
                            <section id="projectDetailsTab">Loose project details only</section>
                        </main>
                    </body>
                </html>
            `,
            'https://mostaql.com/not-a-project?next=https://evil.example/'
        );
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));

        expect(getBudgetFromPage()).toBe(1250.5);
        expect(getProjectDescription()).toBe('Loose project details only');
        expect(extractProjectData()).toMatchObject({
            id: '',
            status: 'غير معروف',
            communications: '0',
            title: 'Fallback Project',
            url: 'https://mostaql.com/not-a-project?next=https://evil.example/',
            duration: 'غير محدد',
            budget: 'USD 1,250.50 - 2,000',
            publishDate: 'غير معروف',
            clientName: 'غير معروف',
            tags: '',
            category: 'غير معروف',
            hiringRate: 'غير معروف',
            openProjects: '0',
            underwayProjects: '0',
            clientJoined: 'غير معروف',
            clientType: 'صاحب عمل',
            attachments: [],
        });
    });

    it('handles missing, empty, malformed, and Arabic-only budget text deterministically', () => {
        const cases: Array<{
            readonly name: string;
            readonly markup: string;
            readonly expected: number;
        }> = [
            { name: 'missing budget node', markup: '<main></main>', expected: 0 },
            {
                name: 'empty budget node',
                markup: '<div data-type="project-budget_range">   </div>',
                expected: 0,
            },
            {
                name: 'no ASCII numeric value',
                markup: '<div data-type="project-budget_range">ميزانية مفتوحة</div>',
                expected: 0,
            },
            {
                name: 'Arabic-Indic digits are not misread as ASCII numbers',
                markup: '<div data-type="project-budget_range">١٢٣ - ٤٥٦ دولار</div>',
                expected: 0,
            },
        ];

        for (const budgetCase of cases) {
            installMostaqlDom(budgetCase.markup);
            expect(getBudgetFromPage(), budgetCase.name).toBe(budgetCase.expected);
        }
    });

    it('normalizes remote fallbacks with missing bidder fields and no description container', async () => {
        installMostaqlDom('<main></main>');
        const fetchMock = vi.fn(
            async () =>
                new Response(`
                    <html>
                        <head><title>Fallback Remote - مستقل</title></head>
                        <body>
                            <div class="project-header__meta"><a>تصميم</a></div>
                            <div class="project-header"><span class="label">مغلق</span></div>
                            <section id="project-bids">
                                <article class="bid">
                                    <div class="profile__name">
                                        <a href="https://evil.example/u/bad"><span>bad link</span></a>
                                    </div>
                                    <div class="bid__meta"><span class="time"><time datetime="2026-05-21 09:00:00">أمس</time></span></div>
                                </article>
                            </section>
                        </body>
                    </html>
                `)
        );
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: fetchMock,
        });

        await expect(fetchDeepProjectData('/project/111-fallback')).resolves.toMatchObject({
            title: 'Fallback Remote',
            category: 'تصميم',
            status: 'مغلق',
            publishDatetime: null,
            description: 'تعذر العثور على وصف تفصيلي.',
            attachments: [],
            bids: [
                {
                    name: 'مجهول',
                    link: '#',
                    title: '',
                    timeRaw: '2026-05-21 09:00:00',
                    timeText: 'أمس',
                    timeOffset: null,
                    content: '',
                },
            ],
        });
    });

    it('merges external project details, dedupes tags, and falls back when remote data is unavailable', async () => {
        installMostaqlDom(`
            <a href="/project/777-remote">project</a>
            <div class="skills"><span class="tag">TypeScript</span><span class="tag">null</span><span class="tag">Chrome</span></div>
            <h1 class="heada__title"><span data-type="page-header-title">Local title</span></h1>
            <section id="projectDetailsTab">
                <div class="carda__content">Local description</div>
            </section>
        `);
        const fetchMock = vi.fn(async () => new Response(createRemoteProjectMarkup()));
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: fetchMock,
        });

        await expect(extractProjectDetailsFull()).resolves.toMatchObject({
            data: {
                title: 'مشروع بعيد',
                description: expect.stringContaining('وصف بعيد مفصل'),
                tagsList: ['TypeScript', 'Chrome'],
            },
            text: expect.stringContaining('العنوان: مشروع بعيد'),
        });

        installMostaqlDom(`
            <a href="https://evil.example/project/777">evil</a>
            <div class="skills"><span class="tag">TypeScript</span><span class="tag">null</span></div>
            <h1 class="heada__title"><span data-type="page-header-title">Local only</span></h1>
        `);

        await expect(extractProjectDetailsFull()).resolves.toMatchObject({
            data: {
                title: 'Local only',
                description: 'تعذر العثور على وصف تفصيلي.',
                tagsList: ['TypeScript'],
                bids: [],
            },
            text: expect.stringContaining('العنوان: Local only'),
        });
    });

    it('returns null when full project detail extraction throws unexpectedly', async () => {
        installMostaqlDom('<main></main>');
        const querySelectorSpy = vi.spyOn(document, 'querySelector').mockImplementation(() => {
            throw new Error('selector unavailable');
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(extractProjectDetailsFull()).resolves.toBeNull();

        expect(querySelectorSpy).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
            'Error extracting project details:',
            expect.any(Error)
        );
    });

    it('returns my proposal from remote bids before falling back to DOM proposal cards', () => {
        installMostaqlDom('<div class="user-menu__name">أحمد</div>');

        expect(
            extractMyProposalFull({
                ...extractProjectData(),
                budget: '$500',
                duration: '8 أيام',
                bids: [
                    {
                        name: 'أحمد محمد',
                        link: 'https://mostaql.com/u/me',
                        title: 'مطور',
                        timeRaw: null,
                        timeText: '',
                        timeOffset: null,
                        content: 'هذا هو عرضي البعيد.',
                    },
                ],
            })
        ).toMatchObject({
            data: {
                bidderName: 'أحمد محمد',
                price: '$500',
                duration: '8 أيام',
                content: 'هذا هو عرضي البعيد.',
                attachments: [],
            },
        });

        installMostaqlDom(`
            <article class="proposal-item">
                <div class="profile__name">أحمد <button class="btn">menu</button></div>
                <div class="vertical-meta-column">
                    <span class="meta-title">المبلغ</span>
                    <span class="meta-content">$450 <span class="hide">hidden</span></span>
                </div>
                <div class="vertical-meta-column">
                    <span class="meta-title">مدة التنفيذ</span>
                    <span class="meta-content">6 أيام</span>
                </div>
                <div class="bid__details"><div class="text-wrapper-div">نص العرض المحلي ... عرض المزيد</div></div>
                <div id="bid-attachments">
                    <div class="attachment">
                        <a href="/uploads/bid.pdf" title="bid.pdf">bid</a>
                        <a href="https://evil.example/bad.pdf" title="bad.pdf">bad</a>
                    </div>
                </div>
            </article>
        `);

        expect(extractMyProposalFull()).toMatchObject({
            data: {
                bidderName: 'أحمد',
                price: '$450',
                duration: '6 أيام',
                content: 'نص العرض المحلي',
                attachments: [
                    {
                        name: 'bid.pdf',
                        url: 'https://mostaql.com/uploads/bid.pdf',
                    },
                ],
            },
        });
    });

    it('returns null for missing local proposals and fills safe defaults for partial proposal cards', () => {
        installMostaqlDom('<main></main>');
        expect(extractMyProposalFull()).toBeNull();

        installMostaqlDom(`
            <section id="bidTab">
                <article class="bid">
                    <div class="profile__name">  </div>
                    <div class="bid__details"><div class="text-wrapper-div">... عرض المزيد عرض أقل</div></div>
                    <div id="bid-attachments">
                        <div class="attachment">
                            <a href="javascript:alert(1)" title="bad.js">bad</a>
                            <a href="//evil.example/file.pdf" title="evil.pdf">evil</a>
                        </div>
                    </div>
                </article>
            </section>
        `);

        expect(extractMyProposalFull()).toMatchObject({
            data: {
                bidderName: '',
                price: '',
                duration: '',
                content: 'نص العرض غير متوفر',
                attachments: [],
            },
            text: expect.stringContaining('نص العرض غير متوفر'),
        });
    });

    it('returns null and logs when proposal extraction encounters broken DOM APIs', () => {
        installMostaqlDom('<article class="proposal-item"></article>');
        const querySelectorSpy = vi.spyOn(document, 'querySelector').mockImplementation(() => {
            throw new Error('query failed');
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(extractMyProposalFull()).toBeNull();
        expect(querySelectorSpy).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith('Error extracting my proposal:', expect.any(Error));
    });
});
