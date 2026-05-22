import { describe, expect, it, vi } from 'vitest';

import { createSettingsForm } from '../../../../src/app/dashboard/settings';
import { DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';
import type { ExtensionSettings } from '../../../../src/entities/settings/model';
import { installTestDom } from '../../../support/html';

const backgroundMessages = vi.hoisted(() => ({
    requestDisconnectSignalR: vi.fn(async () => ({ success: true })),
    requestReconnectSignalR: vi.fn(async () => ({ success: true })),
    requestTestNotification: vi.fn(async () => ({ success: true })),
    requestTestSound: vi.fn(async () => ({ success: true })),
    requestUpdateAlarm: vi.fn(async () => ({ success: true })),
}));

vi.mock('../../../../src/app/background/background-messages', () => backgroundMessages);

type ValidatableField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function installFormControlShims(): void {
    const validity = new WeakMap<ValidatableField, string>();
    const selectValues = new WeakMap<HTMLSelectElement, string>();

    for (const prototype of [
        HTMLInputElement.prototype,
        HTMLTextAreaElement.prototype,
        HTMLSelectElement.prototype,
    ]) {
        Object.defineProperty(prototype, 'setCustomValidity', {
            configurable: true,
            value(this: ValidatableField, message: string) {
                validity.set(this, message);
            },
        });
        Object.defineProperty(prototype, 'checkValidity', {
            configurable: true,
            value(this: ValidatableField) {
                return !validity.get(this);
            },
        });
        Object.defineProperty(prototype, 'reportValidity', {
            configurable: true,
            value: vi.fn(() => true),
        });
    }

    Object.defineProperty(HTMLSelectElement.prototype, 'value', {
        configurable: true,
        get() {
            return selectValues.get(this as HTMLSelectElement) ?? '';
        },
        set(value: string) {
            selectValues.set(this as HTMLSelectElement, value);
        },
    });
}

function installSettingsDom(): Document {
    const document = installTestDom(`
        <div id="saveStatus"></div>
        <div id="aiDirectSettings"></div>
        <div id="aiBridgeSettings"></div>
        <input id="platform-mostaql" class="form-control" type="checkbox" />
        <input id="platform-khamsat" class="form-control" type="checkbox" />
        <input id="platform-nafezly" class="form-control" type="checkbox" />
        <input id="keywordsInclude" class="form-control" />
        <input id="keywordsExclude" class="form-control" />
        <input id="minBudget" class="form-control" />
        <input id="minHiringRate" class="form-control" />
        <input id="maxDuration" class="form-control" />
        <input id="cat-development" class="form-control" type="checkbox" />
        <input id="cat-ai" class="form-control" type="checkbox" />
        <input id="cat-all" class="form-control" type="checkbox" />
        <select id="aiExecutionMode" class="form-control"></select>
        <select id="aiProvider" class="form-control"></select>
        <input id="aiModel" class="form-control" />
        <input id="aiApiKey" class="form-control" />
        <textarea id="aiSystemPrompt" class="form-control"></textarea>
        <input id="aiChatUrl" class="form-control" />
        <input id="quietHoursEnabled" class="form-control" type="checkbox" />
        <input id="quietHoursStart" class="form-control" />
        <input id="quietHoursEnd" class="form-control" />
        <input id="checkInterval" class="form-control" />
        <input id="systemToggle" class="form-control" type="checkbox" />
        <select id="notificationMode" class="form-control"></select>
        <input id="signalrServerUrl" class="form-control" />
        <textarea id="proposalTemplate" class="form-control"></textarea>
        <button id="saveAllBtn" type="button"></button>
        <button id="testNotificationBtn" type="button"></button>
        <button id="testSoundBtn" type="button"></button>
        <button id="exportBackupBtn" type="button"></button>
        <button id="importBackupBtn" type="button"></button>
        <input id="importBackupInput" type="file" />
    `);

    installFormControlShims();
    Object.defineProperty(window, 'setTimeout', {
        configurable: true,
        value: setTimeout,
    });
    Object.defineProperty(window, 'clearTimeout', {
        configurable: true,
        value: clearTimeout,
    });
    Object.defineProperty(window, 'confirm', {
        configurable: true,
        value: vi.fn(() => true),
    });
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: { reload: vi.fn() },
    });
    Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: vi.fn(() => 'blob:backup'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: vi.fn(),
    });
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
        configurable: true,
        value: vi.fn(),
    });

    return document;
}

function createRepositories(settings: ExtensionSettings = DEFAULT_SETTINGS) {
    let currentSettings = { ...settings };

    return {
        backupRepository: {
            exportAll: vi.fn(async () => ({
                schemaVersion: 1,
                settings: currentSettings,
            })),
            importAll: vi.fn(async (_snapshot: unknown) => undefined),
        },
        proposalRepository: {
            setQuickTemplate: vi.fn(async (template: string) => template),
        },
        settingsRepository: {
            get: vi.fn(async () => currentSettings),
            save: vi.fn(async (next: ExtensionSettings) => {
                currentSettings = { ...next };
                return currentSettings;
            }),
            update: vi.fn(async (patch: Partial<ExtensionSettings>) => {
                currentSettings = { ...currentSettings, ...patch };
                return currentSettings;
            }),
        },
    };
}

function setFieldValue(document: Document, id: string, value: string): void {
    const field = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
    field.value = value;
}

class FakeBackupFileReader {
    static failNextRead = false;
    static nextResult = '{}';

    onerror: FileReader['onerror'] = null;
    onload: FileReader['onload'] = null;

    readAsText = vi.fn((_file: Blob) => {
        void Promise.resolve().then(() => {
            if (FakeBackupFileReader.failNextRead) {
                this.onerror?.call({} as FileReader, {} as ProgressEvent<FileReader>);
                return;
            }

            this.onload?.call(
                {} as FileReader,
                {
                    target: { result: FakeBackupFileReader.nextResult },
                } as unknown as ProgressEvent<FileReader>
            );
        });
    });
}

function installBackupReader(result: string, failNextRead = false): void {
    FakeBackupFileReader.nextResult = result;
    FakeBackupFileReader.failNextRead = failNextRead;

    Object.defineProperty(globalThis, 'FileReader', {
        configurable: true,
        value: FakeBackupFileReader,
    });
}

function chooseBackupFile(document: Document, file: File): void {
    const input = document.getElementById('importBackupInput') as HTMLInputElement;

    Object.defineProperty(input, 'files', {
        configurable: true,
        value: [file],
    });
    input.dispatchEvent(new Event('change'));
}

describe('dashboard settings form', () => {
    it('applies settings, validates bridge/direct AI fields, and saves background runtime changes', async () => {
        const document = installSettingsDom();
        const repositories = createRepositories({
            ...DEFAULT_SETTINGS,
            monitoredPlatforms: {
                mostaql: true,
                khamsat: false,
                nafezly: true,
            },
            aiExecutionMode: 'bridge',
            aiChatUrl: 'https://chatgpt.com/',
            interval: 5,
        });
        const onSaved = vi.fn(async () => undefined);
        const form = createSettingsForm(document, { repositories, onSaved });

        form.apply(await repositories.settingsRepository.get());
        expect((document.getElementById('platform-khamsat') as HTMLInputElement).checked).toBe(
            false
        );
        expect((document.getElementById('aiModel') as HTMLInputElement).disabled).toBe(true);
        expect((document.getElementById('aiChatUrl') as HTMLInputElement).required).toBe(true);

        form.bind();
        setFieldValue(document, 'aiChatUrl', 'https://evil.example/');
        document.getElementById('saveAllBtn')?.click();

        await vi.waitFor(() =>
            expect(document.getElementById('saveStatus')?.textContent).toBe(
                'راجع الحقل المحدد قبل حفظ الإعدادات.'
            )
        );
        expect(repositories.settingsRepository.save).not.toHaveBeenCalled();

        setFieldValue(document, 'aiChatUrl', 'https://chat.openai.com/');
        setFieldValue(document, 'proposalTemplate', 'Default proposal');
        setFieldValue(document, 'checkInterval', '9');
        (document.getElementById('notificationMode') as HTMLSelectElement).value = 'polling';
        document.getElementById('saveAllBtn')?.click();

        await vi.waitFor(() =>
            expect(repositories.settingsRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    interval: 9,
                    notificationMode: 'polling',
                    aiChatUrl: 'https://chat.openai.com/',
                })
            )
        );
        expect(repositories.proposalRepository.setQuickTemplate).toHaveBeenCalledWith(
            'Default proposal'
        );
        expect(backgroundMessages.requestUpdateAlarm).toHaveBeenCalledWith(9);
        expect(backgroundMessages.requestDisconnectSignalR).toHaveBeenCalledOnce();
        expect(onSaved).toHaveBeenCalledOnce();
        expect(document.getElementById('saveStatus')?.textContent).toBe('تم حفظ التغييرات بنجاح');

        (document.getElementById('aiExecutionMode') as HTMLSelectElement).value = 'direct';
        document.getElementById('aiExecutionMode')?.dispatchEvent(new Event('change'));
        expect((document.getElementById('aiModel') as HTMLInputElement).disabled).toBe(false);
        expect((document.getElementById('aiApiKey') as HTMLInputElement).required).toBe(true);
    });

    it('handles monitoring toggles and notification/sound test buttons', async () => {
        const document = installSettingsDom();
        const repositories = createRepositories();
        const form = createSettingsForm(document, { repositories });

        form.apply(DEFAULT_SETTINGS);
        form.bind();

        const systemToggle = document.getElementById('systemToggle') as HTMLInputElement;
        systemToggle.checked = false;
        systemToggle.dispatchEvent(new Event('change'));
        await vi.waitFor(() =>
            expect(repositories.settingsRepository.update).toHaveBeenCalledWith({
                systemEnabled: false,
            })
        );
        await vi.waitFor(() =>
            expect(document.getElementById('saveStatus')?.textContent).toBe('تم إيقاف المراقبة.')
        );

        document.getElementById('testNotificationBtn')?.click();
        await vi.waitFor(() =>
            expect(backgroundMessages.requestTestNotification).toHaveBeenCalledOnce()
        );
        expect(document.getElementById('saveStatus')?.textContent).toBe(
            'تم إرسال الإشعار التجريبي.'
        );

        backgroundMessages.requestTestSound.mockRejectedValueOnce(new Error('audio failed'));
        document.getElementById('testSoundBtn')?.click();
        await vi.waitFor(() =>
            expect(document.getElementById('saveStatus')?.textContent).toBe(
                'تعذر تشغيل صوت الإشعار التجريبي.'
            )
        );
    });

    it('shows successful sound-test feedback and restores the busy button state', async () => {
        const document = installSettingsDom();
        const repositories = createRepositories();
        const form = createSettingsForm(document, { repositories });
        const button = document.getElementById('testSoundBtn') as HTMLButtonElement;

        form.bind();
        button.click();

        await vi.waitFor(() =>
            expect(document.getElementById('saveStatus')?.textContent).toBe(
                'تم تشغيل صوت الإشعار التجريبي.'
            )
        );
        expect(backgroundMessages.requestTestSound).toHaveBeenCalledOnce();
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-busy')).toBe('false');
    });

    it('does not bind duplicate listeners and reports notification test failures', async () => {
        const document = installSettingsDom();
        const repositories = createRepositories();
        const form = createSettingsForm(document, { repositories });
        const button = document.getElementById('testNotificationBtn') as HTMLButtonElement;

        backgroundMessages.requestTestNotification.mockRejectedValueOnce(new Error('blocked'));

        form.bind();
        form.bind();
        button.click();

        await vi.waitFor(() =>
            expect(document.getElementById('saveStatus')?.textContent).toBe(
                'تعذر إرسال الإشعار التجريبي.'
            )
        );
        expect(backgroundMessages.requestTestNotification).toHaveBeenCalledOnce();
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-busy')).toBe('false');
    });

    it('requires direct AI credentials and reconnects realtime for non-polling notification modes', async () => {
        const document = installSettingsDom();
        const repositories = createRepositories({
            ...DEFAULT_SETTINGS,
            aiExecutionMode: 'direct',
            aiModel: '',
            aiApiKey: '',
            notificationMode: 'auto',
        });
        const form = createSettingsForm(document, { repositories });

        form.apply(await repositories.settingsRepository.get());
        form.bind();

        document.getElementById('saveAllBtn')?.click();

        await vi.waitFor(() =>
            expect(document.getElementById('saveStatus')?.textContent).toBe(
                'راجع الحقل المحدد قبل حفظ الإعدادات.'
            )
        );
        expect(repositories.settingsRepository.save).not.toHaveBeenCalled();
        expect(
            (document.getElementById('aiModel') as HTMLInputElement).getAttribute('aria-invalid')
        ).toBe('true');

        setFieldValue(document, 'aiModel', 'gpt-test');
        setFieldValue(document, 'aiApiKey', 'sk-test');
        setFieldValue(document, 'proposalTemplate', 'Direct template');
        (document.getElementById('notificationMode') as HTMLSelectElement).value = 'auto';
        document.getElementById('saveAllBtn')?.click();

        await vi.waitFor(() =>
            expect(repositories.settingsRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    aiExecutionMode: 'direct',
                    aiModel: 'gpt-test',
                    aiApiKey: 'sk-test',
                    notificationMode: 'auto',
                })
            )
        );
        expect(backgroundMessages.requestReconnectSignalR).toHaveBeenCalledOnce();
        expect(backgroundMessages.requestDisconnectSignalR).not.toHaveBeenCalled();
    });

    it('reverts the monitoring toggle when storage update fails', async () => {
        const document = installSettingsDom();
        const repositories = createRepositories({
            ...DEFAULT_SETTINGS,
            systemEnabled: true,
        });
        repositories.settingsRepository.update.mockRejectedValueOnce(new Error('quota'));
        const form = createSettingsForm(document, { repositories });

        form.apply(await repositories.settingsRepository.get());
        form.bind();

        const systemToggle = document.getElementById('systemToggle') as HTMLInputElement;
        systemToggle.checked = false;
        systemToggle.dispatchEvent(new Event('change'));

        await vi.waitFor(() =>
            expect(document.getElementById('saveStatus')?.textContent).toBe(
                'تعذر تغيير حالة المراقبة. حاول مرة أخرى.'
            )
        );
        expect(systemToggle.checked).toBe(true);
        expect(systemToggle.disabled).toBe(false);
        expect(systemToggle.getAttribute('aria-busy')).toBe('false');
    });

    it('exports backups and rejects unsupported import files before reading', async () => {
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        const document = installSettingsDom();
        const repositories = createRepositories();
        const form = createSettingsForm(document, { repositories });

        form.bind();
        document.getElementById('exportBackupBtn')?.click();
        await vi.waitFor(() =>
            expect(repositories.backupRepository.exportAll).toHaveBeenCalledOnce()
        );
        expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:backup');
        expect(document.getElementById('saveStatus')?.textContent).toBe(
            'تم تجهيز ملف النسخة الاحتياطية.'
        );

        const input = document.getElementById('importBackupInput') as HTMLInputElement;
        Object.defineProperty(input, 'files', {
            configurable: true,
            value: [new File(['bad'], 'backup.txt', { type: 'text/plain' })],
        });
        input.dispatchEvent(new Event('change'));

        expect(document.getElementById('saveStatus')?.textContent).toBe(
            'اختر ملف JSON لا يتجاوز 5 ميجابايت لاستيراد النسخة الاحتياطية.'
        );
        expect(repositories.backupRepository.importAll).not.toHaveBeenCalled();
    });

    it('imports valid backup JSON after showing a sensitive-data warning and reloads the page', async () => {
        const document = installSettingsDom();
        const repositories = createRepositories();
        const form = createSettingsForm(document, { repositories });
        const snapshot = {
            schemaVersion: 1,
            settings: {
                ...DEFAULT_SETTINGS,
                aiApiKey: 'legacy-secret',
            },
            prompts: [{ id: 'proposal-default', title: 'Default' }],
            trackedProjects: { 'mostaql:123': { title: 'Project' } },
            recentJobs: [{ id: 'mostaql:123' }],
            seenJobs: ['mostaql:123'],
            proposalTemplate: 'Hello',
            pendingChatGptPrompt: { prompt: 'temporary prompt' },
        };
        const setTimeoutMock = vi.fn((handler: TimerHandler, timeout?: number) => {
            if (typeof handler === 'function') {
                handler();
            }

            return 1;
        });

        Object.defineProperty(window, 'setTimeout', {
            configurable: true,
            value: setTimeoutMock,
        });
        installBackupReader(JSON.stringify(snapshot));

        form.bind();
        chooseBackupFile(
            document,
            new File(['ignored by fake reader'], 'rasid-backup.json', {
                type: 'application/json',
            })
        );

        await vi.waitFor(() => expect(repositories.backupRepository.importAll).toHaveBeenCalled());

        expect(window.confirm).toHaveBeenCalledWith(
            expect.stringContaining('سيتم تجاهل مفاتيح API ومطالبات ChatGPT المؤقتة')
        );
        expect(repositories.backupRepository.importAll).toHaveBeenCalledWith(snapshot);
        expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 900);
        expect(window.location.reload).toHaveBeenCalledOnce();
        expect(document.getElementById('saveStatus')?.textContent).toBe(
            'تم استيراد النسخة الاحتياطية بنجاح. سيتم إعادة تحميل الصفحة.'
        );
    });

    it('cancels backup import without mutating storage when the confirmation is declined', async () => {
        const document = installSettingsDom();
        const repositories = createRepositories();
        const form = createSettingsForm(document, { repositories });

        vi.mocked(window.confirm).mockReturnValue(false);
        installBackupReader(
            JSON.stringify({
                schemaVersion: '1',
                settings: DEFAULT_SETTINGS,
                prompts: [],
            })
        );

        form.bind();
        chooseBackupFile(document, new File(['{}'], 'backup.json', { type: 'application/json' }));

        await vi.waitFor(() =>
            expect(document.getElementById('saveStatus')?.textContent).toBe(
                'تم إلغاء استيراد النسخة الاحتياطية.'
            )
        );
        expect(repositories.backupRepository.importAll).not.toHaveBeenCalled();
        expect(window.location.reload).not.toHaveBeenCalled();
        expect(window.confirm).toHaveBeenCalledWith(
            expect.stringContaining('لا يحتوي الملخص على مفاتيح API أو مطالبات ChatGPT المؤقتة')
        );
    });

    it.each([
        {
            name: 'unsupported schema version',
            payload: { schemaVersion: 2, settings: DEFAULT_SETTINGS },
            message: 'إصدار ملف النسخة الاحتياطية غير مدعوم.',
        },
        {
            name: 'unrecognized object payload',
            payload: { schemaVersion: 1, unexpected: true },
            message: 'ملف النسخة الاحتياطية غير صالح.',
        },
        {
            name: 'array payload',
            payload: [],
            message: 'ملف النسخة الاحتياطية غير صالح.',
        },
    ])('rejects backup imports with $name', async ({ payload, message }) => {
        const document = installSettingsDom();
        const repositories = createRepositories();
        const form = createSettingsForm(document, { repositories });

        installBackupReader(JSON.stringify(payload));

        form.bind();
        chooseBackupFile(document, new File(['{}'], 'backup.json', { type: 'application/json' }));

        await vi.waitFor(() =>
            expect(document.getElementById('saveStatus')?.textContent).toBe(message)
        );
        expect(repositories.backupRepository.importAll).not.toHaveBeenCalled();
        expect(window.confirm).not.toHaveBeenCalled();
    });

    it('handles invalid JSON and FileReader failures during backup import', async () => {
        const invalidJsonDocument = installSettingsDom();
        const invalidJsonRepositories = createRepositories();
        const invalidJsonForm = createSettingsForm(invalidJsonDocument, {
            repositories: invalidJsonRepositories,
        });

        installBackupReader('{not-json');

        invalidJsonForm.bind();
        chooseBackupFile(
            invalidJsonDocument,
            new File(['{}'], 'backup.json', { type: 'application/json' })
        );

        await vi.waitFor(() =>
            expect(invalidJsonDocument.getElementById('saveStatus')?.textContent).toBe(
                'حدث خطأ أثناء استيراد الملف.'
            )
        );
        expect(invalidJsonRepositories.backupRepository.importAll).not.toHaveBeenCalled();

        const readErrorDocument = installSettingsDom();
        const readErrorRepositories = createRepositories();
        const readErrorForm = createSettingsForm(readErrorDocument, {
            repositories: readErrorRepositories,
        });

        installBackupReader('{}', true);

        readErrorForm.bind();
        chooseBackupFile(
            readErrorDocument,
            new File(['{}'], 'backup.json', { type: 'application/json' })
        );

        await vi.waitFor(() =>
            expect(readErrorDocument.getElementById('saveStatus')?.textContent).toBe(
                'تعذر قراءة ملف النسخة الاحتياطية.'
            )
        );
        expect(readErrorRepositories.backupRepository.importAll).not.toHaveBeenCalled();
    });

    it('opens the hidden import input from the visible import button and clears pending status timers on destroy', () => {
        const document = installSettingsDom();
        const repositories = createRepositories();
        const setTimeoutMock = vi.fn(() => 123);
        const clearTimeoutMock = vi.fn();
        const inputClick = vi.fn();
        const form = createSettingsForm(document, { repositories });

        Object.defineProperty(window, 'setTimeout', {
            configurable: true,
            value: setTimeoutMock,
        });
        Object.defineProperty(window, 'clearTimeout', {
            configurable: true,
            value: clearTimeoutMock,
        });
        Object.defineProperty(document.getElementById('importBackupInput'), 'click', {
            configurable: true,
            value: inputClick,
        });

        form.bind();
        document.getElementById('importBackupBtn')?.click();
        form.showSaveStatus('Temporary');
        form.destroy();

        expect(inputClick).toHaveBeenCalledOnce();
        expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 3500);
        expect(clearTimeoutMock).toHaveBeenCalledWith(123);
    });
});
