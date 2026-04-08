import { defineContentScript } from 'wxt/utils/define-content-script';

import './style.css';
import { bootstrapPlatformAutofill } from '../../src/application/content/bootstrapPlatformAutofill';
import { createPlatformContentServices } from '../../src/application/content/createPlatformContentServices';
import { bootstrapPlatformContent } from '../../src/application/content/bootstrapPlatformContent';
import { createBrowserRepositories } from '../../src/infrastructure/storage/browser-repositories';
import { getPlatformAdapter } from '../../src/platforms/platform-modules';

const kafiilAdapter = getPlatformAdapter('kafiil');
const repositories = createBrowserRepositories();

export default defineContentScript({
    matches: [...kafiilAdapter.matches],
    runAt: 'document_idle',
    main() {
        bootstrapPlatformContent({
            adapter: kafiilAdapter,
            document,
            services: createPlatformContentServices({
                promptRepository: repositories.promptRepository,
                proposalRepository: repositories.proposalRepository,
                trackingRepository: repositories.trackingRepository,
            }),
        });
        bootstrapPlatformAutofill({
            adapter: kafiilAdapter,
            document,
            proposalRepository: repositories.proposalRepository,
        });
    },
});
