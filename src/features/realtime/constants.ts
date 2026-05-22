export { DEFAULT_SIGNALR_URL } from '../../entities/runtime/signalr';
export const SIGNALR_HEALTH_INTERVAL_MINUTES = 1;
export const SIGNALR_LEASE_WINDOW_MS = 4.5 * 60 * 1000;
export const SIGNALR_LEASE_WINDOW_MINUTES = SIGNALR_LEASE_WINDOW_MS / 60000;
export const SIGNALR_RECONNECT_DELAY_MINUTES = 1;

export const ALARM_NAMES = {
    jobPolling: 'jobs:poll',
    signalrHealth: 'signalr:health',
    signalrLease: 'signalr:lease',
    signalrReconnect: 'signalr:reconnect',
} as const;
