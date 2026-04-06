import { browser } from 'wxt/browser'

import './dashboard.css'
import './dashboard-bids.css'
import '../shared/icon-shim.css'

import { createBidTracker } from './bid-tracker'
import { createConnectionStatusPanel } from './connection'
import { createContributorsPanel } from './contributors'
import { createPromptManager } from './prompts'
import { createTrackedProjectsPanel } from './projects'
import { createSettingsForm } from './settings'
import { createTabController } from './tabs'
import type { PromptTemplate } from '../../models/extension'

interface DashboardStats {
    todayCount?: number
    lastCheck?: string | null
}

interface TrackedProjectRecord {
    id?: string
    title?: string
    url?: string
    budget?: string
    duration?: string
    clientName?: string
    publishDate?: string
    communications?: string | number
    status?: string
    lastChecked?: string
}

function getElement<T extends HTMLElement>(id: string) {
    return document.getElementById(id) as T | null
}

function updateOverviewStats(stats: DashboardStats, trackedCount: number) {
    const todayEl = getElement<HTMLElement>('stat-today')
    const totalEl = getElement<HTMLElement>('stat-total')
    const lastTimeEl = getElement<HTMLElement>('stat-last-time')

    if (todayEl) {
        const todayCount = Number.parseInt(String(stats.todayCount ?? 0), 10)
        todayEl.textContent = String(Number.isNaN(todayCount) ? 0 : todayCount)
    }

    if (totalEl) {
        totalEl.textContent = String(trackedCount)
    }

    if (lastTimeEl) {
        lastTimeEl.textContent = stats.lastCheck
            ? new Date(stats.lastCheck).toLocaleTimeString('ar-EG')
            : '-'
    }
}

function createDashboardApp(root: Document) {
    const connectionPanel = createConnectionStatusPanel(root)
    const trackedProjectsPanel = createTrackedProjectsPanel(root)
    const settingsForm = createSettingsForm(root, {
        onSaved: () => {
            void connectionPanel.load()
        },
    })
    const promptManager = createPromptManager(root, {
        onSaved: settingsForm.showSaveStatus,
    })
    const contributorsPanel = createContributorsPanel(root)
    const bidTracker = createBidTracker(root)
    const tabs = createTabController(root, {
        onTabActivated: (tabId) => {
            if (tabId === 'contributors') {
                void contributorsPanel.loadOnce()
            }

            if (tabId === 'bids-tracker') {
                void bidTracker.initOnce()
            }
        },
    })

    async function loadData() {
        const data = (await browser.storage.local.get([
            'settings',
            'stats',
            'prompts',
            'proposalTemplate',
            'trackedProjects',
        ])) as {
            settings?: Record<string, unknown>
            stats?: DashboardStats
            prompts?: PromptTemplate[]
            proposalTemplate?: string
            trackedProjects?: Record<string, TrackedProjectRecord>
        }

        const trackedProjects = Object.values(data.trackedProjects ?? {})
            .filter((project): project is TrackedProjectRecord & { url: string } => Boolean(project.url))
            .sort((left, right) =>
                String(right.lastChecked ?? '').localeCompare(String(left.lastChecked ?? ''))
            )

        updateOverviewStats(data.stats ?? {}, trackedProjects.length)
        trackedProjectsPanel.render(trackedProjects)
        settingsForm.apply((data.settings ?? {}) as Record<string, never>)

        const proposalTemplateEl = getElement<HTMLTextAreaElement>('proposalTemplate')
        if (proposalTemplateEl) {
            proposalTemplateEl.value = data.proposalTemplate ?? ''
        }

        promptManager.render(Array.isArray(data.prompts) ? data.prompts : [])
    }

    async function init() {
        trackedProjectsPanel.bind()
        settingsForm.bind()
        promptManager.bind()
        contributorsPanel.bind()
        bidTracker.bind()
        tabs.bind()

        await Promise.all([loadData(), connectionPanel.load()])
    }

    function destroy() {
        bidTracker.destroy()
        settingsForm.destroy()
    }

    return {
        init,
        destroy,
    }
}

export function bootstrapDashboard(root: Document = document) {
    const app = createDashboardApp(root)
    void app.init()

    root.defaultView?.addEventListener(
        'beforeunload',
        () => {
            app.destroy()
        },
        { once: true }
    )
}
