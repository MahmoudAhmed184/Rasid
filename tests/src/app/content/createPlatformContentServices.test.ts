import { describe, expect, it, vi } from 'vitest';

import type { PromptTemplate } from '../../../../src/entities/prompt/model';
import { createPlatformContentServices } from '../../../../src/app/content/createPlatformContentServices';
import type {
    PlatformAutofillDraft,
    TrackedProjectRecord,
} from '../../../../src/platforms/contracts';

const backgroundMessages = vi.hoisted(() => ({
    requestGenerateProposal: vi.fn(),
    requestOpenChatBridgePrompt: vi.fn(),
    requestDownloadZip: vi.fn(),
}));

vi.mock('../../../../src/app/background/background-messages', () => ({
    requestGenerateProposal: backgroundMessages.requestGenerateProposal,
    requestOpenChatBridgePrompt: backgroundMessages.requestOpenChatBridgePrompt,
    requestDownloadZip: backgroundMessages.requestDownloadZip,
}));

function createDependencies() {
    const prompts: PromptTemplate[] = [{ id: 'p1', title: 'Prompt', content: 'Body' }];
    const tracked: TrackedProjectRecord[] = [
        {
            id: '1',
            platformId: 'mostaql',
            title: 'Project',
            url: 'https://mostaql.com/project/1',
        },
    ];

    return {
        promptRepository: {
            list: vi.fn(async () => prompts),
            save: vi.fn(async (draft: { title: string; content: string }) => ({
                id: 'p2',
                ...draft,
            })),
        },
        proposalRepository: {
            getQuickTemplate: vi.fn(async () => 'Quick proposal'),
            queueAutofill: vi.fn(async (_draft: PlatformAutofillDraft) => undefined),
        },
        trackingRepository: {
            list: vi.fn(async () => tracked),
            isTracked: vi.fn(async () => true),
            toggle: vi.fn(async () => 'untracked' as const),
        },
    };
}

describe('platform content services', () => {
    it('delegates prompt and tracking services to repositories', async () => {
        const deps = createDependencies();
        const services = createPlatformContentServices(deps);

        await expect(services.prompts.list()).resolves.toHaveLength(1);
        await expect(services.prompts.save({ title: 'New', content: 'Body' })).resolves.toEqual({
            id: 'p2',
            title: 'New',
            content: 'Body',
        });
        await expect(services.tracking.list()).resolves.toHaveLength(1);
        await expect(services.tracking.isTracked('1', 'mostaql')).resolves.toBe(true);
        await expect(
            services.tracking.toggle({
                id: '1',
                platformId: 'mostaql',
                title: 'Project',
                url: 'https://mostaql.com/project/1',
            })
        ).resolves.toBe('untracked');
    });

    it('normalizes direct, bridge, and error proposal responses', async () => {
        const services = createPlatformContentServices(createDependencies());

        backgroundMessages.requestGenerateProposal.mockResolvedValueOnce({
            success: true,
            mode: 'direct',
            proposal: 'Direct proposal',
            provider: 'openai',
            model: 'gpt-test',
        });
        await expect(
            services.proposals.generate('default', { title: 'T', description: '' })
        ).resolves.toEqual({
            kind: 'direct',
            proposal: 'Direct proposal',
            provider: 'openai',
            model: 'gpt-test',
        });

        backgroundMessages.requestGenerateProposal.mockResolvedValueOnce({
            success: true,
            mode: 'bridge',
            prompt: 'Bridge prompt',
            chatUrl: 'https://chatgpt.com/',
        });
        await expect(
            services.proposals.generate('default', { title: 'T', description: '' })
        ).resolves.toEqual({
            kind: 'bridge',
            prompt: 'Bridge prompt',
            chatUrl: 'https://chatgpt.com/',
        });

        backgroundMessages.requestGenerateProposal.mockResolvedValueOnce({
            success: false,
            error: 'Provider failed',
        });
        await expect(
            services.proposals.generate('default', { title: 'T', description: '' })
        ).resolves.toEqual({
            kind: 'error',
            message: 'Provider failed',
        });

        backgroundMessages.requestGenerateProposal.mockResolvedValueOnce({
            success: false,
        });
        await expect(
            services.proposals.generate('default', { title: 'T', description: '' })
        ).resolves.toEqual({
            kind: 'error',
            message: 'Unknown AI generation error.',
        });
    });

    it('queues autofill, opens bridge prompts, downloads ZIP files, and reports ZIP failures', async () => {
        const deps = createDependencies();
        const services = createPlatformContentServices(deps);
        const draft: PlatformAutofillDraft = {
            platformId: 'khamsat',
            projectId: '77',
            proposal: 'Proposal',
            amount: 5,
            durationDays: 0,
            createdAt: 1,
        };

        await services.proposals.queueAutofill(draft);
        backgroundMessages.requestOpenChatBridgePrompt.mockResolvedValueOnce({
            success: true,
            tabId: 1,
            tabStatus: 'created',
            injected: true,
        });
        await services.proposals.openBridgePrompt('Prompt', 'https://chatgpt.com/');
        expect(deps.proposalRepository.queueAutofill).toHaveBeenCalledWith(draft);
        expect(backgroundMessages.requestOpenChatBridgePrompt).toHaveBeenCalledWith(
            'Prompt',
            'https://chatgpt.com/'
        );

        backgroundMessages.requestOpenChatBridgePrompt.mockResolvedValueOnce({
            success: false,
            reason: 'permission-denied',
        });
        await expect(services.proposals.openBridgePrompt('Prompt')).rejects.toThrow(
            'لم تُمنح صلاحية فتح ChatGPT'
        );

        backgroundMessages.requestDownloadZip.mockResolvedValueOnce({ success: true });
        await expect(
            services.downloads.downloadZip('export.zip', [{ name: 'a.txt', content: 'A' }])
        ).resolves.toBeUndefined();

        backgroundMessages.requestDownloadZip.mockResolvedValueOnce({
            success: false,
            error: 'too large',
        });
        await expect(services.downloads.downloadZip('bad.zip', [])).rejects.toThrow('too large');

        backgroundMessages.requestDownloadZip.mockResolvedValueOnce({
            success: false,
        });
        await expect(services.downloads.downloadZip('unknown.zip', [])).rejects.toThrow(
            'Unknown ZIP download error.'
        );
    });

    it('logs content toasts without throwing', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const services = createPlatformContentServices(createDependencies());

        services.toast('Saved');

        expect(info).toHaveBeenCalledWith('[platform-content]', 'Saved');
    });
});
