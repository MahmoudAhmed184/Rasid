import type { StorageClient } from '../storage-client';
import type {
    PlatformAutofillDraft,
    PlatformId,
} from '../../../platforms/contracts';

export const PENDING_BRIDGE_PROMPT_STORAGE_KEY = 'pendingChatGptPrompt';

const PLATFORM_AUTOFILL_KEYS = {
    mostaql: 'mostaql_pending_autofill',
    khamsat: 'khamsat_pending_autofill',
    nafezly: 'nafezly_pending_autofill',
    kafiil: 'kafiil_pending_autofill',
    freelancer: 'freelancer_pending_autofill',
    upwork: 'upwork_pending_autofill',
} as const satisfies Record<PlatformId, string>;

export const PROPOSAL_STATE_KEYS = [
    PENDING_BRIDGE_PROMPT_STORAGE_KEY,
    ...Object.values(PLATFORM_AUTOFILL_KEYS),
] as const;

function resolveAutofillKey(platformId: PlatformId): string {
    return PLATFORM_AUTOFILL_KEYS[platformId];
}

function cloneAutofillDraft(draft: PlatformAutofillDraft): PlatformAutofillDraft {
    return {
        platformId: draft.platformId,
        projectId: draft.projectId,
        proposal: draft.proposal,
        amount: draft.amount,
        durationDays: draft.durationDays,
        createdAt: draft.createdAt,
    };
}

export function normalizePendingBridgePrompt(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

export function normalizeQueuedAutofill(
    value: unknown,
    platformId: PlatformId
): PlatformAutofillDraft | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const candidate = value as Record<string, unknown>;
    const projectId = typeof candidate.projectId === 'string' ? candidate.projectId : '';
    const proposal = typeof candidate.proposal === 'string' ? candidate.proposal : '';
    const amount = Number.isFinite(candidate.amount) ? Number(candidate.amount) : 0;
    const durationDays = Number.isFinite(candidate.durationDays)
        ? Number(candidate.durationDays)
        : Number.isFinite(candidate.duration)
          ? Number(candidate.duration)
          : 0;
    const createdAt = Number.isFinite(candidate.createdAt)
        ? Number(candidate.createdAt)
        : Number.isFinite(candidate.timestamp)
          ? Number(candidate.timestamp)
          : 0;

    if (!projectId) {
        return null;
    }

    return {
        platformId,
        projectId,
        proposal,
        amount,
        durationDays,
        createdAt,
    };
}

export function toStoredQueuedAutofill(draft: PlatformAutofillDraft): Record<string, unknown> {
    return {
        platformId: draft.platformId,
        projectId: draft.projectId,
        proposal: draft.proposal,
        amount: draft.amount,
        durationDays: draft.durationDays,
        duration: draft.durationDays,
        createdAt: draft.createdAt,
        timestamp: draft.createdAt,
    };
}

export interface ProposalStateBackupPatch {
    readonly setItems: Record<string, unknown>;
    readonly removeKeys: readonly string[];
}

export function normalizeProposalStateBackupPatch(
    value: Record<string, unknown>
): ProposalStateBackupPatch {
    const setItems: Record<string, unknown> = {};
    const removeKeys: string[] = [];
    const pendingBridgePrompt = normalizePendingBridgePrompt(
        value[PENDING_BRIDGE_PROMPT_STORAGE_KEY]
    );

    if (pendingBridgePrompt) {
        setItems[PENDING_BRIDGE_PROMPT_STORAGE_KEY] = pendingBridgePrompt;
    } else {
        removeKeys.push(PENDING_BRIDGE_PROMPT_STORAGE_KEY);
    }

    for (const [platformId, storageKey] of Object.entries(PLATFORM_AUTOFILL_KEYS) as Array<
        [PlatformId, string]
    >) {
        const draft = normalizeQueuedAutofill(value[storageKey], platformId);

        if (draft) {
            setItems[storageKey] = toStoredQueuedAutofill(draft);
        } else {
            removeKeys.push(storageKey);
        }
    }

    return {
        setItems,
        removeKeys,
    };
}

export interface ProposalStateStorageModule {
    getPendingBridgePrompt(): Promise<string | null>;
    setPendingBridgePrompt(prompt: string): Promise<void>;
    clearPendingBridgePrompt(): Promise<void>;
    getQueuedAutofill(platformId: PlatformId): Promise<PlatformAutofillDraft | null>;
    queueAutofill(draft: PlatformAutofillDraft): Promise<void>;
    clearQueuedAutofill(platformId: PlatformId): Promise<void>;
}

export function createProposalStateStorage(client: StorageClient): ProposalStateStorageModule {
    return {
        async getPendingBridgePrompt() {
            const response = await client.get(PENDING_BRIDGE_PROMPT_STORAGE_KEY);
            return normalizePendingBridgePrompt(response[PENDING_BRIDGE_PROMPT_STORAGE_KEY]);
        },
        async setPendingBridgePrompt(prompt) {
            const nextPrompt = normalizePendingBridgePrompt(prompt);

            if (!nextPrompt) {
                await client.remove(PENDING_BRIDGE_PROMPT_STORAGE_KEY);
                return;
            }

            await client.set({
                [PENDING_BRIDGE_PROMPT_STORAGE_KEY]: nextPrompt,
            });
        },
        async clearPendingBridgePrompt() {
            await client.remove(PENDING_BRIDGE_PROMPT_STORAGE_KEY);
        },
        async getQueuedAutofill(platformId) {
            const storageKey = resolveAutofillKey(platformId);
            const response = await client.get(storageKey);
            const draft = normalizeQueuedAutofill(response[storageKey], platformId);
            return draft ? cloneAutofillDraft(draft) : null;
        },
        async queueAutofill(draft) {
            const normalizedDraft = normalizeQueuedAutofill(
                toStoredQueuedAutofill(draft),
                draft.platformId
            );

            if (!normalizedDraft) {
                throw new Error('Invalid autofill draft.');
            }

            await client.set({
                [resolveAutofillKey(draft.platformId)]: toStoredQueuedAutofill(normalizedDraft),
            });
        },
        async clearQueuedAutofill(platformId) {
            await client.remove(resolveAutofillKey(platformId));
        },
    };
}
