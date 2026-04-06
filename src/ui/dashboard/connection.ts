import { browser } from 'wxt/browser'

type NotificationMode = 'auto' | 'signalr' | 'polling'

export function createConnectionStatusPanel(root: Document) {
    async function load() {
        const data = (await browser.storage.local.get([
            'signalRConnected',
            'signalRFallbackActive',
            'settings',
            'runtime',
        ])) as {
            signalRConnected?: boolean
            signalRFallbackActive?: boolean
            settings?: { notificationMode?: NotificationMode }
            runtime?: { signalr?: { status?: string; isFallbackActive?: boolean } }
        }

        const statusEl = root.getElementById('stat-connection')
        const iconEl = root.getElementById('connection-status-icon')

        if (!(statusEl instanceof HTMLElement) || !(iconEl instanceof HTMLElement)) {
            return
        }

        const mode = data.settings?.notificationMode ?? 'auto'
        const runtimeSignalr = data.runtime?.signalr
        const isConnected =
            data.signalRConnected === true || runtimeSignalr?.status === 'connected'
        const isFallbackActive =
            data.signalRFallbackActive === true || runtimeSignalr?.isFallbackActive === true

        if (mode === 'polling') {
            statusEl.textContent = 'استعلام دوري'
            iconEl.className = 'stat-icon blue'
            iconEl.innerHTML = '<i class="fas fa-sync-alt"></i>'
            return
        }

        if (isConnected) {
            statusEl.textContent = 'اتصال مباشر'
            iconEl.className = 'stat-icon green'
            iconEl.innerHTML = '<i class="fas fa-wifi"></i>'
            return
        }

        if (isFallbackActive) {
            statusEl.textContent = 'وضع الاستعلام'
            iconEl.className = 'stat-icon orange'
            iconEl.innerHTML = '<i class="fas fa-sync-alt"></i>'
            return
        }

        statusEl.textContent = 'غير متصل'
        iconEl.className = 'stat-icon purple'
        iconEl.innerHTML = '<i class="fas fa-plug"></i>'
    }

    return {
        load,
    }
}
