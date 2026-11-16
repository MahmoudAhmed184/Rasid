import { defineContentScript } from 'wxt/utils/define-content-script';

import './style.css';
import { bootstrapPlatformAutofill } from '../../src/app/content/bootstrapPlatformAutofill';
import { createPlatformContentServices } from '../../src/app/content/createPlatformContentServices';
import { bootstrapPlatformContent } from '../../src/app/content/bootstrapPlatformContent';
import { createPlatformContentRepositories } from '../../src/app/repositories/browser-repositories';
import { mostaqlAdapter } from '../../src/platforms/mostaql';
import { initStorageLanguage } from '../../src/shared/i18n';

export default defineContentScript({
    matches: [...mostaqlAdapter.matches],
    runAt: 'document_idle',
    main() {
        void initStorageLanguage();
        const repositories = createPlatformContentRepositories();

        bootstrapPlatformContent({
            adapter: mostaqlAdapter,
            document,
            services: createPlatformContentServices({
                promptRepository: repositories.promptRepository,
                proposalRepository: repositories.proposalRepository,
                trackingRepository: repositories.trackingRepository,
            }),
        });
        bootstrapPlatformAutofill({
            adapter: mostaqlAdapter,
            document,
            proposalRepository: repositories.proposalRepository,
        });
    },
});
