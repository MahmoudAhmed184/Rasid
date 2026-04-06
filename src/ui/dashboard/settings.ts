import { browser } from 'wxt/browser'

import type { AiExecutionMode, ExtensionSettings } from '../../models/extension'

interface SettingsFormOptions {
    onSaved?: () => void | Promise<void>
}

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

export function createSettingsForm(root: Document, options: SettingsFormOptions = {}) {
    let hideStatusTimer: number | null = null
    let isBound = false

    function getField(id: string): FormField | null {
        const field = root.getElementById(id)

        if (
            field instanceof HTMLInputElement ||
            field instanceof HTMLTextAreaElement ||
            field instanceof HTMLSelectElement
        ) {
            return field
        }

        return null
    }

    function getFieldValue(id: string) {
        const field = getField(id)

        if (!field) {
            return null
        }

        if (field instanceof HTMLInputElement && field.type === 'checkbox') {
            return field.checked
        }

        return field.value
    }

    function setFieldValue(id: string, value: string | number | boolean | undefined) {
        const field = getField(id)

        if (!field) {
            return
        }

        if (field instanceof HTMLInputElement && field.type === 'checkbox') {
            field.checked = Boolean(value)
            return
        }

        field.value = value == null ? '' : String(value)
    }

    function parseNumberValue(value: unknown) {
        return Number.parseInt(String(value ?? ''), 10) || 0
    }

    function showSaveStatus() {
        const status = root.getElementById('saveStatus')

        if (!(status instanceof HTMLElement)) {
            return
        }

        status.style.opacity = '1'

        if (hideStatusTimer !== null) {
            window.clearTimeout(hideStatusTimer)
        }

        hideStatusTimer = window.setTimeout(() => {
            status.style.opacity = '0'
            hideStatusTimer = null
        }, 3000)
    }

    function updateAiFieldsVisibility(mode: AiExecutionMode) {
        root.getElementById('aiDirectSettings')?.classList.toggle('hidden', mode !== 'direct')
        root.getElementById('aiBridgeSettings')?.classList.toggle('hidden', mode !== 'bridge')
    }

    function apply(settings: Partial<ExtensionSettings>) {
        setFieldValue('keywordsInclude', settings.keywordsInclude)
        setFieldValue('keywordsExclude', settings.keywordsExclude)
        setFieldValue('minBudget', settings.minBudget)
        setFieldValue('minHiringRate', settings.minHiringRate)
        setFieldValue('maxDuration', settings.maxDuration)
        setFieldValue('cat-development', settings.development !== false)
        setFieldValue('cat-ai', settings.ai !== false)
        setFieldValue('cat-all', settings.all !== false)
        setFieldValue('aiExecutionMode', settings.aiExecutionMode || 'bridge')
        setFieldValue('aiProvider', settings.aiProvider || 'openai')
        setFieldValue('aiModel', settings.aiModel || '')
        setFieldValue('aiApiKey', settings.aiApiKey || '')
        setFieldValue('aiSystemPrompt', settings.aiSystemPrompt || '')
        setFieldValue('aiChatUrl', settings.aiChatUrl || 'https://chatgpt.com/')
        setFieldValue('quietHoursEnabled', settings.quietHoursEnabled === true)
        setFieldValue('quietHoursStart', settings.quietHoursStart)
        setFieldValue('quietHoursEnd', settings.quietHoursEnd)
        setFieldValue('checkInterval', settings.interval || 1)
        setFieldValue('systemToggle', settings.systemEnabled !== false)
        setFieldValue('notificationMode', settings.notificationMode || 'auto')
        setFieldValue('signalrServerUrl', settings.signalrServerUrl || '')
        updateAiFieldsVisibility((settings.aiExecutionMode || 'bridge') as AiExecutionMode)
    }

    function collectSettings(baseSettings: Partial<ExtensionSettings> = {}): ExtensionSettings {
        return {
            ...baseSettings,
            keywordsInclude: String(getFieldValue('keywordsInclude') ?? ''),
            keywordsExclude: String(getFieldValue('keywordsExclude') ?? ''),
            minBudget: parseNumberValue(getFieldValue('minBudget')),
            minHiringRate: parseNumberValue(getFieldValue('minHiringRate')),
            maxDuration: parseNumberValue(getFieldValue('maxDuration')),
            development: getFieldValue('cat-development') !== false,
            ai: getFieldValue('cat-ai') !== false,
            all: getFieldValue('cat-all') !== false,
            aiExecutionMode:
                String(getFieldValue('aiExecutionMode') ?? 'bridge') as ExtensionSettings['aiExecutionMode'],
            aiProvider: String(getFieldValue('aiProvider') ?? 'openai') as ExtensionSettings['aiProvider'],
            aiModel: String(getFieldValue('aiModel') ?? ''),
            aiApiKey: String(getFieldValue('aiApiKey') ?? ''),
            aiSystemPrompt: String(getFieldValue('aiSystemPrompt') ?? ''),
            aiChatUrl: String(getFieldValue('aiChatUrl') ?? 'https://chatgpt.com/'),
            quietHoursEnabled: getFieldValue('quietHoursEnabled') === true,
            quietHoursStart: String(getFieldValue('quietHoursStart') ?? ''),
            quietHoursEnd: String(getFieldValue('quietHoursEnd') ?? ''),
            interval: parseNumberValue(getFieldValue('checkInterval')) || 1,
            systemEnabled: getFieldValue('systemToggle') !== false,
            notificationMode:
                String(getFieldValue('notificationMode') ?? 'auto') as ExtensionSettings['notificationMode'],
            signalrServerUrl: String(getFieldValue('signalrServerUrl') ?? ''),
            sound: baseSettings.sound !== false,
            minClientAge: Number(baseSettings.minClientAge ?? 0),
        }
    }

    async function saveAll() {
        const data = (await browser.storage.local.get(['settings'])) as {
            settings?: Partial<ExtensionSettings>
        }
        const settings = collectSettings(data.settings ?? {})
        const proposalTemplate =
            (getField('proposalTemplate') as HTMLTextAreaElement | null)?.value ?? ''

        await browser.storage.local.set({ settings, proposalTemplate })
        showSaveStatus()

        await browser.runtime.sendMessage({ action: 'updateAlarm', interval: settings.interval })

        if (settings.notificationMode === 'polling') {
            await browser.runtime.sendMessage({ action: 'disconnectSignalR' })
        } else {
            await browser.runtime.sendMessage({ action: 'reconnectSignalR' })
        }

        await options.onSaved?.()
    }

    async function toggleSystemEnabled(checked: boolean) {
        const data = (await browser.storage.local.get(['settings'])) as {
            settings?: Partial<ExtensionSettings>
        }
        const settings = {
            ...data.settings,
            systemEnabled: checked,
        }

        await browser.storage.local.set({ settings })
        showSaveStatus()
        await options.onSaved?.()
    }

    async function exportBackup() {
        const data = await browser.storage.local.get(null)
        const json = JSON.stringify(data, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        const date = new Date().toISOString().split('T')[0]

        link.href = url
        link.download = `frelancia_backup_${date}.json`
        link.click()

        URL.revokeObjectURL(url)
    }

    function importBackup(event: Event) {
        const input = event.currentTarget as HTMLInputElement | null
        const file = input?.files?.[0]

        if (!file) {
            return
        }

        const reader = new FileReader()
        reader.onload = async (loadEvent) => {
            try {
                const data = JSON.parse(String(loadEvent.target?.result ?? '{}'))

                if (!data || typeof data !== 'object') {
                    window.alert('ملف النسخة الاحتياطية غير صالح.')
                    return
                }

                await browser.storage.local.set(data)
                window.alert('تم استيراد الإعدادات بنجاح. سيتم إعادة تحميل الصفحة.')
                window.location.reload()
            } catch (error) {
                console.error('Error parsing backup:', error)
                window.alert('حدث خطأ أثناء استيراد الملف.')
            }
        }

        reader.readAsText(file)
        input.value = ''
    }

    function bind() {
        if (isBound) {
            return
        }

        isBound = true

        root.getElementById('saveAllBtn')?.addEventListener('click', () => {
            void saveAll()
        })

        root.getElementById('testNotificationBtn')?.addEventListener('click', () => {
            void browser.runtime.sendMessage({ action: 'testNotification' }).catch(console.error)
        })

        root.getElementById('testSoundBtn')?.addEventListener('click', () => {
            void browser.runtime.sendMessage({ action: 'testSound' }).catch(console.error)
        })

        root.getElementById('systemToggle')?.addEventListener('change', (event) => {
            const input = event.currentTarget as HTMLInputElement
            void toggleSystemEnabled(input.checked)
        })

        getField('aiExecutionMode')?.addEventListener('change', (event) => {
            const select = event.currentTarget as HTMLSelectElement
            updateAiFieldsVisibility(select.value as AiExecutionMode)
        })

        root.getElementById('exportBackupBtn')?.addEventListener('click', () => {
            void exportBackup()
        })

        root.getElementById('importBackupBtn')?.addEventListener('click', () => {
            ;(getField('importBackupInput') as HTMLInputElement | null)?.click()
        })

        getField('importBackupInput')?.addEventListener('change', importBackup)
    }

    function destroy() {
        if (hideStatusTimer !== null) {
            window.clearTimeout(hideStatusTimer)
            hideStatusTimer = null
        }
    }

    return {
        apply,
        bind,
        destroy,
        showSaveStatus,
    }
}
