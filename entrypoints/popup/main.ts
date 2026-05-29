import { createBrowserRepositories } from '../../src/app/repositories/browser-repositories';
import { bootstrapPopup } from '../../src/app/popup';

function mount(): void {
    const repositories = createBrowserRepositories();

    bootstrapPopup(document, {
        monitoringRepository: repositories.monitoringRepository,
        adminMessages: {
            getAdminMessages: () => repositories.extensionStorage.getAdminMessages(),
            markAdminMessagesRead: () => repositories.extensionStorage.markAdminMessagesRead(),
        },
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
    mount();
}
