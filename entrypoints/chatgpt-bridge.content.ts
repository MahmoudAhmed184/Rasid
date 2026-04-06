import { defineContentScript } from 'wxt/utils/define-content-script';

import { initChatgptBridge } from '../src/ui/chatgpt-bridge/index.mjs';

export default defineContentScript({
    matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
    runAt: 'document_idle',
    main() {
        initChatgptBridge();
    },
});
