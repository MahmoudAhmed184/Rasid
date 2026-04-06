// ==========================================
// bg/signalr.js — SignalR connection management
// Depends on: constants.js (SIGNALR_AVAILABLE), signalr-client.js (signalRClient global)
// ==========================================

/* global signalRClient */

const DEFAULT_SIGNALR_URL = 'https://frelancia.runasp.net/jobNotificationHub';

async function initializeSignalR() {
    try {
        if (!SIGNALR_AVAILABLE) {
            return;
        }

        if (typeof signalRClient === 'undefined') {
            console.warn('SignalR client not available. Make sure signalr-client.js is loaded.');
            return;
        }

        // Apply custom server URL from settings if set
        const data = await browserApi.storage.local.get(['settings']);
        const customUrl = data.settings?.signalrServerUrl?.trim();
        signalRClient.serverUrl = customUrl || DEFAULT_SIGNALR_URL;

        if (signalRClient.isConnected) {
            return;
        }

        signalRClient.onFallbackActivated(() => {
            console.warn('🔄 SignalR fallback activated — polling will handle new jobs.');
        });

        await signalRClient.connect();
    } catch (error) {
        console.error('Error initializing SignalR:', error);
    }
}

async function reconnectSignalR() {
    try {
        if (!SIGNALR_AVAILABLE || typeof signalRClient === 'undefined') {
            return;
        }

        // disconnect() is safe to call even when already disconnected
        await signalRClient.disconnect();
        signalRClient.reconnectAttempts = 0;

        await initializeSignalR();
    } catch (error) {
        console.error('Error reconnecting SignalR:', error);
    }
}
