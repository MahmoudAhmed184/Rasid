interface TabControllerOptions {
    onTabActivated?: (tabId: string) => void
}

export function createTabController(root: Document, options: TabControllerOptions = {}) {
    let isBound = false

    function activateTab(tabId: string) {
        root.querySelectorAll<HTMLElement>('.tab-container').forEach((container) => {
            container.classList.toggle('hidden', container.id !== `${tabId}-tab`)
        })

        root.querySelectorAll<HTMLElement>('.sidebar-nav .nav-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.tab === tabId)
        })
    }

    function bind() {
        if (isBound) {
            return
        }

        isBound = true

        root.querySelectorAll<HTMLButtonElement>('.sidebar-nav .nav-item').forEach((item) => {
            item.addEventListener('click', () => {
                const { tab } = item.dataset

                if (!tab) {
                    return
                }

                activateTab(tab)
                options.onTabActivated?.(tab)
            })
        })
    }

    return {
        bind,
        activateTab,
    }
}
