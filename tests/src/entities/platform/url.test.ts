import { describe, expect, it } from 'vitest';

import {
    isAllowedPlatformHostname,
    resolvePlatformUrl,
} from '../../../../src/entities/platform/url';

describe('platform URL safety', () => {
    const options = {
        baseUrl: 'https://mostaql.com/projects',
        allowedHosts: ['mostaql.com'],
        pathPattern: /^\/projects?\/\d+/,
    };

    it.each([
        ['relative project', '/project/123-demo', 'https://mostaql.com/project/123-demo'],
        [
            'URL object project',
            new URL('https://mostaql.com/projects/789-demo?x=1#frag'),
            'https://mostaql.com/projects/789-demo?x=1',
        ],
        [
            'subdomain project',
            'https://www.mostaql.com/projects/456-demo#frag',
            'https://www.mostaql.com/projects/456-demo',
        ],
        [
            'credential stripping',
            'https://u:p@mostaql.com/project/1',
            'https://mostaql.com/project/1',
        ],
    ] as const)('normalizes safe %s URLs', (_label, value, expected) => {
        expect(resolvePlatformUrl(value, options)).toBe(expected);
    });

    it.each([
        ['javascript URL', 'javascript:alert(1)'],
        ['http URL', 'http://mostaql.com/project/1'],
        ['off origin', 'https://evil.example/project/1'],
        ['wrong path', 'https://mostaql.com/users/1'],
        ['empty', ''],
    ] as const)('rejects %s', (_label, value) => {
        expect(resolvePlatformUrl(value, options)).toBeNull();
    });

    it('allows exact hosts and subdomains only', () => {
        expect(isAllowedPlatformHostname('mostaql.com', ['mostaql.com'])).toBe(true);
        expect(isAllowedPlatformHostname('www.mostaql.com', ['mostaql.com'])).toBe(true);
        expect(isAllowedPlatformHostname('mostaql.com.evil.example', ['mostaql.com'])).toBe(false);
    });

    it('rejects unparsable URLs before applying host checks', () => {
        expect(
            resolvePlatformUrl('::not-url::', {
                baseUrl: 'not a valid base',
                allowedHosts: ['mostaql.com'],
            })
        ).toBeNull();
    });
});
