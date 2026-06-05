import { describe, expect, it } from 'vitest';

import { DEFAULT_PROPOSAL_TEMPLATE, DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';
import { createAiSecretStorage } from '../../../../src/shared/storage/modules/ai-secret-storage';
import {
    createSettingsStorage,
    normalizeSettings,
} from '../../../../src/shared/storage/modules/settings-storage';
import { createMemoryStorage } from '../../../support/fake-storage';

describe('settings storage normalization', () => {
    it('clamps numeric settings and excludes unknown platform input', () => {
        const settings = normalizeSettings({
            interval: 99,
            minBudget: -10,
            minHiringRate: 150,
            maxDuration: -4,
            monitoredPlatforms: {
                mostaql: false,
                khamsat: true,
                nafezly: true,
                unknownPlatform: true,
            },
        });

        expect(settings.interval).toBe(30);
        expect(settings.minBudget).toBe(0);
        expect(settings.minHiringRate).toBe(100);
        expect(settings.maxDuration).toBe(0);
        expect(settings.monitoredPlatforms.mostaql).toBe(false);
        expect(Object.hasOwn(settings.monitoredPlatforms, 'unknownPlatform')).toBe(false);
    });

    it('keeps unsupported platform identifiers out of monitored platform defaults and normalized settings', () => {
        const settings = normalizeSettings({
            monitoredPlatforms: {
                mostaql: true,
                khamsat: true,
                nafezly: true,
                legacyMarketplace: true,
            },
        });

        expect(Object.keys(DEFAULT_SETTINGS.monitoredPlatforms).sort()).toEqual([
            'khamsat',
            'mostaql',
            'nafezly',
        ]);
        expect(Object.hasOwn(settings.monitoredPlatforms, 'legacyMarketplace')).toBe(false);
    });

    it('normalizes AI modes, providers, chat URLs, and quiet-hour time inputs defensively', () => {
        const settings = normalizeSettings({
            aiExecutionMode: 'unknown',
            aiProvider: 'unsupported',
            aiModel: '  gpt-test  ',
            aiSystemPrompt: '   ',
            aiChatUrl: 'http://evil.example/chat#token',
            notificationMode: 'websocket',
            quietHoursStart: '25:00',
            quietHoursEnd: '08:30',
            minClientAge: '7',
            keywordsInclude: 123,
            keywordsExclude: '  rtl keyword  ',
        });

        expect(settings.aiExecutionMode).toBe('bridge');
        expect(settings.aiProvider).toBe('openai');
        expect(settings.aiModel).toBe('gpt-test');
        expect(settings.aiSystemPrompt).toBe(DEFAULT_SETTINGS.aiSystemPrompt);
        expect(settings.aiChatUrl).toBe('https://chatgpt.com/');
        expect(settings.notificationMode).toBe('auto');
        expect(settings.quietHoursStart).toBe(DEFAULT_SETTINGS.quietHoursStart);
        expect(settings.quietHoursEnd).toBe('08:30');
        expect(settings.minClientAge).toBe(7);
        expect(settings.keywordsInclude).toBe(DEFAULT_SETTINGS.keywordsInclude);
        expect(settings.keywordsExclude).toBe('  rtl keyword  ');
    });

    it('migrates legacy persistent API keys into secret storage and strips settings', async () => {
        const storage = createMemoryStorage({
            settings: {
                aiApiKey: '  sk-legacy  ',
                interval: 10,
            },
        });
        const secrets = createAiSecretStorage(storage);
        const settingsStorage = createSettingsStorage(storage, secrets);

        const settings = await settingsStorage.getSettings();

        expect(settings.aiApiKey).toBe('sk-legacy');
        expect(storage.snapshot().settings).toMatchObject({ aiApiKey: '' });
        expect(storage.snapshot().aiApiKeySecret).toBe('sk-legacy');
    });

    it('stores updated API keys only in secret storage and returns the hydrated key', async () => {
        const storage = createMemoryStorage({
            settings: {
                interval: 5,
                aiApiKey: '',
            },
        });
        const secrets = createAiSecretStorage(storage);
        const settingsStorage = createSettingsStorage(storage, secrets);

        const settings = await settingsStorage.updateSettings({
            aiApiKey: '  sk-next  ',
            aiExecutionMode: 'direct',
            aiModel: '  gpt-test  ',
        });

        expect(settings.aiApiKey).toBe('sk-next');
        expect(settings.aiExecutionMode).toBe('bridge');
        expect(settings.aiModel).toBe('gpt-test');
        expect(storage.snapshot().aiApiKeySecret).toBe('sk-next');
        expect(storage.snapshot().settings).toMatchObject({
            aiApiKey: '',
            aiExecutionMode: 'bridge',
            aiModel: 'gpt-test',
        });
    });

    it('persists notification and proposal-template settings through typed accessors', async () => {
        const storage = createMemoryStorage({
            proposalTemplate: 42,
            notificationsEnabled: false,
        });
        const settingsStorage = createSettingsStorage(storage);

        await expect(settingsStorage.getNotificationsEnabled()).resolves.toBe(false);
        await expect(settingsStorage.setNotificationsEnabled(true)).resolves.toBe(true);
        await expect(settingsStorage.getNotificationsEnabled()).resolves.toBe(true);
        await expect(settingsStorage.getProposalTemplate()).resolves.toBe(
            DEFAULT_PROPOSAL_TEMPLATE
        );
        await expect(settingsStorage.setProposalTemplate('  custom template  ')).resolves.toBe(
            '  custom template  '
        );
        expect(storage.snapshot()).toMatchObject({
            notificationsEnabled: true,
            proposalTemplate: '  custom template  ',
        });
    });

    it('propagates storage failures instead of silently losing settings updates', async () => {
        const storage = createMemoryStorage();
        const settingsStorage = createSettingsStorage(storage);
        storage.failNext('set');

        await expect(settingsStorage.updateSettings({ interval: 5 })).rejects.toThrow(
            'storage set failed'
        );
    });
});
