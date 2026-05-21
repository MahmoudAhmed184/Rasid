import { defineContentScript } from 'wxt/utils/define-content-script';

import './style.css';
import { bootstrapPlatformAutofill } from '../../src/app/content/bootstrapPlatformAutofill';
import { createPlatformContentServices } from '../../src/app/content/createPlatformContentServices';
import { bootstrapPlatformContent } from '../../src/app/content/bootstrapPlatformContent';
import { createBrowserRepositories } from '../../src/shared/browser/browser-repositories';
import { kafiilAdapter } from '../../src/platforms/kafiil';

export default defineContentScript({
    matches: [...kafiilAdapter.matches],
    runAt: 'document_idle',
    main() {
        const repositories = createBrowserRepositories();

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
