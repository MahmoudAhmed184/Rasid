import type { StorageClient } from '../../browser/storage-client';
import type { PlatformAutofillDraft, PlatformId } from '../../../entities/platform/model';
import { getAiChatTargetHost } from '../../../entities/ai/chat-url';

export const PENDING_BRIDGE_PROMPT_STORAGE_KEY = 'pendingChatGptPrompt';
const PENDING_BRIDGE_PROMPT_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_BRIDGE_PROMPT_LENGTH = 20_000;

const PLATFORM_AUTOFILL_KEYS = {
    mostaql: 'mostaql_pending_autofill',
    khamsat: 'khamsat_pending_autofill',
    nafezly: 'nafezly_pending_autofill',
} as const satisfies Partial<Record<PlatformId, string>>;

type PlatformAutofillStoragePlatformId = keyof typeof PLATFORM_AUTOFILL_KEYS;

export const PROPOSAL_STATE_KEYS = [...Object.values(PLATFORM_AUTOFILL_KEYS)] as const;

export interface PendingBridgePrompt {
    readonly id: string;
    readonly prompt: string;
    readonly createdAt: number;
    readonly expiresAt: number;
    readonly targetHost: string;
}

function resolveAutofillKey(platformId: PlatformId): string {
    const storageKey = PLATFORM_AUTOFILL_KEYS[platformId];

    if (!storageKey) {
        throw new Error(`Proposal autofill is not supported for platform: ${platformId}`);
    }

    return storageKey;
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

function createBridgePromptId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeBridgePromptText(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const prompt = value.trim();

    if (!prompt) {
        return null;
    }

    return prompt.slice(0, MAX_PENDING_BRIDGE_PROMPT_LENGTH);
}

export function normalizePendingBridgePromptRecord(
    value: unknown,
    now: number = Date.now()
): PendingBridgePrompt | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const candidate = value as Record<string, unknown>;
    const prompt = normalizeBridgePromptText(candidate.prompt);
    const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : '';
    const createdAt = Number(candidate.createdAt);
    const expiresAt = Number(candidate.expiresAt);
    const targetHost =
        typeof candidate.targetHost === 'string' && candidate.targetHost.trim()
            ? candidate.targetHost.trim().toLowerCase()
            : getAiChatTargetHost('');

    if (!prompt || !id || !Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) {
        return null;
    }

    if (expiresAt <= now) {
        return null;
    }

    return {
        id,
        prompt,
        createdAt,
        expiresAt,
        targetHost,
    };
}

export function createPendingBridgePromptRecord(
    prompt: string,
    options: {
        readonly chatUrl?: string;
        readonly now?: number;
    } = {}
): PendingBridgePrompt | null {
    const text = normalizeBridgePromptText(prompt);

    if (!text) {
        return null;
    }

    const now = options.now ?? Date.now();

    return {
        id: createBridgePromptId(),
        prompt: text,
        createdAt: now,
        expiresAt: now + PENDING_BRIDGE_PROMPT_TTL_MS,
        targetHost: getAiChatTargetHost(options.chatUrl ?? ''),
    };
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
    const removeKeys: string[] = [PENDING_BRIDGE_PROMPT_STORAGE_KEY];

    for (const [platformId, storageKey] of Object.entries(PLATFORM_AUTOFILL_KEYS) as Array<
        [PlatformAutofillStoragePlatformId, string]
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
    getPendingBridgePrompt(): Promise<PendingBridgePrompt | null>;
    setPendingBridgePrompt(prompt: string, chatUrl?: string): Promise<void>;
    clearPendingBridgePrompt(id?: string): Promise<void>;
    getQueuedAutofill(platformId: PlatformId): Promise<PlatformAutofillDraft | null>;
    queueAutofill(draft: PlatformAutofillDraft): Promise<void>;
    clearQueuedAutofill(platformId: PlatformId): Promise<void>;
}

export function createProposalStateStorage(client: StorageClient): ProposalStateStorageModule {
    return {
        async getPendingBridgePrompt() {
            const response = await client.get(PENDING_BRIDGE_PROMPT_STORAGE_KEY);
            const record = normalizePendingBridgePromptRecord(
                response[PENDING_BRIDGE_PROMPT_STORAGE_KEY]
            );

            if (!record && response[PENDING_BRIDGE_PROMPT_STORAGE_KEY] !== undefined) {
                await client.remove(PENDING_BRIDGE_PROMPT_STORAGE_KEY);
            }

            return record;
        },
        async setPendingBridgePrompt(prompt, chatUrl) {
            const nextPrompt = createPendingBridgePromptRecord(prompt, { chatUrl });

            if (!nextPrompt) {
                await client.remove(PENDING_BRIDGE_PROMPT_STORAGE_KEY);
                return;
            }

            await client.set({
                [PENDING_BRIDGE_PROMPT_STORAGE_KEY]: nextPrompt,
            });
        },
        async clearPendingBridgePrompt(id) {
            if (!id) {
                await client.remove(PENDING_BRIDGE_PROMPT_STORAGE_KEY);
                return;
            }

            const response = await client.get(PENDING_BRIDGE_PROMPT_STORAGE_KEY);
            const record = normalizePendingBridgePromptRecord(
                response[PENDING_BRIDGE_PROMPT_STORAGE_KEY]
            );

            if (!record || record.id === id) {
                await client.remove(PENDING_BRIDGE_PROMPT_STORAGE_KEY);
            }
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
