import { defineContentScript } from 'wxt/utils/define-content-script';

import { createBrowserRepositories } from '../src/infrastructure/storage/browser-repositories';
import { initChatgptBridge } from '../src/ui/chatgpt-bridge/index';

const repositories = createBrowserRepositories();

export default defineContentScript({
    matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
    runAt: 'document_idle',
    main() {
        initChatgptBridge({
            proposalRepository: repositories.proposalRepository,
        });
    },
});
