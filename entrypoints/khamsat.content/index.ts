import { defineContentScript } from 'wxt/utils/define-content-script';

import './style.css';
import { bootstrapPlatformAutofill } from '../../src/app/content/bootstrapPlatformAutofill';
import { createPlatformContentServices } from '../../src/app/content/createPlatformContentServices';
import { bootstrapPlatformContent } from '../../src/app/content/bootstrapPlatformContent';
import { createBrowserRepositories } from '../../src/shared/browser/browser-repositories';
import { khamsatAdapter } from '../../src/platforms/khamsat';

export default defineContentScript({
    matches: [...khamsatAdapter.matches],
    runAt: 'document_idle',
    main() {
        const repositories = createBrowserRepositories();

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
