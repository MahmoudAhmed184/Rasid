import { browser } from 'wxt/browser'

import '../shared/icon-shim.css'
import './popup.css'

const POPUP_REFRESH_INTERVAL_MS = 30_000

function getElement<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null
}

function formatLastCheck(lastCheckValue: string | null | undefined): string {
    if (!lastCheckValue) {
        return 'لم يتم الفحص بعد'
    }

    const lastCheck = new Date(lastCheckValue)

    if (Number.isNaN(lastCheck.getTime())) {
        return 'لم يتم الفحص بعد'
    }

    const diffMinutes = Math.floor((Date.now() - lastCheck.getTime()) / 60000)

    if (diffMinutes < 1) {
        return 'آخر فحص: الآن'
    }

    if (diffMinutes < 60) {
        return `آخر فحص: منذ ${diffMinutes} دقيقة`
    }

    if (diffMinutes < 1440) {
        return `آخر فحص: منذ ${Math.floor(diffMinutes / 60)} ساعة`
    }

    return `آخر فحص: ${lastCheck.toLocaleDateString('ar-SA')}`
}

function updateToggleUi(button: HTMLButtonElement, isEnabled: boolean) {
    if (isEnabled) {
        button.className = 'btn secondary'
        button.innerHTML = '<i class="fas fa-bell"></i><span>الإشعارات: مفعلة</span>'
        return
    }

    button.className = 'btn toggle-off'
    button.innerHTML = '<i class="fas fa-bell-slash"></i><span>الإشعارات: متوقفة</span>'
}

async function loadStats() {
    const data = (await browser.storage.local.get(['stats', 'seenJobs'])) as {
        stats?: { todayCount?: number; lastCheck?: string | null }
        seenJobs?: string[]
    }
    const stats = data.stats ?? {}
    const seenJobs = Array.isArray(data.seenJobs) ? data.seenJobs : []

    const lastCheckEl = getElement<HTMLElement>('lastCheck')
    const todayCountEl = getElement<HTMLElement>('todayCount')
    const totalSeenEl = getElement<HTMLElement>('totalSeen')

    if (lastCheckEl) {
        lastCheckEl.textContent = formatLastCheck(stats.lastCheck)
    }

    if (todayCountEl) {
        todayCountEl.textContent = String(stats.todayCount ?? 0)
    }

    if (totalSeenEl) {
        totalSeenEl.textContent = String(seenJobs.length)
    }
}

async function syncNotificationToggle() {
    const button = getElement<HTMLButtonElement>('toggleNotificationsBtn')

    if (!button) {
        return
    }

    const data = (await browser.storage.local.get(['notificationsEnabled'])) as {
        notificationsEnabled?: boolean
    }

    updateToggleUi(button, data.notificationsEnabled !== false)
}

function createPopupController() {
    let refreshTimer: number | null = null

    async function openDashboard() {
        await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') })
    }

    async function handleCheckNow(button: HTMLButtonElement) {
        const originalContent = button.innerHTML
        button.disabled = true
        button.classList.add('is-loading')
        button.innerHTML = '<i class="fas fa-sync-alt"></i><span>جاري الفحص...</span>'

        try {
            await browser.runtime.sendMessage({ action: 'checkNow' })
            await loadStats()
        } finally {
            button.disabled = false
            button.classList.remove('is-loading')
            button.innerHTML = originalContent
        }
    }

    async function handleDiagnostics(button: HTMLButtonElement, report: HTMLElement) {
        const originalContent = button.innerHTML
        button.disabled = true
        button.textContent = 'جاري التشخيص...'
        report.className = 'connection-report hidden'

        try {
            const response = (await browser.runtime.sendMessage({ action: 'debugFetch' })) as
                | { success?: boolean; length?: number; error?: string }
                | undefined

            report.classList.remove('hidden')

            if (response?.success) {
                report.className = 'connection-report success'
                report.textContent = `✓ الاتصال ناجح. تم جلب ${response.length ?? 0} بايت من موقع مستقل.`
            } else {
                report.className = 'connection-report error'
                report.textContent = `✗ فشل الاتصال: ${response?.error ?? 'خطأ غير معروف'}. حاول فتح Mostaql.com أولاً.`
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'خطأ غير معروف'
            report.className = 'connection-report error'
            report.classList.remove('hidden')
            report.textContent = `✗ فشل الاتصال: ${message}. حاول فتح Mostaql.com أولاً.`
        } finally {
            button.disabled = false
            button.innerHTML = originalContent
        }
    }

    async function toggleNotifications(button: HTMLButtonElement) {
        const data = (await browser.storage.local.get(['notificationsEnabled'])) as {
            notificationsEnabled?: boolean
        }
        const newState = data.notificationsEnabled === false

        await browser.storage.local.set({ notificationsEnabled: newState })
        updateToggleUi(button, newState)
    }

    function bindEvents() {
        getElement<HTMLButtonElement>('open-dashboard-btn')?.addEventListener('click', () => {
            void openDashboard()
        })

        getElement<HTMLButtonElement>('checkNowBtn')?.addEventListener('click', (event) => {
            void handleCheckNow(event.currentTarget as HTMLButtonElement)
        })

        const connectionButton = getElement<HTMLButtonElement>('checkConnectionBtn')
        const report = getElement<HTMLElement>('connectionReport')
        if (connectionButton && report) {
            connectionButton.addEventListener('click', (event) => {
                void handleDiagnostics(event.currentTarget as HTMLButtonElement, report)
            })
        }

        getElement<HTMLButtonElement>('toggleNotificationsBtn')?.addEventListener(
            'click',
            (event) => {
                void toggleNotifications(event.currentTarget as HTMLButtonElement)
            }
        )
    }

    async function init() {
        bindEvents()
        await Promise.all([loadStats(), syncNotificationToggle()])

        refreshTimer = window.setInterval(() => {
            void loadStats()
        }, POPUP_REFRESH_INTERVAL_MS)
    }

    function destroy() {
        if (refreshTimer !== null) {
            window.clearInterval(refreshTimer)
            refreshTimer = null
        }
    }

    return {
        init,
        destroy,
    }
}

export function bootstrapPopup(root: Document = document) {
    const controller = createPopupController()
    void controller.init()

    root.defaultView?.addEventListener(
        'unload',
        () => {
            controller.destroy()
        },
        { once: true }
    )
}
