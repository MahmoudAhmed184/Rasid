import { describe, expect, it, vi } from 'vitest';

import { createTrackedProjectsPanel } from '../../../../src/app/dashboard/projects';
import type { TrackedProjectRecord } from '../../../../src/platforms/contracts';
import { fakeBrowser } from '../../../support/fake-browser';
import { installTestDom } from '../../../support/html';

describe('dashboard tracked projects panel', () => {
    it('renders empty state and limits tracked project cards to seven items', () => {
        const document = installTestDom('<section id="recentProjectsList"></section>');
        const panel = createTrackedProjectsPanel(document, {
            proposalRepository: {
                getQuickTemplate: vi.fn(async () => ''),
                queueAutofill: vi.fn(async () => undefined),
            },
        });

        panel.render([]);
        expect(document.querySelector('.empty-state')?.textContent).toContain('لا توجد مشاريع');

        const jobs: TrackedProjectRecord[] = Array.from({ length: 8 }, (_, index) => ({
            id: String(index + 1),
            platformId: index % 2 === 0 ? 'mostaql' : 'khamsat',
            title: `مشروع ${index + 1}`,
            url:
                index % 2 === 0
                    ? `https://mostaql.com/project/${index + 1}`
                    : `https://khamsat.com/community/requests/${index + 1}`,
            status: index === 0 ? 'جارٍ التنفيذ' : index === 1 ? 'مغلق' : 'مفتوح',
            budget: '$500',
            duration: '5 أيام',
            communications: '3',
            clientName: 'عميل',
            publishDate: 'منذ ساعة',
        }));

        panel.render(jobs);

        expect(document.querySelectorAll('.mj-project-item')).toHaveLength(7);
        expect(document.querySelector('.mj-platform-badge')?.textContent).toBe('مستقل');
        expect(document.querySelector('.mj-status-processing')?.textContent).toBe('جارٍ التنفيذ');
        expect(document.querySelector('.mj-status-closed')?.textContent).toBe('مغلق');
    });

    it('queues autofill from card metadata and opens the original project URL', async () => {
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        const document = installTestDom('<section id="recentProjectsList"></section>');
        const tabsCreate = vi.spyOn(fakeBrowser.tabs, 'create');
        const proposalRepository = {
            getQuickTemplate: vi.fn(async () => 'Quick proposal'),
            queueAutofill: vi.fn(async () => undefined),
        };
        const panel = createTrackedProjectsPanel(document, { proposalRepository });

        panel.bind();
        panel.render([
            {
                id: '777',
                platformId: 'khamsat',
                title: 'طلب خدمة',
                url: 'https://khamsat.com/community/requests/777',
                budget: '$250',
                duration: '3 أيام',
            },
        ]);

        document.querySelector<HTMLAnchorElement>('.btn-apply-autofill')?.click();

        await vi.waitFor(() =>
            expect(proposalRepository.queueAutofill).toHaveBeenCalledWith({
                platformId: 'khamsat',
                projectId: '777',
                amount: 250,
                durationDays: 3,
                proposal: 'Quick proposal',
                createdAt: Date.now(),
            })
        );
        expect(tabsCreate).toHaveBeenCalledWith({
            url: 'https://khamsat.com/community/requests/777',
        });
    });
});
