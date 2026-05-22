export const DEFAULT_SIGNALR_URL = 'https://freelancia.runasp.net/jobNotificationHub';

export function resolveSignalRServerUrl(value: unknown): string {
    return typeof value === 'string' && value.trim() === DEFAULT_SIGNALR_URL
        ? DEFAULT_SIGNALR_URL
        : DEFAULT_SIGNALR_URL;
}

export function redactSignalRUrl(value: unknown): string {
    const serverUrl = resolveSignalRServerUrl(value);

    try {
        const url = new URL(serverUrl);
        return `${url.origin}${url.pathname}`;
    } catch {
        return DEFAULT_SIGNALR_URL;
    }
}
