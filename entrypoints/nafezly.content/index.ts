import { defineContentScript } from 'wxt/utils/define-content-script';

import './style.css';
import { bootstrapPlatformAutofill } from '../../src/app/content/bootstrapPlatformAutofill';
import { createPlatformContentServices } from '../../src/app/content/createPlatformContentServices';
import { bootstrapPlatformContent } from '../../src/app/content/bootstrapPlatformContent';
import { createPlatformContentRepositories } from '../../src/app/repositories/browser-repositories';
import { nafezlyAdapter } from '../../src/platforms/nafezly';

export default defineContentScript({
    matches: [...nafezlyAdapter.matches],
    runAt: 'document_idle',
    main() {
        const repositories = createPlatformContentRepositories();

        bootstrapPlatformContent({
            adapter: nafezlyAdapter,
            document,
            services: createPlatformContentServices({
                promptRepository: repositories.promptRepository,
                proposalRepository: repositories.proposalRepository,
                trackingRepository: repositories.trackingRepository,
            }),
        });
        bootstrapPlatformAutofill({
            adapter: nafezlyAdapter,
            document,
            proposalRepository: repositories.proposalRepository,
        });
    },
});
