import { createBrowserRepositories } from '../../src/infrastructure/storage/browser-repositories'
import { bootstrapPopup } from '../../src/ui/popup/index'

const repositories = createBrowserRepositories()

function mount(): void {
    bootstrapPopup(document, {
        monitoringRepository: repositories.monitoringRepository,
    })
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
} else {
    mount()
}
