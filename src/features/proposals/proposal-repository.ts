import { browser } from 'wxt/browser';

import type { ExtensionStorage } from '../../shared/storage/extension-storage';
import {
    createProposalStateStorage,
    normalizePendingBridgePromptRecord,
    PENDING_BRIDGE_PROMPT_STORAGE_KEY,
    type PendingBridgePrompt,
} from '../../shared/storage/modules/proposal-state-storage';
import type { StorageClient } from '../../shared/browser/storage-client';
import type { PlatformAutofillDraft, PlatformId } from '../../platforms/contracts';

export interface ProposalRepository {
    getQuickTemplate(): Promise<string>;
    setQuickTemplate(template: string): Promise<string>;
    getPendingBridgePrompt(): Promise<PendingBridgePrompt | null>;
    setPendingBridgePrompt(prompt: string, chatUrl?: string): Promise<void>;
    clearPendingBridgePrompt(id?: string): Promise<void>;
    onPendingBridgePromptChanged(listener: (prompt: PendingBridgePrompt) => void): () => void;
    getQueuedAutofill(platformId: PlatformId): Promise<PlatformAutofillDraft | null>;
    queueAutofill(draft: PlatformAutofillDraft): Promise<void>;
    clearQueuedAutofill(platformId: PlatformId): Promise<void>;
}

export function createProposalRepository(
    storage: ExtensionStorage,
    client: StorageClient
): ProposalRepository {
    const proposalStateStorage = createProposalStateStorage(client);

    return {
        getQuickTemplate() {
            return storage.getProposalTemplate();
        },
        setQuickTemplate(template) {
            return storage.setProposalTemplate(template);
        },
        getPendingBridgePrompt() {
            return proposalStateStorage.getPendingBridgePrompt();
        },
        setPendingBridgePrompt(prompt, chatUrl) {
            return proposalStateStorage.setPendingBridgePrompt(prompt, chatUrl);
        },
        clearPendingBridgePrompt(id) {
            return proposalStateStorage.clearPendingBridgePrompt(id);
        },
        onPendingBridgePromptChanged(listener) {
            const handleChange: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
                changes,
                namespace
            ) => {
                const nextValue = changes[PENDING_BRIDGE_PROMPT_STORAGE_KEY]?.newValue;

                if (namespace !== 'local') {
                    return;
                }

                const prompt = normalizePendingBridgePromptRecord(nextValue);

                if (prompt) {
                    listener(prompt);
                }
            };

            browser.storage.onChanged.addListener(handleChange);

            return () => {
                browser.storage.onChanged.removeListener(handleChange);
            };
        },
        getQueuedAutofill(platformId) {
            return proposalStateStorage.getQueuedAutofill(platformId);
        },
        queueAutofill(draft) {
            return proposalStateStorage.queueAutofill(draft);
        },
        clearQueuedAutofill(platformId) {
            return proposalStateStorage.clearQueuedAutofill(platformId);
        },
    };
}
