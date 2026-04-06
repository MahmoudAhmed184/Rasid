import { defineContentScript } from 'wxt/utils/define-content-script';

import './style.css';
import { checkForAutofill } from '../../src/ui/mostaql/autofill.mjs';
import { injectMessageExporter, injectProjectExporter } from '../../src/ui/mostaql/export.mjs';
import { injectDashboardStats, injectMonitoredProjects } from '../../src/ui/mostaql/home.mjs';
import { injectProfileTools } from '../../src/ui/mostaql/profile.mjs';
import { injectTrackButton } from '../../src/ui/mostaql/project-sidebar.mjs';
import { getPageType, isContextValid } from '../../src/ui/mostaql/runtime.mjs';

function createRouter() {
    let lastPath = '';
    let observerStarted = false;

    const runInjectors = () => {
        if (!isContextValid()) {
            return;
        }

        const page = getPageType();

        if (page === 'project') {
            injectTrackButton();
            injectProjectExporter();
            checkForAutofill();
        }

        if (page === 'message') {
            injectMessageExporter();
        }

        if (page === 'home') {
            injectDashboardStats();
            injectMonitoredProjects();
        }

        if (page === 'profile') {
            injectProfileTools();
        }
    };

    const startObserverOnce = () => {
        if (observerStarted) {
            return;
        }

        observerStarted = true;

        setInterval(() => {
            if (location.pathname !== lastPath) {
                lastPath = location.pathname;
                runInjectors();
            }
        }, 500);

        const observer = new MutationObserver(() => {
            runInjectors();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    };

    return {
        init() {
            lastPath = location.pathname;
            runInjectors();
            startObserverOnce();
        },
    };
}

export default defineContentScript({
    matches: ['https://mostaql.com/*'],
    runAt: 'document_idle',
    main() {
        const router = createRouter();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => router.init(), {
                once: true,
            });
            return;
        }

        router.init();
    },
});
