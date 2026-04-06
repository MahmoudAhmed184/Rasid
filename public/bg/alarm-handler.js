// ==========================================
// bg/alarm-handler.js — Cross-browser alarms listener
// Depends on: signalr.js, job-checker.js, tracker.js, constants.js
// ==========================================

/* global signalRClient */

browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'checkJobs') {
        const data = await browserApi.storage.local.get(['settings']);
        const notificationMode = (data.settings || {}).notificationMode || 'auto';

        void checkTrackedProjects();

        if (notificationMode === 'polling') {
            void checkForNewJobs();
        } else if (notificationMode === 'signalr') {
            await initializeSignalR();
        } else {
            await initializeSignalR();

            const isSignalRActive =
                SIGNALR_AVAILABLE &&
                typeof signalRClient !== 'undefined' &&
                signalRClient.isConnected;

            if (!isSignalRActive) {
                void checkForNewJobs();
            }
        }
    }

    if (alarm.name === 'signalRReconnect') {
        const d = await browserApi.storage.local.get(['settings']);
        const mode = (d.settings || {}).notificationMode || 'auto';
        if (mode !== 'polling') {
            await initializeSignalR();
        }
    }
});
