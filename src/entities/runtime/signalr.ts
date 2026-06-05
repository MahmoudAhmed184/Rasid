export const DEFAULT_SIGNALR_URL = 'https://rasid.runasp.net/jobNotificationHub';

export function redactSignalRUrl(serverUrl: string = DEFAULT_SIGNALR_URL): string {
    try {
        const url = new URL(serverUrl);
        return `${url.origin}${url.pathname}`;
    } catch {
        return DEFAULT_SIGNALR_URL;
    }
}
