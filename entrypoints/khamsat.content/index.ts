import { defineContentScript } from 'wxt/utils/define-content-script';

import './style.css';
import { bootstrapPlatformAutofill } from '../../src/application/content/bootstrapPlatformAutofill';
import { createPlatformContentServices } from '../../src/application/content/createPlatformContentServices';
import { bootstrapPlatformContent } from '../../src/application/content/bootstrapPlatformContent';
import { createBrowserRepositories } from '../../src/infrastructure/storage/browser-repositories';
import { getPlatformAdapter } from '../../src/platforms/platform-modules';

const khamsatAdapter = getPlatformAdapter('khamsat');
const repositories = createBrowserRepositories();

export default defineContentScript({
    matches: [...khamsatAdapter.matches],
    runAt: 'document_idle',
    main() {
        bootstrapPlatformContent({
            adapter: khamsatAdapter,
            document,
            services: createPlatformContentServices({
                promptRepository: repositories.promptRepository,
                proposalRepository: repositories.proposalRepository,
                trackingRepository: repositories.trackingRepository,
            }),
        });
        bootstrapPlatformAutofill({
            adapter: khamsatAdapter,
            document,
            proposalRepository: repositories.proposalRepository,
        });
    },
});
