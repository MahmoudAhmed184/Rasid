import { describe, expect, it, vi } from 'vitest';

import { extractNafezlyProposalSource } from '../../../../../src/platforms/nafezly/content/data';
import { installTestDom } from '../../../../support/html';

describe('Nafezly proposal source extraction', () => {
    it('extracts project details, budget, duration, skills, and client metadata', () => {
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        const document = installTestDom(`
            <meta name="nafezly-title" content="تطبيق لوحة تحكم" />
            <section class="main-nafez-box-styles">
                <h3 class="mb-1">تفاصيل المشروع</h3>
                <h2 class="naskh">نحتاج إلى بناء لوحة تحكم عربية لاختبار مسار الاستخلاص.</h2>
            </section>
            <section class="main-nafez-box-styles">
                <h3 class="mb-1">بطاقة المشروع</h3>
                <a href="/u/client">عميل نفذلي</a>
                <div class="col-12 row"><div>الميزانية</div><div>$500 - $700</div></div>
                <div class="col-12 row"><div>المدة المتاحة</div><div>7 أيام</div></div>
                <div class="col-12 row"><div>تاريخ النشر</div><div>منذ يوم</div></div>
                <div class="col-12 row"><div>حالة المشروع</div><div>مفتوح</div></div>
            </section>
            <a class="tag-class" href="/projects/skill/typescript">TypeScript</a>
            <a class="tag-class" href="/projects/skill/browser">Extensions</a>
        `);

        const source = extractNafezlyProposalSource({
            page: { kind: 'project', key: 'project:44', projectId: '44' },
            document,
            url: new URL('https://nafezly.com/project/44'),
        });

        expect(source).toMatchObject({
            minBudget: 500,
            durationDays: 7,
            trackedProject: {
                id: '44',
                platformId: 'nafezly',
                title: 'تطبيق لوحة تحكم',
                budget: '$500 - $700',
                duration: '7 أيام',
                status: 'مفتوح',
                clientName: 'عميل نفذلي',
                tags: 'TypeScript, Extensions',
            },
            aiContext: {
                tags: ['TypeScript', 'Extensions'],
                projectId: '44',
            },
        });
    });

    it('returns null when required title, description, or project id is missing', () => {
        expect(
            extractNafezlyProposalSource({
                page: { kind: 'project', key: 'project:', projectId: '' },
                document: installTestDom('<main></main>'),
                url: new URL('https://nafezly.com/project/'),
            })
        ).toBeNull();
    });
});
