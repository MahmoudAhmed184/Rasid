import { bootstrapPopup } from '../../src/ui/popup/index'

function mount(): void {
    bootstrapPopup(document)
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
} else {
    mount()
}
