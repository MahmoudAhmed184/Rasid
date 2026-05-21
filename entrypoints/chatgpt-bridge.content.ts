import { defineContentScript } from 'wxt/utils/define-content-script';

import { createBrowserRepositories } from '../src/shared/browser/browser-repositories';
import { initChatgptBridge } from '../src/app/chatgpt-bridge';

export default defineContentScript({
    matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
    runAt: 'document_idle',
    main() {
        const repositories = createBrowserRepositories();

        initChatgptBridge({
            proposalRepository: repositories.proposalRepository,
        });
    },
});
