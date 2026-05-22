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

    it('extracts project details from Arabic metadata rows', () => {
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
