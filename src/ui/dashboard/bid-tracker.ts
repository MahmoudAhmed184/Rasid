interface BidPageResponse {
    collection?: Array<{ id?: string | number; rendered?: string } | string>
    count?: number
}

interface BidListItem {
    apiBidId?: string | number | null
    title: string | null
    url: string
    status: string | null
    publishedDatetime: string | null
    price: string | null
}

interface TimelineBid {
    title: string | null
    url: string
    status: string | null
    price: string | null
    published: Date
    ageMs: number
    msLeft: number
}

interface BidTrackerStats {
    total30d: number
    todayCount: number
    nextAvailable: TimelineBid | null
    byStatus: Record<string, number>
    bids: TimelineBid[]
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ITEMS_PER_PAGE = 25

const BID_STATUS_CONFIG = {
    'بانتظار الموافقة': {
        icon: 'fa-clock',
        color: '#f59e0b',
        bg: '#fef3c7',
        label: 'بانتظار الموافقة',
    },
    مكتمل: { icon: 'fa-check-circle', color: '#10b981', bg: '#d1fae5', label: 'مكتملة' },
    مستبعد: { icon: 'fa-times-circle', color: '#ef4444', bg: '#fee2e2', label: 'مستبعدة' },
    مُغلق: { icon: 'fa-ban', color: '#6b7280', bg: '#f3f4f6', label: 'مُغلقة' },
} as const

export function createBidTracker(root: Document) {
    const timelineContainer = root.getElementById('bidsTimelineList')
    const statusGrid = root.getElementById('bidsStatusGrid')
    let isBound = false
    let isLoaded = false
    let countdownTimer: number | null = null

    function resetSummaryCards() {
        ;['bids-total-30d', 'bids-available-slots', 'bids-next-available', 'bids-today-count'].forEach(
            (id) => {
                const element = root.getElementById(id)
                if (element) {
                    element.textContent = '-'
                }
            }
        )
    }

    function showLoadingState() {
        if (!(timelineContainer instanceof HTMLElement)) {
            return
        }

        timelineContainer.innerHTML = `
            <div class="bids-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>جاري تحميل بيانات العروض...</p>
            </div>
        `

        resetSummaryCards()

        if (statusGrid instanceof HTMLElement) {
            statusGrid.innerHTML = ''
        }
    }

    function showErrorState(message: string) {
        if (!(timelineContainer instanceof HTMLElement)) {
            return
        }

        timelineContainer.innerHTML = `
            <div class="bids-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>تعذر تحميل بيانات العروض</p>
                <span>${message}</span>
                <button class="btn-secondary btn-retry-bids" style="margin-top: 16px;" type="button">
                    <i class="fas fa-redo"></i> إعادة المحاولة
                </button>
            </div>
        `
    }

    async function fetchBidTrackerPage(pageNumber: number): Promise<BidPageResponse> {
        const response = await fetch(
            `https://mostaql.com/dashboard/bids?page=${pageNumber}&sort=latest`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'include',
            }
        )

        if (!response.ok) {
            throw new Error(`Bid page ${pageNumber} request failed: ${response.status}`)
        }

        return response.json() as Promise<BidPageResponse>
    }

    function extractBidRow(renderedHtml: string): BidListItem | null {
        if (typeof renderedHtml !== 'string') {
            return null
        }

        const template = document.createElement('template')
        template.innerHTML = renderedHtml.trim()

        const row = template.content.querySelector('tr.bid-row')
        if (!row) {
            return null
        }

        const titleLink = row.querySelector<HTMLAnchorElement>('h2 a')
        const statusEl = row.querySelector('.label-prj-pending, .label')
        const timeEl = row.querySelector('time[datetime]')
        const priceEl = row
            .querySelector('.project__meta li .fa-money')
            ?.closest('li')
            ?.querySelector('span')
        const rawUrl = titleLink?.getAttribute('href') || ''

        return {
            apiBidId: null,
            title: titleLink?.textContent?.trim() || null,
            url: rawUrl.split('-')[0] || rawUrl,
            status: statusEl?.textContent?.trim() || null,
            publishedDatetime: timeEl?.getAttribute('datetime') || null,
            price: priceEl?.textContent?.trim() || null,
        }
    }

    function processBidPage(pageData: BidPageResponse) {
        const bids: BidListItem[] = []

        if (!Array.isArray(pageData.collection)) {
            return bids
        }

        pageData.collection.forEach((bidObject) => {
            const htmlString = typeof bidObject === 'string' ? bidObject : bidObject.rendered || ''
            const item = extractBidRow(htmlString)

            if (item) {
                item.apiBidId =
                    typeof bidObject === 'string' ? null : (bidObject.id ?? null)
                bids.push(item)
            }
        })

        return bids
    }

    async function fetchAllBidPages() {
        const allBids: BidListItem[] = []
        const firstPage = await fetchBidTrackerPage(1)
        allBids.push(...processBidPage(firstPage))

        const totalPages = Math.max(1, Math.ceil(Number(firstPage.count ?? 0) / ITEMS_PER_PAGE))

        for (let page = 2; page <= totalPages; page += 1) {
            try {
                const pageData = await fetchBidTrackerPage(page)
                allBids.push(...processBidPage(pageData))
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error'
                console.warn(`Bid tracker: Page ${page} failed:`, message)
            }
        }

        return allBids
    }

    function parseBidDatetime(value: unknown) {
        if (!value) {
            return null
        }

        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value
        }

        if (typeof value !== 'string') {
            return null
        }

        const source = value.trim()

        if (!source) {
            return null
        }

        const match = source.match(
            /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
        )

        if (match) {
            const parsed = new Date(
                Date.UTC(
                    Number(match[1]),
                    Number(match[2]) - 1,
                    Number(match[3]),
                    Number(match[4] ?? 0),
                    Number(match[5] ?? 0),
                    Number(match[6] ?? 0)
                )
            )

            return Number.isNaN(parsed.getTime()) ? null : parsed
        }

        const fallback = new Date(source)
        return Number.isNaN(fallback.getTime()) ? null : fallback
    }

    function normalizeStatusLabel(rawStatus: string | null) {
        if (!rawStatus) {
            return 'بانتظار الموافقة'
        }

        const status = rawStatus.trim()

        if (status.includes('مكتمل')) {
            return 'مكتمل'
        }

        if (status.includes('مستبعد')) {
            return 'مستبعد'
        }

        if (status.includes('مُغلق') || status.includes('مغلق')) {
            return 'مُغلق'
        }

        if (status.includes('انتظار')) {
            return 'بانتظار الموافقة'
        }

        return status
    }

    function computeStats(allBids: BidListItem[]): BidTrackerStats {
        const now = Date.now()
        const bidsInRange: TimelineBid[] = []
        const bidsToday: BidListItem[] = []
        const byStatus: Record<string, number> = {}

        for (const bid of allBids) {
            const published = parseBidDatetime(bid.publishedDatetime)

            if (!published) {
                continue
            }

            const ageMs = now - published.getTime()

            if (ageMs < 0) {
                continue
            }

            if (ageMs <= THIRTY_DAYS_MS) {
                const msLeft = THIRTY_DAYS_MS - ageMs
                const normalizedStatus = normalizeStatusLabel(bid.status)
                byStatus[normalizedStatus] = (byStatus[normalizedStatus] || 0) + 1

                bidsInRange.push({
                    title: bid.title,
                    url: bid.url,
                    status: bid.status,
                    price: bid.price,
                    published,
                    ageMs,
                    msLeft,
                })
            }

            if (ageMs <= ONE_DAY_MS) {
                bidsToday.push(bid)
            }
        }

        bidsInRange.sort((left, right) => right.ageMs - left.ageMs)

        return {
            total30d: bidsInRange.length,
            todayCount: bidsToday.length,
            nextAvailable: bidsInRange[0] ?? null,
            byStatus,
            bids: bidsInRange,
        }
    }

    async function fetchHomepageStats() {
        const defaults = { available: '-' }

        try {
            const response = await fetch('https://mostaql.com/', {
                credentials: 'include',
                headers: { Accept: 'text/html' },
            })

            if (!response.ok) {
                return defaults
            }

            const html = await response.text()
            const parser = new DOMParser()
            const documentRoot = parser.parseFromString(html, 'text/html')
            const availableLink = documentRoot.querySelector('a[href*="dashboard/bids"] .text-alpha')

            if (availableLink) {
                return {
                    available: Number.parseInt(availableLink.textContent?.trim() || '0', 10) || 0,
                }
            }

            return defaults
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            console.warn('Homepage stats fetch failed:', message)
            return defaults
        }
    }

    function getCountdownColor(percentage: number) {
        if (percentage >= 90) {
            return '#22c55e'
        }
        if (percentage >= 70) {
            return '#84cc16'
        }
        if (percentage >= 50) {
            return '#eab308'
        }
        if (percentage >= 30) {
            return '#f97316'
        }
        return '#ef4444'
    }

    function formatCountdown(msLeft: number) {
        if (msLeft <= 0) {
            return 'متاح الآن!'
        }

        const totalSeconds = Math.floor(msLeft / 1000)
        const days = Math.floor(totalSeconds / 86400)
        const hours = Math.floor((totalSeconds % 86400) / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)

        if (days > 0) {
            return `${days}d ${hours.toString().padStart(2, '0')}h ${minutes
                .toString()
                .padStart(2, '0')}m`
        }

        const seconds = totalSeconds % 60
        return `${hours.toString().padStart(2, '0')}:${minutes
            .toString()
            .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }

    function getStatusCssClass(status: string | null) {
        if (!status) {
            return 'bid-status-pending'
        }
        if (status.includes('مكتمل')) {
            return 'bid-status-completed'
        }
        if (status.includes('مستبعد') || status.includes('مُغلق')) {
            return 'bid-status-rejected'
        }
        if (status.includes('انتظار')) {
            return 'bid-status-pending'
        }
        return 'bid-status-pending'
    }

    function renderSummary(stats: BidTrackerStats, homepageStats: { available: string | number }) {
        const totalEl = root.getElementById('bids-total-30d')
        const availableEl = root.getElementById('bids-available-slots')
        const nextEl = root.getElementById('bids-next-available')
        const todayEl = root.getElementById('bids-today-count')

        if (totalEl) {
            totalEl.textContent = String(stats.total30d)
        }
        if (todayEl) {
            todayEl.textContent = String(stats.todayCount)
        }
        if (availableEl) {
            availableEl.textContent = String(homepageStats.available)
        }

        if (nextEl && stats.nextAvailable) {
            const hoursLeft = Math.floor(stats.nextAvailable.msLeft / (1000 * 60 * 60))
            const daysLeft = Math.floor(hoursLeft / 24)
            const remainingHours = hoursLeft % 24
            nextEl.textContent =
                daysLeft > 0 ? `${daysLeft} يوم ${remainingHours} ساعة` : `${remainingHours} ساعة`
        } else if (nextEl) {
            nextEl.textContent = 'متاح الآن!'
        }
    }

    function renderStatusCards(byStatus: Record<string, number>, total: number) {
        if (!(statusGrid instanceof HTMLElement)) {
            return
        }

        const statusKeys = Object.keys(byStatus)

        if (statusKeys.length === 0) {
            statusGrid.innerHTML =
                '<p class="help-text" style="text-align:center; padding:20px;">لا توجد بيانات حالات.</p>'
            return
        }

        statusGrid.innerHTML = statusKeys
            .map((statusKey) => {
                const count = byStatus[statusKey]
                const percentage = total > 0 ? Math.round((count / total) * 100) : 0
                const config = BID_STATUS_CONFIG[statusKey as keyof typeof BID_STATUS_CONFIG] ?? {
                    icon: 'fa-question-circle',
                    color: '#6b7280',
                    bg: '#f3f4f6',
                    label: statusKey,
                }

                return `
                    <div class="bid-status-card">
                        <div class="bid-status-icon" style="background: ${config.bg}; color: ${config.color};">
                            <i class="fas ${config.icon}"></i>
                        </div>
                        <div class="bid-status-info">
                            <span class="bid-status-count">${count}</span>
                            <span class="bid-status-label">${config.label}</span>
                        </div>
                        <span class="bid-status-pct" style="color: ${config.color};">${percentage}%</span>
                    </div>
                `
            })
            .join('')
    }

    function renderTimeline(bids: TimelineBid[]) {
        if (!(timelineContainer instanceof HTMLElement)) {
            return
        }

        if (bids.length === 0) {
            timelineContainer.innerHTML = `
                <div class="bids-empty">
                    <i class="fas fa-inbox"></i>
                    <p>لا توجد عروض في آخر 30 يومًا</p>
                    <span>جميع العروض متاحة للاستخدام!</span>
                </div>
            `
            return
        }

        timelineContainer.innerHTML = bids
            .map((bid, index) => {
                const percentage = Math.min(100, Math.round((bid.ageMs / THIRTY_DAYS_MS) * 100))
                const color = getCountdownColor(percentage)
                const appliedDate = bid.published.toLocaleDateString('ar-EG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'UTC',
                })
                const appliedTime = bid.published.toLocaleTimeString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'UTC',
                })

                return `
                    <div class="bid-timeline-item" data-index="${index}">
                        <div class="bid-timeline-marker" style="background: ${color};"></div>
                        <div class="bid-timeline-content">
                            <div class="bid-timeline-header">
                                <a href="${bid.url || '#'}" target="_blank" rel="noreferrer" class="bid-timeline-title">
                                    ${bid.title || 'عرض بدون عنوان'}
                                </a>
                                <span class="bid-timeline-status ${getStatusCssClass(bid.status)}">${bid.status || 'بانتظار'}</span>
                            </div>
                            <div class="bid-timeline-meta">
                                <span><i class="fas fa-calendar-alt"></i> ${appliedDate}</span>
                                <span><i class="fas fa-clock"></i> ${appliedTime}</span>
                                ${bid.price ? `<span><i class="fas fa-dollar-sign"></i> ${bid.price}</span>` : ''}
                            </div>
                            <div class="bid-timeline-progress">
                                <div class="bid-progress-bar">
                                    <div
                                        class="bid-progress-fill bid-tracker-bar"
                                        data-ms-left="${bid.msLeft}"
                                        style="width: ${percentage}%; background: ${color};"
                                    ></div>
                                </div>
                                <span
                                    class="bid-countdown bid-tracker-countdown"
                                    data-ms-left="${bid.msLeft}"
                                    style="color: ${color};"
                                >
                                    ${formatCountdown(bid.msLeft)}
                                </span>
                            </div>
                        </div>
                    </div>
                `
            })
            .join('')
    }

    function clearCountdowns() {
        if (countdownTimer !== null) {
            window.clearInterval(countdownTimer)
            countdownTimer = null
        }
    }

    function startCountdowns() {
        clearCountdowns()

        const updateAll = () => {
            root.querySelectorAll<HTMLElement>('.bid-tracker-countdown').forEach((element) => {
                let msLeft = Number.parseInt(element.dataset.msLeft ?? '0', 10)

                if (Number.isNaN(msLeft) || msLeft <= 0) {
                    element.textContent = 'متاح الآن!'
                    element.style.color = '#22c55e'
                    return
                }

                msLeft -= 1000
                element.dataset.msLeft = String(msLeft)
                element.textContent = formatCountdown(msLeft)

                const percentage = Math.min(100, ((THIRTY_DAYS_MS - msLeft) / THIRTY_DAYS_MS) * 100)
                element.style.color = getCountdownColor(percentage)
            })

            root.querySelectorAll<HTMLElement>('.bid-tracker-bar').forEach((element) => {
                let msLeft = Number.parseInt(element.dataset.msLeft ?? '0', 10)

                if (Number.isNaN(msLeft) || msLeft <= 0) {
                    element.style.width = '100%'
                    element.style.background = '#22c55e'
                    return
                }

                msLeft -= 1000
                element.dataset.msLeft = String(msLeft)

                const percentage = Math.min(100, ((THIRTY_DAYS_MS - msLeft) / THIRTY_DAYS_MS) * 100)
                element.style.width = `${percentage}%`
                element.style.background = getCountdownColor(percentage)
            })
        }

        updateAll()
        countdownTimer = window.setInterval(updateAll, 1000)
    }

    async function load() {
        showLoadingState()

        try {
            const [homepageStats, allBids] = await Promise.all([
                fetchHomepageStats(),
                fetchAllBidPages(),
            ])

            const stats = computeStats(allBids)
            renderSummary(stats, homepageStats)
            renderStatusCards(stats.byStatus, stats.total30d)
            renderTimeline(stats.bids)
            startCountdowns()
            isLoaded = true
        } catch (error) {
            const message = error instanceof Error ? error.message : 'حدث خطأ غير متوقع'
            console.error('Bid tracker load failed:', error)
            showErrorState(message)
            isLoaded = false
        }
    }

    async function initOnce() {
        if (isLoaded) {
            return
        }

        await load()
    }

    async function refresh() {
        isLoaded = false
        clearCountdowns()
        await load()
    }

    function bind() {
        if (isBound) {
            return
        }

        isBound = true

        root.getElementById('refreshBidsBtn')?.addEventListener('click', () => {
            void refresh()
        })

        timelineContainer?.addEventListener('click', (event) => {
            const target = event.target as HTMLElement | null

            if (target?.closest('.btn-retry-bids')) {
                void refresh()
            }
        })
    }

    function destroy() {
        clearCountdowns()
    }

    return {
        bind,
        destroy,
        initOnce,
        refresh,
    }
}
