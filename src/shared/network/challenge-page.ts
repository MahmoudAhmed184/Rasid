const CHALLENGE_PAGE_MARKERS = [
    'just a moment',
    'attention required',
    'challenge-platform',
    'cf_chl_',
    '__cf_chl_',
    'request blocked',
    'x-amzn-waf-action',
] as const;

export interface ChallengePageMatch {
    readonly marker: (typeof CHALLENGE_PAGE_MARKERS)[number];
}

export function detectChallengePage(html: string): ChallengePageMatch | null {
    const normalized = html.trim().toLowerCase();

    if (!normalized) {
        return null;
    }

    for (const marker of CHALLENGE_PAGE_MARKERS) {
        if (normalized.includes(marker)) {
            return { marker };
        }
    }

    return null;
}

export function looksLikeChallengePage(html: string): boolean {
    return detectChallengePage(html) !== null;
}
