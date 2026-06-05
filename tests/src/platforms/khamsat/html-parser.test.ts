import { describe, expect, it } from 'vitest';

import {
    parseKhamsatListingHtml,
    parseKhamsatProjectHtml,
} from '../../../../src/platforms/khamsat/html-parser';
import { readTextFixture } from '../../../support/fixtures';

describe('Khamsat HTML parser', () => {
    it('extracts request listings and rejects off-origin request URLs', () => {
        const jobs = parseKhamsatListingHtml(readTextFixture('khamsat', 'listing.html'));

        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({
            id: '777',
            platformId: 'khamsat',
            title: 'مطلوب مراجعة SEO لمتجر عربي',
            poster: 'عميل خمسات',
            url: 'https://khamsat.com/community/requests/777-seo-audit',
            lastInteractionAt: '2026-05-22T07:00:00+03:00',
        });
        expect(jobs[0]?.postedAt).toBeUndefined();
    });

    it('deduplicates request listings and ignores malformed request rows', () => {
        const jobs = parseKhamsatListingHtml(`
            <table>
                <tr class="forum_post">
                    <td class="details-td">
                        <div class="details-head">
                            <a href="/community/requests/100-audit">طلب أول</a>
                        </div>
                        <div class="details-list">
                            <a class="user">عميل</a>
                            <span title="2026-05-22T10:00:00+03:00">منذ ساعة</span>
                        </div>
                    </td>
                </tr>
                <tr class="forum_post">
                    <td class="details-td">
                        <div class="details-head">
                            <a href="/community/requests/100-copy">طلب مكرر</a>
                        </div>
                    </td>
                </tr>
                <tr class="forum_post">
                    <td class="details-td">
                        <div class="details-head">
                            <a href="http://khamsat.com/community/requests/101-insecure">مرفوض</a>
                            <a href="https://evil.example/community/requests/102">مرفوض</a>
                        </div>
                    </td>
                </tr>
            </table>
        `);

        expect(jobs).toEqual([
            expect.objectContaining({
                id: '100',
                title: 'طلب أول',
                poster: 'عميل',
                lastInteractionAt: '2026-05-22T10:00:00+03:00',
            }),
        ]);
    });

    it('extracts project detail fields and sanitizes attachment URLs', () => {
        const project = parseKhamsatProjectHtml(readTextFixture('khamsat', 'project.html'));

        expect(project?.platformId).toBe('khamsat');
        expect(project?.description).toContain('وصفا تفصيليا');
        expect(project?.clientName).toBe('عميل خمسات');
        expect(project?.postedAt).toBe('2026-05-21T21:00:00+03:00');
        expect(project?.attachments).toEqual([
            {
                name: 'spec.pdf',
                url: 'https://khamsat.com/uploads/spec.pdf',
            },
        ]);
    });

    it('prioritizes live sidebar owner and publish metadata over comments', () => {
        const project = parseKhamsatProjectHtml(`
            <main>
                <article class="replace_urls">
                    أحتاج إلى تطوير واجهة عربية مفصلة مع تحسينات تجربة المستخدم وتوثيق واضح لكل حالة.
                    هذا الوصف طويل بما يكفي لاختبار اختيار الوصف الصحيح من صفحة الطلب.
                </article>
                <section class="comments">
                    <a class="username" href="/user/commenter">معلق لا يجب اختياره</a>
                    <time datetime="2026-01-01T00:00:00+03:00"></time>
                </section>
            </main>
            <aside id="community_sidebar">
                <div id="sidebar">
                    <a class="sidebar_user" href="/user/request-owner">صاحب الطلب</a>
                    <div class="meta-row">
                        <span>تاريخ النشر</span>
                        <span title="05/06/2026 08:30 GMT">منذ ساعتين</span>
                    </div>
                    <a href="/user/bidder">مزايد لا يجب اختياره</a>
                </div>
            </aside>
        `);

        expect(project).toMatchObject({
            platformId: 'khamsat',
            clientName: 'صاحب الطلب',
            postedAt: '05/06/2026 08:30 GMT',
        });
    });

    it('keeps partial project fields and filters unsafe attachment URLs', () => {
        const project = parseKhamsatProjectHtml(`
            <main>
                <article class="replace_urls">وصف قصير لكنه مقبول عند عدم وجود بديل أطول</article>
                <a href="/user/client-1">عميل جزئي</a>
                <div class="attachments">
                    <a href="/uploads/spec-final.pdf"></a>
                    <a href="https://evil.example/file.pdf">evil.pdf</a>
                </div>
            </main>
        `);

        expect(project).toEqual({
            platformId: 'khamsat',
            description: 'وصف قصير لكنه مقبول عند عدم وجود بديل أطول',
            clientName: 'عميل جزئي',
            postedAt: undefined,
            attachments: [
                {
                    name: 'spec-final.pdf',
                    url: 'https://khamsat.com/uploads/spec-final.pdf',
                },
            ],
        });
    });

    it('returns null when no meaningful project fields exist', () => {
        expect(parseKhamsatProjectHtml('<main><p>short</p></main>')).toBeNull();
    });
});
