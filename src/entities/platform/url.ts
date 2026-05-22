export interface PlatformUrlOptions {
    readonly baseUrl: string;
    readonly allowedHosts: readonly string[];
    readonly allowedProtocols?: readonly string[];
    readonly pathPattern?: RegExp;
}

export function isAllowedPlatformHostname(
    hostname: string,
    allowedHosts: readonly string[]
): boolean {
    const normalized = hostname.toLowerCase();

    return allowedHosts.some((allowedHost) => {
        const allowed = allowedHost.toLowerCase();
        return normalized === allowed || normalized.endsWith(`.${allowed}`);
    });
}

export function resolvePlatformUrl(
    value: string | URL | null | undefined,
    options: PlatformUrlOptions
): string | null {
    const rawValue =
        value instanceof URL ? value.href : typeof value === 'string' ? value.trim() : '';

    if (!rawValue) {
        return null;
    }

    let url: URL;

    try {
        url = new URL(rawValue, options.baseUrl);
    } catch {
        return null;
    }

    const allowedProtocols = options.allowedProtocols ?? ['https:'];

    if (!allowedProtocols.includes(url.protocol)) {
        return null;
    }

    if (!isAllowedPlatformHostname(url.hostname, options.allowedHosts)) {
        return null;
    }

    if (options.pathPattern && !options.pathPattern.test(url.pathname)) {
        return null;
    }

    url.username = '';
    url.password = '';
    url.hash = '';

    return url.href;
}
