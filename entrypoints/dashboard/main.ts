import { createBrowserRepositories } from '../../src/infrastructure/storage/browser-repositories'
import { bootstrapDashboard } from '../../src/ui/dashboard/index'

const repositories = createBrowserRepositories()

function mount(): void {
    bootstrapDashboard(document, repositories)
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
} else {
    mount()
}
