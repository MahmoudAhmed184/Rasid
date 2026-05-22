import {
    requestDisconnectSignalR,
    requestReconnectSignalR,
    requestTestNotification,
    requestTestSound,
    requestUpdateAlarm,
} from '../background/background-messages';
import {
    DEFAULT_MONITORED_PLATFORMS,
    MAX_POLLING_INTERVAL,
    MIN_POLLING_INTERVAL,
    SUPPORTED_MONITORING_PLATFORM_IDS,
    type AiExecutionMode,
    type ExtensionSettings,
    type SupportedMonitoringPlatformId,
} from '../../entities/settings/model';
import { isAllowedAiChatHost } from '../../entities/ai/chat-url';
import type { BackupRepository } from '../../features/backup/repository';
import type { ProposalRepository } from '../../features/proposals/proposal-repository';
import type { SettingsRepository } from '../../features/settings/repository';

interface SettingsFormDependencies {
    readonly backupRepository: Pick<BackupRepository, 'exportAll' | 'importAll'>;
    readonly proposalRepository: Pick<ProposalRepository, 'setQuickTemplate'>;
    readonly settingsRepository: Pick<SettingsRepository, 'get' | 'save' | 'update'>;
}

interface SettingsFormOptions {
    readonly repositories: SettingsFormDependencies;
    readonly onSaved?: () => void | Promise<void>;
}

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const PLATFORM_FIELD_IDS = {
    mostaql: 'platform-mostaql',
    khamsat: 'platform-khamsat',
    nafezly: 'platform-nafezly',
} as const satisfies Record<SupportedMonitoringPlatformId, string>;

type StatusTone = 'success' | 'error' | 'info';

const SUPPORTED_BACKUP_SCHEMA_VERSION = 1;
const MAX_BACKUP_IMPORT_BYTES = 5 * 1024 * 1024;
const BACKUP_RECOGNIZED_KEYS = [
    'settings',
    'seenJobs',
    'recentJobs',
    'stats',
    'trackedProjects',
    'prompts',
    'proposalTemplate',
    'notificationsEnabled',
    'runtime',
    'mostaql_pending_autofill',
    'khamsat_pending_autofill',
    'nafezly_pending_autofill',
] as const;
const LEGACY_SENSITIVE_BACKUP_KEYS = ['aiApiKeySecret', 'pendingChatGptPrompt'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function countArrayItems(value: unknown): number {
    return Array.isArray(value) ? value.length : 0;
}

function countObjectItems(value: unknown): number {
    return isRecord(value) ? Object.keys(value).length : 0;
}

export function createSettingsForm(root: Document, options: SettingsFormOptions) {
    const { backupRepository, proposalRepository, settingsRepository } = options.repositories;
    let hideStatusTimer: number | null = null;
    let isBound = false;

    function getField(id: string): FormField | null {
        const field = root.getElementById(id);

        if (
            field instanceof HTMLInputElement ||
            field instanceof HTMLTextAreaElement ||
            field instanceof HTMLSelectElement
        ) {
            return field;
        }

        return null;
    }

    function getButton(id: string): HTMLButtonElement | null {
        const button = root.getElementById(id);
        return button instanceof HTMLButtonElement ? button : null;
    }

    function getFieldValue(id: string) {
        const field = getField(id);

        if (!field) {
            return null;
        }

        if (field instanceof HTMLInputElement && field.type === 'checkbox') {
            return field.checked;
        }

        return field.value;
    }

    function setFieldValue(id: string, value: string | number | boolean | undefined) {
        const field = getField(id);

        if (!field) {
            return;
        }

        if (field instanceof HTMLInputElement && field.type === 'checkbox') {
            field.checked = Boolean(value);
            return;
        }

        field.value = value == null ? '' : String(value);
    }

    function parseNumberValue(value: unknown) {
        return Number.parseInt(String(value ?? ''), 10) || 0;
    }

    function showSaveStatus(
        message = 'تم حفظ التغييرات بنجاح',
        tone: StatusTone = 'success',
        autoHide = true
    ) {
        const status = root.getElementById('saveStatus');

        if (!(status instanceof HTMLElement)) {
            return;
        }

        status.textContent = message;
        status.dataset.tone = tone;
        status.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
        status.classList.add('is-visible');

        if (hideStatusTimer !== null) {
            window.clearTimeout(hideStatusTimer);
            hideStatusTimer = null;
        }

        if (autoHide) {
            hideStatusTimer = window.setTimeout(() => {
                status.classList.remove('is-visible');
                hideStatusTimer = null;
            }, 3500);
        }
    }

    function setButtonBusy(button: HTMLButtonElement | null, busy: boolean) {
        if (!button) {
            return;
        }

        button.disabled = busy;
        button.setAttribute('aria-busy', String(busy));
    }

    function updateAiFieldsVisibility(mode: AiExecutionMode) {
        const directMode = mode === 'direct';
        const bridgeMode = mode === 'bridge';

        root.getElementById('aiDirectSettings')?.classList.toggle('hidden', !directMode);
        root.getElementById('aiBridgeSettings')?.classList.toggle('hidden', !bridgeMode);

        for (const fieldId of ['aiProvider', 'aiModel', 'aiApiKey', 'aiSystemPrompt']) {
            const field = getField(fieldId);

            if (field) {
                field.disabled = !directMode;
            }
        }

        const aiModelField = getField('aiModel');
        const aiApiKeyField = getField('aiApiKey');
        const aiChatUrlField = getField('aiChatUrl');

        if (aiModelField instanceof HTMLInputElement) {
            aiModelField.required = directMode;
        }

        if (aiApiKeyField instanceof HTMLInputElement) {
            aiApiKeyField.required = directMode;
        }

        if (aiChatUrlField instanceof HTMLInputElement) {
            aiChatUrlField.disabled = !bridgeMode;
            aiChatUrlField.required = bridgeMode;
        }
    }

    function clearFieldValidity(field: FormField | null) {
        if (!field) {
            return;
        }

        field.setCustomValidity('');
        field.removeAttribute('aria-invalid');
    }

    function validateAiChatUrl(field: HTMLInputElement) {
        const value = field.value.trim();

        if (!value) {
            field.setCustomValidity('يرجى إدخال رابط ChatGPT المفضل.');
            return;
        }

        try {
            const url = new URL(value);

            if (url.protocol !== 'https:' || !isAllowedAiChatHost(url.hostname)) {
                field.setCustomValidity(
                    'استخدم رابطاً يبدأ بـ https:// من chatgpt.com أو chat.openai.com.'
                );
                return;
            }

            field.setCustomValidity('');
        } catch {
            field.setCustomValidity(
                'استخدم رابطاً يبدأ بـ https:// من chatgpt.com أو chat.openai.com.'
            );
        }
    }

    function validateDirectAiFields() {
        const aiModelField = getField('aiModel');
        const aiApiKeyField = getField('aiApiKey');

        if (aiModelField instanceof HTMLInputElement && !aiModelField.value.trim()) {
            aiModelField.setCustomValidity('يرجى إدخال اسم النموذج عند استخدام Direct عبر API.');
        }

        if (aiApiKeyField instanceof HTMLInputElement && !aiApiKeyField.value.trim()) {
            aiApiKeyField.setCustomValidity('يرجى إدخال مفتاح API عند استخدام Direct عبر API.');
        }
    }

    function validateSettingsForm() {
        const mode = String(getFieldValue('aiExecutionMode') ?? 'bridge') as AiExecutionMode;

        updateAiFieldsVisibility(mode);

        root.querySelectorAll<FormField>('.form-control').forEach(clearFieldValidity);

        const intervalField = getField('checkInterval');
        if (intervalField instanceof HTMLInputElement) {
            intervalField.min = String(MIN_POLLING_INTERVAL);
            intervalField.max = String(MAX_POLLING_INTERVAL);
        }

        if (mode === 'bridge') {
            const aiChatUrlField = getField('aiChatUrl');

            if (aiChatUrlField instanceof HTMLInputElement) {
                validateAiChatUrl(aiChatUrlField);
            }
        } else {
            validateDirectAiFields();
        }

        const fields = Array.from(root.querySelectorAll<FormField>('.form-control'));

        for (const field of fields) {
            if (field.disabled) {
                continue;
            }

            if (!field.checkValidity()) {
                field.setAttribute('aria-invalid', 'true');
                field.reportValidity();
                showSaveStatus('راجع الحقل المحدد قبل حفظ الإعدادات.', 'error', false);
                return false;
            }

            field.removeAttribute('aria-invalid');
        }

        return true;
    }

    function apply(settings: Partial<ExtensionSettings>) {
        for (const [platformId, fieldId] of Object.entries(PLATFORM_FIELD_IDS) as Array<
            [SupportedMonitoringPlatformId, string]
        >) {
            setFieldValue(
                fieldId,
                settings.monitoredPlatforms?.[platformId] ?? DEFAULT_MONITORED_PLATFORMS[platformId]
            );
        }
        setFieldValue('keywordsInclude', settings.keywordsInclude);
        setFieldValue('keywordsExclude', settings.keywordsExclude);
        setFieldValue('minBudget', settings.minBudget);
        setFieldValue('minHiringRate', settings.minHiringRate);
        setFieldValue('maxDuration', settings.maxDuration);
        setFieldValue('cat-development', settings.development !== false);
        setFieldValue('cat-ai', settings.ai !== false);
        setFieldValue('cat-all', settings.all !== false);
        setFieldValue('aiExecutionMode', settings.aiExecutionMode || 'bridge');
        setFieldValue('aiProvider', settings.aiProvider || 'openai');
        setFieldValue('aiModel', settings.aiModel || '');
        setFieldValue('aiApiKey', settings.aiApiKey || '');
        setFieldValue('aiSystemPrompt', settings.aiSystemPrompt || '');
        setFieldValue('aiChatUrl', settings.aiChatUrl || 'https://chatgpt.com/');
        setFieldValue('quietHoursEnabled', settings.quietHoursEnabled === true);
        setFieldValue('quietHoursStart', settings.quietHoursStart);
        setFieldValue('quietHoursEnd', settings.quietHoursEnd);
        setFieldValue('checkInterval', settings.interval || 1);
        setFieldValue('systemToggle', settings.systemEnabled !== false);
        setFieldValue('notificationMode', settings.notificationMode || 'auto');
        setFieldValue('signalrServerUrl', settings.signalrServerUrl || '');
        updateAiFieldsVisibility((settings.aiExecutionMode || 'bridge') as AiExecutionMode);
    }

    function collectSettings(baseSettings: Partial<ExtensionSettings> = {}): ExtensionSettings {
        const monitoredPlatforms = {
            ...DEFAULT_MONITORED_PLATFORMS,
            ...(baseSettings.monitoredPlatforms ?? {}),
        };

        for (const platformId of SUPPORTED_MONITORING_PLATFORM_IDS) {
            const fieldId = PLATFORM_FIELD_IDS[platformId];
            monitoredPlatforms[platformId] = getFieldValue(fieldId) === true;
        }

        return {
            ...baseSettings,
            monitoredPlatforms,
            keywordsInclude: String(getFieldValue('keywordsInclude') ?? ''),
            keywordsExclude: String(getFieldValue('keywordsExclude') ?? ''),
            minBudget: parseNumberValue(getFieldValue('minBudget')),
            minHiringRate: parseNumberValue(getFieldValue('minHiringRate')),
            maxDuration: parseNumberValue(getFieldValue('maxDuration')),
            development: getFieldValue('cat-development') !== false,
            ai: getFieldValue('cat-ai') !== false,
            all: getFieldValue('cat-all') !== false,
            aiExecutionMode: String(
                getFieldValue('aiExecutionMode') ?? 'bridge'
            ) as ExtensionSettings['aiExecutionMode'],
            aiProvider: String(
                getFieldValue('aiProvider') ?? 'openai'
            ) as ExtensionSettings['aiProvider'],
            aiModel: String(getFieldValue('aiModel') ?? ''),
            aiApiKey: String(getFieldValue('aiApiKey') ?? ''),
            aiSystemPrompt: String(getFieldValue('aiSystemPrompt') ?? ''),
            aiChatUrl: String(getFieldValue('aiChatUrl') ?? 'https://chatgpt.com/'),
            quietHoursEnabled: getFieldValue('quietHoursEnabled') === true,
            quietHoursStart: String(getFieldValue('quietHoursStart') ?? ''),
            quietHoursEnd: String(getFieldValue('quietHoursEnd') ?? ''),
            interval: parseNumberValue(getFieldValue('checkInterval')) || 1,
            systemEnabled: getFieldValue('systemToggle') !== false,
            notificationMode: String(
                getFieldValue('notificationMode') ?? 'auto'
            ) as ExtensionSettings['notificationMode'],
            signalrServerUrl: '',
            sound: baseSettings.sound !== false,
            minClientAge: Number(baseSettings.minClientAge ?? 0),
        };
    }

    async function saveAll(button?: HTMLButtonElement) {
        if (!validateSettingsForm()) {
            return;
        }

        setButtonBusy(button ?? getButton('saveAllBtn'), true);

        let settingsPersisted = false;

        try {
            const settings = collectSettings(await settingsRepository.get());
            const proposalTemplate =
                (getField('proposalTemplate') as HTMLTextAreaElement | null)?.value ?? '';

            await Promise.all([
                settingsRepository.save(settings),
                proposalRepository.setQuickTemplate(proposalTemplate),
            ]);
            settingsPersisted = true;

            await requestUpdateAlarm(settings.interval);

            if (settings.notificationMode === 'polling') {
                await requestDisconnectSignalR();
            } else {
                await requestReconnectSignalR();
            }

            await options.onSaved?.();
            showSaveStatus();
        } catch (error) {
            console.error('Error saving settings:', error);
            showSaveStatus(
                settingsPersisted
                    ? 'تم حفظ الإعدادات، لكن تعذر تحديث خدمة الخلفية. أعد المحاولة إذا لم تتغير حالة الاتصال.'
                    : 'تعذر حفظ الإعدادات. تحقق من مساحة التخزين وحاول مجدداً.',
                'error',
                false
            );
        } finally {
            setButtonBusy(button ?? getButton('saveAllBtn'), false);
        }
    }

    async function toggleSystemEnabled(input: HTMLInputElement) {
        const checked = input.checked;
        const previous = !checked;

        input.disabled = true;
        input.setAttribute('aria-busy', 'true');

        try {
            await settingsRepository.update({ systemEnabled: checked });
            await options.onSaved?.();
            showSaveStatus(checked ? 'تم تفعيل المراقبة.' : 'تم إيقاف المراقبة.');
        } catch (error) {
            console.error('Error toggling monitoring:', error);
            input.checked = previous;
            showSaveStatus('تعذر تغيير حالة المراقبة. حاول مرة أخرى.', 'error', false);
        } finally {
            input.disabled = false;
            input.setAttribute('aria-busy', 'false');
        }
    }

    async function exportBackup(button?: HTMLButtonElement) {
        setButtonBusy(button ?? getButton('exportBackupBtn'), true);

        try {
            const data = await backupRepository.exportAll();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const date = new Date().toISOString().split('T')[0];

            link.href = url;
            link.download = `rasid_backup_${date}.json`;
            link.click();

            URL.revokeObjectURL(url);
            showSaveStatus('تم تجهيز ملف النسخة الاحتياطية.', 'success');
        } catch (error) {
            console.error('Error exporting backup:', error);
            showSaveStatus('تعذر تصدير النسخة الاحتياطية. حاول مرة أخرى.', 'error', false);
        } finally {
            setButtonBusy(button ?? getButton('exportBackupBtn'), false);
        }
    }

    function createBackupImportSummary(snapshot: unknown): string {
        if (!isRecord(snapshot)) {
            throw new Error('Invalid backup payload.');
        }

        const version = snapshot.schemaVersion;

        if (
            version !== undefined &&
            version !== SUPPORTED_BACKUP_SCHEMA_VERSION &&
            version !== String(SUPPORTED_BACKUP_SCHEMA_VERSION)
        ) {
            throw new Error('Unsupported backup version.');
        }

        if (
            !BACKUP_RECOGNIZED_KEYS.some((key) =>
                Object.prototype.hasOwnProperty.call(snapshot, key)
            )
        ) {
            throw new Error('Invalid backup payload.');
        }

        const settings = isRecord(snapshot.settings) ? snapshot.settings : {};
        const hasLegacyApiKey =
            typeof settings.aiApiKey === 'string' && settings.aiApiKey.trim().length > 0;
        const hasSensitiveKeys =
            hasLegacyApiKey ||
            LEGACY_SENSITIVE_BACKUP_KEYS.some((key) =>
                Object.prototype.hasOwnProperty.call(snapshot, key)
            );

        const summaryLines = [
            'سيتم استبدال بيانات راصد الحالية بالبيانات الموجودة في ملف النسخة الاحتياطية:',
            '',
            `- الإعدادات: ${Object.prototype.hasOwnProperty.call(snapshot, 'settings') ? 'موجودة' : 'غير موجودة'}`,
            `- أوامر AI: ${countArrayItems(snapshot.prompts)}`,
            `- المشاريع المتتبعة: ${countObjectItems(snapshot.trackedProjects)}`,
            `- المشاريع الحديثة: ${countArrayItems(snapshot.recentJobs)}`,
            `- المشاريع المعروفة: ${countArrayItems(snapshot.seenJobs)}`,
            `- نص العرض الافتراضي: ${typeof snapshot.proposalTemplate === 'string' ? 'موجود' : 'غير موجود'}`,
            '',
        ];

        summaryLines.push(
            hasSensitiveKeys
                ? 'تنبيه: يحتوي الملف على حقول حساسة أو قديمة. سيتم تجاهل مفاتيح API ومطالبات ChatGPT المؤقتة، وسيتم مسح مفتاح API الحالي من جلسة الإضافة.'
                : 'لا يحتوي الملخص على مفاتيح API أو مطالبات ChatGPT المؤقتة.'
        );
        summaryLines.push('', 'هل تريد المتابعة؟');

        return summaryLines.join('\n');
    }

    function isSupportedBackupFile(file: File) {
        return file.name.toLowerCase().endsWith('.json') && file.size <= MAX_BACKUP_IMPORT_BYTES;
    }

    function importBackup(event: Event) {
        const input = event.currentTarget as HTMLInputElement | null;
        const file = input?.files?.[0];

        if (!file) {
            return;
        }

        if (!isSupportedBackupFile(file)) {
            showSaveStatus(
                'اختر ملف JSON لا يتجاوز 5 ميجابايت لاستيراد النسخة الاحتياطية.',
                'error',
                false
            );
            input.value = '';
            return;
        }

        showSaveStatus('جاري قراءة ملف النسخة الاحتياطية...', 'info', false);

        const reader = new FileReader();
        reader.onload = async (loadEvent) => {
            try {
                const data = JSON.parse(String(loadEvent.target?.result ?? '{}'));
                const summary = createBackupImportSummary(data);

                if (!window.confirm(summary)) {
                    showSaveStatus('تم إلغاء استيراد النسخة الاحتياطية.', 'info');
                    return;
                }

                showSaveStatus('جاري استيراد النسخة الاحتياطية...', 'info', false);
                await backupRepository.importAll(data);
                showSaveStatus(
                    'تم استيراد النسخة الاحتياطية بنجاح. سيتم إعادة تحميل الصفحة.',
                    'success',
                    false
                );
                window.setTimeout(() => {
                    window.location.reload();
                }, 900);
            } catch (error) {
                console.error('Error parsing backup:', error);
                showSaveStatus(
                    error instanceof Error && error.message === 'Unsupported backup version.'
                        ? 'إصدار ملف النسخة الاحتياطية غير مدعوم.'
                        : error instanceof Error && error.message === 'Invalid backup payload.'
                          ? 'ملف النسخة الاحتياطية غير صالح.'
                          : 'حدث خطأ أثناء استيراد الملف.',
                    'error',
                    false
                );
            }
        };
        reader.onerror = () => {
            showSaveStatus('تعذر قراءة ملف النسخة الاحتياطية.', 'error', false);
        };

        reader.readAsText(file);
        input.value = '';
    }

    function bind() {
        if (isBound) {
            return;
        }

        isBound = true;

        root.getElementById('saveAllBtn')?.addEventListener('click', (event) => {
            void saveAll(event.currentTarget as HTMLButtonElement);
        });

        root.getElementById('testNotificationBtn')?.addEventListener('click', (event) => {
            const button = event.currentTarget as HTMLButtonElement;

            setButtonBusy(button, true);
            showSaveStatus('جاري إرسال إشعار تجريبي...', 'info', false);

            void requestTestNotification()
                .then(() => {
                    showSaveStatus('تم إرسال الإشعار التجريبي.');
                })
                .catch((error) => {
                    console.error('Error testing notification:', error);
                    showSaveStatus('تعذر إرسال الإشعار التجريبي.', 'error', false);
                })
                .finally(() => {
                    setButtonBusy(button, false);
                });
        });

        root.getElementById('testSoundBtn')?.addEventListener('click', (event) => {
            const button = event.currentTarget as HTMLButtonElement;

            setButtonBusy(button, true);
            showSaveStatus('جاري تشغيل صوت تجريبي...', 'info', false);

            void requestTestSound()
                .then(() => {
                    showSaveStatus('تم تشغيل صوت الإشعار التجريبي.');
                })
                .catch((error) => {
                    console.error('Error testing sound:', error);
                    showSaveStatus('تعذر تشغيل صوت الإشعار التجريبي.', 'error', false);
                })
                .finally(() => {
                    setButtonBusy(button, false);
                });
        });

        root.getElementById('systemToggle')?.addEventListener('change', (event) => {
            const input = event.currentTarget as HTMLInputElement;
            void toggleSystemEnabled(input);
        });

        getField('aiExecutionMode')?.addEventListener('change', (event) => {
            const select = event.currentTarget as HTMLSelectElement;
            updateAiFieldsVisibility(select.value as AiExecutionMode);
        });

        root.getElementById('exportBackupBtn')?.addEventListener('click', (event) => {
            void exportBackup(event.currentTarget as HTMLButtonElement);
        });

        root.getElementById('importBackupBtn')?.addEventListener('click', () => {
            (getField('importBackupInput') as HTMLInputElement | null)?.click();
        });

        getField('importBackupInput')?.addEventListener('change', importBackup);
    }

    function destroy() {
        if (hideStatusTimer !== null) {
            window.clearTimeout(hideStatusTimer);
            hideStatusTimer = null;
        }
    }

    return {
        apply,
        bind,
        destroy,
        showSaveStatus,
    };
}
