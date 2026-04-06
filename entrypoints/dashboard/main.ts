import { bootstrapDashboard } from '../../src/ui/dashboard/index'

function mount(): void {
    bootstrapDashboard(document)
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
} else {
    mount()
}
