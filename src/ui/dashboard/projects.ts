import { browser } from 'wxt/browser'

interface TrackedProjectView {
    id?: string
    title?: string
    url: string
    budget?: string
    duration?: string
    clientName?: string
    publishDate?: string
    communications?: string | number
    status?: string
}

export function createTrackedProjectsPanel(root: Document) {
    const list = root.getElementById('recentProjectsList')
    let isBound = false

    function parseMinBudgetValue(budgetText: string) {
        if (!budgetText || budgetText === 'غير محدد') {
            return 0
        }

        const matches = budgetText.replace(/,/g, '').match(/\d+(\.\d+)?/g)

        if (!matches) {
            return 0
        }

        return Math.min(...matches.map((match) => Number.parseFloat(match)))
    }

    function parseDurationDays(durationText: string) {
        if (!durationText) {
            return 0
        }

        const match = durationText.match(/\d+/)

        if (match) {
            return Number.parseInt(match[0], 10)
        }

        if (durationText.includes('يوم واحد')) {
            return 1
        }

        return 0
    }

    function bind() {
        if (isBound || !(list instanceof HTMLElement)) {
            return
        }

        isBound = true

        list.addEventListener('click', (event) => {
            const target = event.target as HTMLElement | null
            const button = target?.closest<HTMLAnchorElement>('.btn-apply-autofill')

            if (!button) {
                return
            }

            event.preventDefault()

            void (async () => {
                const data = (await browser.storage.local.get(['proposalTemplate'])) as {
                    proposalTemplate?: string
                }

                const autofillData = {
                    projectId: button.dataset.id ?? '',
                    amount: parseMinBudgetValue(button.dataset.budget ?? ''),
                    duration: parseDurationDays(button.dataset.duration ?? ''),
                    proposal: data.proposalTemplate ?? '',
                    timestamp: Date.now(),
                }

                await browser.storage.local.set({ mostaql_pending_autofill: autofillData })

                const url = button.href
                const urlWithFlag = `${url}${url.includes('?') ? '&' : '?'}mostaql_autofill=true`
                await browser.tabs.create({ url: urlWithFlag })
            })()
        })
    }

    function render(jobs: TrackedProjectView[]) {
        if (!(list instanceof HTMLElement)) {
            return
        }

        if (jobs.length === 0) {
            list.innerHTML =
                '<p class="help-text" style="text-align: center; padding: 40px;">لا توجد مشاريع مراقبة. افتح أي مشروع على مستقل واضغط <strong>مراقبة</strong> لإضافته هنا.</p>'
            return
        }

        list.innerHTML = jobs
            .slice(0, 7)
            .map((job) => {
                const budget = job.budget || 'غير محدد'
                const duration = job.duration || ''
                const poster = job.clientName || ''
                const timeAgo = job.publishDate || ''
                const bidsText = job.communications ? `${job.communications} تواصل` : ''
                const status = job.status || 'مفتوح'

                let statusClass = 'mj-status-open'
                if (status.includes('تنفيذ') || status.includes('جارٍ')) {
                    statusClass = 'mj-status-processing'
                }
                if (status.includes('مغلق') || status.includes('مكتمل') || status.includes('ملغى')) {
                    statusClass = 'mj-status-closed'
                }

                return `
                    <div class="mj-project-item">
                        <h5 class="mj-project-title">
                            <a href="${job.url}" target="_blank" rel="noreferrer">${job.title || 'بدون عنوان'}</a>
                            <span class="mj-status-badge ${statusClass}">${status}</span>
                        </h5>
                        <ul class="mj-project-meta">
                            ${poster ? `<li><i class="fas fa-user"></i> ${poster}</li>` : ''}
                            ${timeAgo ? `<li><i class="fas fa-clock"></i> ${timeAgo}</li>` : ''}
                            ${bidsText ? `<li><i class="fas fa-handshake"></i> ${bidsText}</li>` : ''}
                            ${budget !== 'غير محدد' ? `<li><i class="fas fa-dollar-sign"></i> ${budget}</li>` : ''}
                        </ul>
                        <div class="mj-project-actions">
                            <a
                                href="${job.url}"
                                target="_blank"
                                rel="noreferrer"
                                class="btn-view-project btn-apply-autofill"
                                data-id="${job.id ?? ''}"
                                data-budget="${budget}"
                                data-duration="${duration}"
                            >
                                <i class="fas fa-paper-plane"></i> قدّم الآن
                            </a>
                        </div>
                    </div>
                `
            })
            .join('')
    }

    return {
        bind,
        render,
    }
}
