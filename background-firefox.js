// ==========================================
// background-firefox.js — Firefox MV3 Entry Point
//
// Firefox MV3 uses event pages (NOT service workers), so all files listed
// in manifest.json "background.scripts" are loaded automatically
// in order. This file is listed LAST and handles startup logic only.
//
// Key differences from background.js (Chrome):
//   • No importScripts() — scripts are loaded via the manifest scripts array
//   • DOMParser and AudioContext are available directly (no offscreen needed)
//   • SIGNALR_AVAILABLE is detected by checking if libs were loaded
// ==========================================

// Detect if SignalR libraries loaded successfully.
// signalr.min.js declares `signalR` global; signalr-client.js declares `signalRClient`.
if (typeof signalR !== 'undefined' && typeof signalRClient !== 'undefined') {
    SIGNALR_AVAILABLE = true;
    console.log('✅ SignalR libraries loaded successfully');
} else {
    // SIGNALR_AVAILABLE is already false (set in bg/constants.js)
    console.warn('⚠️ SignalR libraries not available. Real-time notifications disabled.');
    console.warn('📥 Download signalr.min.js and ensure signalr-client.js is present.');
    console.warn('💡 Extension will work with traditional polling until SignalR is set up.');
}

// Background event page startup
(async function initOnStartup() {
    console.log('🦊 Firefox background event page started');
    const data = await browserApi.storage.local.get(['settings']);
    const mode = (data.settings || {}).notificationMode || 'auto';

    if (mode === 'polling') {
        console.log('📡 Notification mode: polling — skipping SignalR init');
        return;
    }
    await initializeSignalR();
})();
