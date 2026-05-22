import { describe, expect, it } from 'vitest';

import {
    parseNafezlyListingHtml,
    parseNafezlyProjectHtml,
} from '../../../../src/platforms/nafezly/html-parser';
import { readTextFixture } from '../../../support/fixtures';

describe('Nafezly HTML parser', () => {
    it('extracts project cards and rejects insecure URLs', () => {
        const jobs = parseNafezlyListingHtml(readTextFixture('nafezly', 'listing.html'));

        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({
            id: '902',
            platformId: 'nafezly',
            title: 'تطبيق موبايل لإدارة حجوزات',
            url: 'https://nafezly.com/project/902-mobile-app',
            budget: '$300 - $600',
            duration: '10 أيام',
        });
    });

    it('deduplicates project cards and extracts optional metadata defensively', () => {
        const jobs = parseNafezlyListingHtml(`
            <div class="project-box">
                <a href="/project/300-automation">أتمتة لوحة تحكم</a>
                <h3 class="naskh">وصف مختصر للمشروع</h3>
                <a href="/u/client">عميل نفذلي</a>
                <span class="kufi">$200</span>
                <span class="kufi">5 أيام</span>
                <span class="kufi">3 عروض</span>
                <span class="kufi">منذ ساعتين</span>
            </div>
            <div class="project-box">
                <a href="/project/300-copy">نسخة مكررة</a>
            </div>
            <div class="project-box">
                <a href="http://nafezly.com/project/301-insecure">غير آمن</a>
                <a href="https://evil.example/project/302">خارج المنصة</a>
            </div>
        `);

        expect(jobs).toEqual([
            expect.objectContaining({
                id: '300',
                title: 'أتمتة لوحة تحكم',
                description: 'وصف مختصر للمشروع',
                poster: 'عميل نفذلي',
                budget: '$200',
                duration: '5 أيام',
                bidsText: '3 عروض',
                time: 'منذ ساعتين',
            }),
        ]);
    });

    it('extracts project details from Arabic card sections', () => {
        const project = parseNafezlyProjectHtml(readTextFixture('nafezly', 'project.html'));

        expect(project).toMatchObject({
            platformId: 'nafezly',
            status: 'مفتوح',
            postedAt: '22 مايو 2026',
            duration: '7 أيام',
            budget: '$100',
            bidsText: '5 عروض',
            clientName: 'عميل نفذلي',
            tags: ['TypeScript', 'WebExtensions'],
        });
    });

    it('returns partial project details from tags and ignores malformed detail rows', () => {
        const project = parseNafezlyProjectHtml(`
            <section class="main-nafez-box-styles">
                <h3 class="mb-1">بطاقة المشروع</h3>
                <div class="col-12 row"><div>حالة المشروع</div></div>
                <a href="/u/client-2">عميل جزئي</a>
            </section>
            <a class="tag-class" href="/projects/skill/typescript">TypeScript</a>
        `);

        expect(project).toEqual({
            platformId: 'nafezly',
            description: undefined,
            status: undefined,
            postedAt: undefined,
            duration: undefined,
            budget: undefined,
            bidsText: undefined,
            clientName: 'عميل جزئي',
            tags: ['TypeScript'],
        });
    });

    it('returns null for malformed project pages without useful fields', () => {
        expect(parseNafezlyProjectHtml('<div class="main-nafez-box-styles"></div>')).toBeNull();
    });
});
