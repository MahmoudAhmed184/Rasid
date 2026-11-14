import { describe, expect, it } from 'vitest';

import {
    parseMostaqlListingHtml,
    parseMostaqlProjectHtml,
} from '../../../../src/platforms/mostaql/html-parser';
import { readTextFixture } from '../../../support/fixtures';

describe('Mostaql HTML parser', () => {
    it('extracts listing jobs, normalizes relative URLs, and rejects off-origin links', () => {
        const jobs = parseMostaqlListingHtml(readTextFixture('mostaql', 'listing.html'));

        expect(jobs).toHaveLength(2);
        expect(jobs[0]).toMatchObject({
            id: '123',
            platformId: 'mostaql',
            title: 'تطوير لوحة متابعة عربية',
            url: 'https://mostaql.com/project/123-build-arabic-dashboard',
            bidsText: '12 عروض',
        });
        expect(jobs.map((job) => job.url).join('\n')).not.toContain('evil.example');
    });

    it('parses project-row divs and handles /projects/ plural URL structures', () => {
        const html = `
            <div class="project-row">
                <h2><a href="/projects/888-modern-arabic-job">مشروع جمع حديث</a></h2>
                <span class="budget">$200 - $400</span>
                <p class="project__brief">وصف مختصر من قائمة المشاريع</p>
                <time datetime="2026-05-22T12:00:00Z">منذ ساعة</time>
            </div>
        `;
        const jobs = parseMostaqlListingHtml(html);

        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({
            id: '888',
            platformId: 'mostaql',
            title: 'مشروع جمع حديث',
            url: 'https://mostaql.com/projects/888-modern-arabic-job',
            budget: '$200 - $400',
            description: 'وصف مختصر من قائمة المشاريع',
        });
    });

    it('parses modern Mostaql listing table row with action buttons and normalized UTC datetime', () => {
        const html = `
            <table>
                <tr class="project-row">
                    <td>
                        <div class="card--actions">
                            <a href="https://mostaql.com/project/create?template=1293010">مشروع مماثل</a>
                        </div>
                        <h2>
                            <a href="https://mostaql.com/project/1293010-design">تصميم معماري</a>
                        </h2>
                        <ul class="list-meta-items">
                            <li class="text-muted"><i class="fa fa-user"></i> <bdi>وليد م.</bdi></li>
                            <li class="text-muted">
                                <time datetime="2026-11-14 12:06:32" title="2026-11-14 12:06:32">
                                    <i class="fa fa-clock-o"></i> منذ 18 دقيقة
                                </time>
                            </li>
                            <li class="text-muted"><span class="hsoub-file-signature-icon"></span> 3 عروض</li>
                        </ul>
                        <p class="text-wrapper-div project__brief">
                            <a href="https://mostaql.com/project/1293010-design" class="details-url">تصميم معماري لدور متكرر</a>
                        </p>
                    </td>
                </tr>
            </table>
        `;

        const jobs = parseMostaqlListingHtml(html);
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({
            id: '1293010',
            platformId: 'mostaql',
            title: 'تصميم معماري',
            url: 'https://mostaql.com/project/1293010-design',
            poster: 'وليد م.',
            time: 'منذ 18 دقيقة',
            postedAt: '2026-11-14T12:06:32Z',
            bidsText: '3 عروض',
            description: 'تصميم معماري لدور متكرر',
        });
    });

    it('extracts jobs from listing-modern fixture with action buttons and multiple rows', () => {
        const jobs = parseMostaqlListingHtml(readTextFixture('mostaql', 'listing-modern.html'));
        expect(jobs).toHaveLength(2);
        expect(jobs[0].id).toBe('1293010');
        expect(jobs[1].id).toBe('1293009');
        expect(jobs[1].title).toBe('إعلانات ممولة');
    });

    it('deduplicates listing rows and falls back to standalone project anchors when needed', () => {
        expect(
            parseMostaqlListingHtml(`
                <div class="list-group-item">
                    <a href="/project/900-first">مشروع أول طويل</a>
                    <ul class="project__meta"><li>أ</li><li>ب</li><li>4 عروض</li></ul>
                </div>
                <div class="list-group-item">
                    <a href="/project/900-duplicate">مشروع مكرر</a>
                </div>
                <table>
                    <tr>
                        <td><a href="/project/901-table">مشروع من جدول</a></td>
                        <td></td><td></td><td>$50</td><td>منذ ساعة</td>
                    </tr>
                    <tr>
                        <td><a href="/users/1">ليس مشروعاً</a></td>
                    </tr>
                </table>
            `).map((job) => job.id)
        ).toEqual(['900', '901']);

        const fallbackJobs = parseMostaqlListingHtml(`
            <main>
                <a href="/project/902-fallback-title">عنوان احتياطي طويل</a>
                <a href="/project/902-fallback-title-copy">عنوان مكرر</a>
                <a href="/projects/not-a-number">رابط بلا معرف</a>
                <a href="https://evil.example/project/903">رابط خارجي مرفوض</a>
                <a href="/project/904-short">قصير</a>
            </main>
        `);

        expect(fallbackJobs).toEqual([
            expect.objectContaining({
                id: '902',
                platformId: 'mostaql',
                title: 'عنوان احتياطي طويل',
                url: 'https://mostaql.com/project/902-fallback-title',
            }),
        ]);
    });

    it('prioritizes title link with non-empty text when icon anchor or description anchor precedes it', () => {
        const html = `
            <div class="list-group-item">
                <a href="/project/555-my-job"><i class="fa fa-folder"></i></a>
                <h2><a href="/project/555-my-job">تطوير تطبيق متكامل</a></h2>
                <p class="project__brief">
                    <a href="/project/555-my-job" class="details-url">تفاصيل المشروع في الوصف</a>
                </p>
            </div>
        `;
        const jobs = parseMostaqlListingHtml(html);
        expect(jobs).toHaveLength(1);
        expect(jobs[0].title).toBe('تطوير تطبيق متكامل');
        expect(jobs[0].id).toBe('555');
    });

    it('extracts metadata from fallback table row including date, budget, and poster', () => {
        const html = `
            <table>
                <tr>
                    <td>
                        <a href="/project/777-table-job">تنفيذ متجر إلكتروني</a>
                        <bdi>أحمد م.</bdi>
                    </td>
                    <td></td>
                    <td>5 عروض</td>
                    <td>$250 - $500</td>
                    <td><time datetime="2026-11-14 10:00:00">منذ ساعتين</time></td>
                </tr>
            </table>
        `;
        const jobs = parseMostaqlListingHtml(html);
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({
            id: '777',
            title: 'تنفيذ متجر إلكتروني',
            poster: 'أحمد م.',
            budget: '$250 - $500',
            postedAt: '2026-11-14T10:00:00Z',
            bidsText: '5 عروض',
        });
    });

    it('extracts project details from Arabic metadata rows and author containers', () => {
        const project = parseMostaqlProjectHtml(readTextFixture('mostaql', 'project.html'));

        expect(project).toMatchObject({
            platformId: 'mostaql',
            status: 'مفتوح',
            budget: '$500 - $1000',
            duration: '15 يوم',
            hiringRate: '87%',
            communications: '3',
        });
        expect(project?.description).toContain('إضافة متصفح');

        const richProject = parseMostaqlProjectHtml(`
            <div class="profile__name"><bdi>خالد أحمد</bdi></div>
            <time itemprop="datePublished" datetime="2026-05-22T10:00:00Z"></time>
            <div data-type="project-budget_range">$300 - $600</div>
            <article class="carda__content">تفاصيل كاملة</article>
        `);
        expect(richProject).toMatchObject({
            clientName: 'خالد أحمد',
            postedAt: '2026-05-22T10:00:00Z',
            budget: '$300 - $600',
            description: 'تفاصيل كاملة',
        });
    });

    it('returns no jobs for challenge pages', () => {
        expect(parseMostaqlListingHtml(readTextFixture('mostaql', 'challenge.html'))).toEqual([]);
    });

    it('returns default project details when optional metadata is missing', () => {
        expect(
            parseMostaqlProjectHtml('<main><article>لا توجد بيانات وصفية</article></main>')
        ).toEqual({
            platformId: 'mostaql',
            status: 'غير معروف',
            communications: '0',
            hiringRate: '',
            description: '',
            duration: 'غير محددة',
            budget: '',
            registrationDate: '',
        });
    });
});
