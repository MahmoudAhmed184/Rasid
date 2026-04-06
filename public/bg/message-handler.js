// ==========================================
// bg/message-handler.js — Cross-browser runtime message dispatcher
// Depends on: constants.js, filters.js, notifications.js, job-checker.js, audio.js
// ==========================================

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'checkNow') {
        checkForNewJobs()
            .then((result) => sendResponse(result))
            .catch((error) => {
                console.error('CheckNow Handler Error:', error);
                sendResponse({ success: false, error: 'Internal Error: ' + error.message });
            });
        return true;
    }

    if (message.action === 'testNotification') {
        const testJobs = [
            {
                id: 'test-' + Date.now(),
                title: 'هذا إشعار تجريبي - مشروع تطوير موقع إلكتروني',
                budget: '500 $',
                url: 'https://mostaql.com/projects',
            },
        ];
        showNotification(testJobs)
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.action === 'testSound') {
        playSound()
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.action === 'updateAlarm') {
        const interval = parseInt(message.interval) || 1;
        browserApi.alarms
            .clear('checkJobs')
            .then(() => {
                browserApi.alarms.create('checkJobs', { periodInMinutes: interval });
                sendResponse({ success: true, interval: interval });
            })
            .catch((error) => {
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }

    if (message.action === 'reconnectSignalR') {
        reconnectSignalR()
            .then(() => sendResponse({ success: true }))
            .catch((e) => sendResponse({ success: false, error: e.message }));
        return true;
    }

    if (message.action === 'disconnectSignalR') {
        if (typeof signalRClient !== 'undefined') {
            signalRClient
                .disconnect()
                .then(() => sendResponse({ success: true }))
                .catch((e) => sendResponse({ success: false, error: e.message }));
        } else {
            sendResponse({ success: true });
        }
        return true;
    }

    if (message.action === 'debugFetch') {
        fetch(MOSTAQL_URLS.all)
            .then((r) => r.text())
            .then((html) => sendResponse({ success: true, length: html.length }))
            .catch((e) => sendResponse({ success: false, error: e.message }));
        return true;
    }

    if (message.action === 'getDefaultPrompts') {
        sendResponse({ success: true, prompts: DEFAULT_PROMPTS });
        return false;
    }

    if (message.action === 'download_zip') {
        const { filename, files } = message;

        if (typeof JSZip !== 'undefined') {
            const zip = new JSZip();
            const canUseObjectUrl =
                typeof document !== 'undefined' && typeof URL.createObjectURL === 'function';

            const fetchPromises = files.map(async (f) => {
                if (f.content) {
                    zip.file(f.name, f.content);
                } else if (f.url) {
                    try {
                        const resp = await fetch(f.url, {
                            credentials: 'include',
                            cache: 'no-store',
                        });
                        if (!resp.ok) {
                            throw new Error(`HTTP error ${resp.status}`);
                        }
                        const buffer = await resp.arrayBuffer();
                        zip.file(f.name, buffer);
                    } catch (e) {
                        console.error(`Failed to fetch ${f.url} for zip:`, e);
                        zip.file(`${f.name}.error.txt`, `Failed to download: ${e.message}`);
                    }
                }
            });

            Promise.all(fetchPromises).then(() => {
                zip.generateAsync({ type: canUseObjectUrl ? 'blob' : 'base64' })
                    .then((zipData) => {
                        const downloadOptions = { filename, saveAs: true };
                        let objectUrl = null;

                        if (canUseObjectUrl) {
                            objectUrl = URL.createObjectURL(zipData);
                            downloadOptions.url = objectUrl;
                        } else {
                            downloadOptions.url = 'data:application/zip;base64,' + zipData;
                        }

                        browserApi.downloads
                            .download(downloadOptions)
                            .then((downloadId) => {
                                if (objectUrl) {
                                    const cleanup = (delta) => {
                                        if (
                                            delta.id !== downloadId ||
                                            !delta.state ||
                                            (delta.state.current !== 'complete' &&
                                                delta.state.current !== 'interrupted')
                                        ) {
                                            return;
                                        }

                                        browserApi.downloads.onChanged.removeListener(cleanup);
                                        URL.revokeObjectURL(objectUrl);
                                    };

                                    browserApi.downloads.onChanged.addListener(cleanup);
                                }

                                sendResponse({ success: true, downloadId });
                            })
                            .catch((error) => {
                                if (objectUrl) {
                                    URL.revokeObjectURL(objectUrl);
                                }
                                sendResponse({ success: false, error: error.message });
                            });
                    })
                    .catch((err) => {
                        console.error('ZIP Generation error:', err);
                        sendResponse({ success: false, error: err.message });
                    });
            });
            return true;
        } else {
            console.error('JSZip not loaded');
            sendResponse({ success: false, error: 'JSZip not loaded' });
            return false;
        }
    }
});
