import { defineContentScript } from 'wxt/utils/define-content-script';

import { createChatGptBridgeRepositories } from '../src/app/repositories/browser-repositories';
import { initChatgptBridge } from '../src/app/chatgpt-bridge';

export default defineContentScript({
    matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
    runAt: 'document_idle',
    main() {
        const repositories = createChatGptBridgeRepositories();

        initChatgptBridge({
            proposalRepository: repositories.proposalRepository,
        });
    },
});
