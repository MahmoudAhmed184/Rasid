import { browser } from 'wxt/browser';

import type { ExtensionStorage } from '../extension-storage';
import {
    createProposalStateStorage,
    PENDING_BRIDGE_PROMPT_STORAGE_KEY,
} from '../modules/proposal-state-storage';
import type { StorageClient } from '../storage-client';
import type {
    PlatformAutofillDraft,
    PlatformId,
} from '../../../platforms/contracts';

export interface ProposalRepository {
    getQuickTemplate(): Promise<string>;
    setQuickTemplate(template: string): Promise<string>;
    getPendingBridgePrompt(): Promise<string | null>;
    setPendingBridgePrompt(prompt: string): Promise<void>;
    clearPendingBridgePrompt(): Promise<void>;
    onPendingBridgePromptChanged(listener: (prompt: string) => void): () => void;
    getQueuedAutofill(platformId: PlatformId): Promise<PlatformAutofillDraft | null>;
    queueAutofill(draft: PlatformAutofillDraft): Promise<void>;
    clearQueuedAutofill(platformId: PlatformId): Promise<void>;
}

function normalizeBridgePrompt(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
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
        setPendingBridgePrompt(prompt) {
            return proposalStateStorage.setPendingBridgePrompt(prompt);
        },
        clearPendingBridgePrompt() {
            return proposalStateStorage.clearPendingBridgePrompt();
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

                const prompt = normalizeBridgePrompt(nextValue);

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
