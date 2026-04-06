// ==========================================
// SignalR Client for Real-Time Job Notifications
// ==========================================

/**
 * Manages the SignalR connection lifecycle, including connection,
 * reconnection via extension alarms, and fallback event dispatching.
 */
class SignalRClient {
    constructor() {
        this.connection = null;
        this.serverUrl = 'https://frelancia.runasp.net/jobNotificationHub';
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.onFallbackActivatedCallback = null;
    }

    /**
     * Initialize and connect to the SignalR hub.
     */
    async connect() {
        try {
            if (this.connection && this.isConnected) {
                return;
            }

            if (this.connection) {
                try {
                    await this.connection.stop();
                } catch (e) {
                    console.warn('SignalR: Error stopping existing connection', e);
                }
            }

            this.connection = new signalR.HubConnectionBuilder()
                .withUrl(this.serverUrl, {
                    skipNegotiation: false,
                    transport:
                        signalR.HttpTransportType.WebSockets |
                        signalR.HttpTransportType.ServerSentEvents |
                        signalR.HttpTransportType.LongPolling,
                })
                .withAutomaticReconnect({
                    nextRetryDelayInMilliseconds: (retryContext) => {
                        if (retryContext.elapsedMilliseconds < 60000) {
                            return Math.min(
                                1000 * Math.pow(2, retryContext.previousRetryCount),
                                60000
                            );
                        }
                        return 60000;
                    },
                })
                .build();

            // Increase timeouts to prevent dropping during Service Worker suspension/wake cycles
            this.connection.serverTimeoutInMilliseconds = 120000; // 2 minutes (default is 30s)
            this.connection.keepAliveIntervalInMilliseconds = 15000; // 15 seconds (default is 15s)

            this.registerEventHandlers();

            await this.connection.start();
            this.isConnected = true;
            this.reconnectAttempts = 0;

            await browserApi.storage.local.set({
                signalRConnected: true,
                signalRFallbackActive: false,
            });
        } catch (error) {
            console.error('SignalR: Connection failed', error);
            this.isConnected = false;
            await browserApi.storage.local.set({ signalRConnected: false });
            this.scheduleReconnect();
        }
    }

    /**
     * Register all SignalR event handlers.
     */
    registerEventHandlers() {
        // Capture reference to THIS connection so stale handlers from old
        // connections don't bleed state into a newly-established connection.
        const conn = this.connection;

        this.connection.on('NewJobsDetected', async (data) => {
            if (this.connection !== conn) {
                return;
            } // stale — ignore

            if (!data || !Array.isArray(data.jobs)) {
                console.warn('SignalR: Invalid payload received, expected data.jobs array');
                return;
            }

            try {
                await this.handleNewJobs(data.jobs);
            } catch (error) {
                console.error('SignalR: Error processing new jobs', error);
            }
        });

        this.connection.onclose(() => {
            if (this.connection !== conn) {
                return;
            } // stale — new connection already active
            this.isConnected = false;
            browserApi.storage.local.set({ signalRConnected: false });
        });

        this.connection.onreconnecting(() => {
            if (this.connection !== conn) {
                return;
            } // stale
            this.isConnected = false;
            browserApi.storage.local.set({ signalRConnected: false });
        });

        this.connection.onreconnected(() => {
            if (this.connection !== conn) {
                return;
            } // stale
            this.isConnected = true;
            browserApi.storage.local.set({
                signalRConnected: true,
                signalRFallbackActive: false,
            });
        });
    }

    /**
     * Default handler for new jobs (NO HTTP REQUESTS - just process received data).
     */
    async handleNewJobs(jobs) {
        const data = await browserApi.storage.local.get([
            'seenJobs',
            'recentJobs',
            'stats',
            'settings',
            'notificationsEnabled',
        ]);
        let seenJobs = data.seenJobs || [];
        let recentJobs = data.recentJobs || [];
        let stats = data.stats || { todayCount: 0, todayDate: new Date().toDateString() };
        const settings = data.settings || {};

        if (settings.systemEnabled === false) {
            return;
        }

        if (stats.todayDate !== new Date().toDateString()) {
            stats.todayCount = 0;
            stats.todayDate = new Date().toDateString();
        }

        const validJobs = [];

        for (const job of jobs) {
            if (seenJobs.includes(job.id)) {
                continue;
            }

            seenJobs.push(job.id);

            if (!applyFilters(job, settings)) {
                continue;
            }

            const existingIdx = recentJobs.findIndex((rj) => rj.id === job.id);
            if (existingIdx !== -1) {
                recentJobs[existingIdx] = { ...recentJobs[existingIdx], ...job };
            } else {
                recentJobs.unshift(job);
            }

            validJobs.push(job);
        }

        stats.lastCheck = new Date().toISOString();
        stats.todayCount += validJobs.length;

        if (seenJobs.length > 500) {
            seenJobs = seenJobs.slice(-500);
        }

        recentJobs.sort((a, b) => {
            const idA = parseInt(a.id) || 0;
            const idB = parseInt(b.id) || 0;
            return idB - idA;
        });
        recentJobs = recentJobs.slice(0, 50);

        await browserApi.storage.local.set({ seenJobs, stats, recentJobs });

        if (validJobs.length > 0) {
            if (settings.quietHoursEnabled && isQuietHour(settings)) {
                return;
            }

            // Check if notifications are globally enabled
            const isEnabled = data.notificationsEnabled !== false;

            if (isEnabled) {
                await showNotification(validJobs);

                if (settings.sound) {
                    await playSound();
                }
            }
        }
    }

    /**
     * Register a callback for when fallback mode is activated.
     */
    onFallbackActivated(callback) {
        this.onFallbackActivatedCallback = callback;
    }

    /**
     * Schedule a reconnection attempt using extension alarms (MV3-safe).
     * setTimeout is unreliable in service workers that can be suspended.
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('SignalR: Max reconnect attempts reached. Activating polling fallback.');
            browserApi.storage.local.set({ signalRFallbackActive: true });

            if (this.onFallbackActivatedCallback) {
                this.onFallbackActivatedCallback();
            }
            return;
        }

        this.reconnectAttempts++;
        const delayMinutes = Math.max(this.reconnectAttempts * 0.5, 0.5);
        browserApi.alarms.create('signalRReconnect', { delayInMinutes: delayMinutes });
    }

    /**
     * Disconnect from the hub.
     */
    async disconnect() {
        if (!this.connection) {
            return;
        }

        // Null this.connection FIRST so any in-flight onclose/onreconnecting
        // callbacks triggered by stop() see a null reference and bail out.
        const conn = this.connection;
        this.connection = null;
        this.isConnected = false;

        try {
            await conn.stop();
        } catch (error) {
            console.error('SignalR: Error disconnecting', error);
        }

        await browserApi.storage.local.set({ signalRConnected: false });
    }
}

// Create global instance
const signalRClient = new SignalRClient();
