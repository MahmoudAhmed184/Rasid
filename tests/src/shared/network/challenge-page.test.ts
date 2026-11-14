import { describe, expect, it } from 'vitest';

import {
    detectChallengePage,
    looksLikeChallengePage,
} from '../../../../src/shared/network/challenge-page';
import { readTextFixture } from '../../../support/fixtures';

describe('challenge-page detection', () => {
    it('detects common Cloudflare and WAF challenge markers', () => {
        const fixture = readTextFixture('mostaql', 'challenge.html');

        expect(looksLikeChallengePage(fixture)).toBe(true);
        expect(detectChallengePage(fixture)?.marker).toBe('just a moment');
    });

    it('ignores normal marketplace HTML and empty values', () => {
        expect(looksLikeChallengePage(readTextFixture('mostaql', 'listing.html'))).toBe(false);
        expect(detectChallengePage('   ')).toBeNull();
    });

    it('does not falsely trigger on legitimate freelance projects discussing turnstile or coding challenges', () => {
        const legitimateProjectHtml = `
            <div class="project-card">
                <h2>ربط Cloudflare Turnstile مع نموذج تسجيل ووردبريس</h2>
                <p>أبحث عن مبرمج لدمج turnstile لحماية الموقع بدلا من reCAPTCHA مع إنشاء challenge-container مخصص.</p>
            </div>
        `;

        expect(looksLikeChallengePage(legitimateProjectHtml)).toBe(false);
    });

    it('reliably detects real Cloudflare Turnstile and AWS WAF challenges', () => {
        expect(
            looksLikeChallengePage(
                '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>'
            )
        ).toBe(true);
        expect(looksLikeChallengePage('<div class="cf-turnstile" data-sitekey="xxx"></div>')).toBe(
            true
        );
        expect(
            looksLikeChallengePage('<script src="https://token.awswaf.com/token.js"></script>')
        ).toBe(true);
        expect(looksLikeChallengePage('<div id="awswafintegration"></div>')).toBe(true);
    });
});
