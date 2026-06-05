import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    handleQuickBidClick,
    queueProposalAutofill,
} from '../../../../../src/platforms/mostaql/content/autofill';
import { getProjectId, isContextValid } from '../../../../../src/platforms/mostaql/content/runtime';
import type {
    PlatformContentServices,
    ProposalGenerationResult,
} from '../../../../../src/platforms/contracts';
import { installTestDom } from '../../../../support/html';

function installMostaqlPage(pathname = '/project/321-browser-extension'): Document {
    const document = installTestDom(`
        <main>
            <div data-type="project-budget_range">$150 - $300</div>
            <div class="meta-row">
                <span class="meta-label">مدة التنفيذ</span>
                <span class="meta-value">4 أيام</span>
            </div>
        </main>
    `);
    const location = new URL(`https://mostaql.com${pathname}`);

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

function createProposalServices() {
    const getQuickTemplate = vi.fn(async () => 'قالب عرض سريع');
    const queueAutofillMock = vi.fn(async () => undefined);
    const generate = vi.fn(
        async () =>
            ({
                kind: 'direct',
                provider: 'openai',
                model: 'gpt-test',
                proposal: 'Generated',
            }) satisfies ProposalGenerationResult
    );
    const openBridgePrompt = vi.fn(async () => undefined);
    const proposals: PlatformContentServices['proposals'] = {
        getQuickTemplate,
        generate,
        queueAutofill: queueAutofillMock,
        openBridgePrompt,
    };

    return {
        proposals,
        getQuickTemplate,
        queueAutofill: queueAutofillMock,
        generate,
        openBridgePrompt,
    };
}

describe('Mostaql content autofill helpers', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it.each([
        ['/project/321-browser-extension', '321'],
        ['/projects/654/browser-extension', '654'],
        ['/dashboard/projects', ''],
    ])('extracts project id from %s', (pathname, expected) => {
        installMostaqlPage(pathname);

        expect(getProjectId()).toBe(expected);
    });

    it('reports the fake browser extension context as valid in tests', () => {
        installMostaqlPage();

        expect(isContextValid()).toBe(true);
    });

    it('queues explicit proposal autofill drafts with deterministic timestamps', async () => {
        vi.setSystemTime(new Date('2026-05-22T15:00:00.000Z'));
        const services = createProposalServices();

        await queueProposalAutofill({
            proposals: services.proposals,
            projectId: '321',
            proposal: 'عرض يدوي',
            amount: 125,
            duration: 6,
        });

        expect(services.queueAutofill).toHaveBeenCalledWith({
            platformId: 'mostaql',
            projectId: '321',
            proposal: 'عرض يدوي',
            amount: 125,
            durationDays: 6,
            createdAt: new Date('2026-05-22T15:00:00.000Z').getTime(),
        });
    });

    it('builds quick bid autofill from page budget, duration, and stored template', async () => {
        vi.setSystemTime(new Date('2026-05-22T16:00:00.000Z'));
        installMostaqlPage();
        const services = createProposalServices();

        await handleQuickBidClick(services.proposals);

        expect(services.getQuickTemplate).toHaveBeenCalledOnce();
        expect(services.queueAutofill).toHaveBeenCalledWith({
            platformId: 'mostaql',
            projectId: '321',
            proposal: 'قالب عرض سريع',
            amount: 150,
            durationDays: 4,
            createdAt: new Date('2026-05-22T16:00:00.000Z').getTime(),
        });
    });

    it('does not query templates when the current URL is not a project page', async () => {
        installMostaqlPage('/dashboard/projects');
        const services = createProposalServices();

        await handleQuickBidClick(services.proposals);

        expect(services.getQuickTemplate).not.toHaveBeenCalled();
        expect(services.queueAutofill).not.toHaveBeenCalled();
    });
});
