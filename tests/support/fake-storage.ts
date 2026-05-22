import type { StorageClient } from '../../src/shared/browser/storage-client';

type FailureMode = 'get' | 'getAll' | 'set' | 'remove';

export class MemoryStorageClient implements StorageClient {
    readonly #state: Record<string, unknown>;
    #failure: { readonly mode: FailureMode; readonly error: Error } | null = null;

    constructor(initial: Record<string, unknown> = {}) {
        this.#state = { ...initial };
    }

    failNext(mode: FailureMode, error = new Error(`storage ${mode} failed`)): void {
        this.#failure = { mode, error };
    }

    snapshot(): Record<string, unknown> {
        return { ...this.#state };
    }

    async get(keys: string | readonly string[]): Promise<Record<string, unknown>> {
        this.#throwIfFailed('get');

        const result: Record<string, unknown> = {};
        const requestedKeys = typeof keys === 'string' ? [keys] : keys;

        for (const key of requestedKeys) {
            result[key] = this.#state[key];
        }

        return result;
    }

    async getAll(): Promise<Record<string, unknown>> {
        this.#throwIfFailed('getAll');
        return this.snapshot();
    }

    async set(items: Record<string, unknown>): Promise<void> {
        this.#throwIfFailed('set');
        Object.assign(this.#state, items);
    }

    async remove(keys: string | readonly string[]): Promise<void> {
        this.#throwIfFailed('remove');

        const requestedKeys = typeof keys === 'string' ? [keys] : keys;

        for (const key of requestedKeys) {
            delete this.#state[key];
        }
    }

    #throwIfFailed(mode: FailureMode): void {
        if (this.#failure?.mode !== mode) {
            return;
        }

        const { error } = this.#failure;
        this.#failure = null;
        throw error;
    }
}

export function createMemoryStorage(initial: Record<string, unknown> = {}): MemoryStorageClient {
    return new MemoryStorageClient(initial);
}
