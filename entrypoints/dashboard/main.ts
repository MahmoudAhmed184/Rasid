import { createBrowserRepositories } from '../../src/shared/browser/browser-repositories';
import { bootstrapDashboard } from '../../src/app/dashboard';

function mount(): void {
    const repositories = createBrowserRepositories();

    bootstrapDashboard(document, repositories);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
    mount();
}
