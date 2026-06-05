import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';

import { initChatgptBridge } from '../src/app/chatgpt-bridge';
import { createChatGptBridgeRepositories } from '../src/app/repositories/browser-repositories';

export default defineUnlistedScript({
    main() {
        const repositories = createChatGptBridgeRepositories();

        initChatgptBridge({
            proposalRepository: repositories.proposalRepository,
        });
    },
});
