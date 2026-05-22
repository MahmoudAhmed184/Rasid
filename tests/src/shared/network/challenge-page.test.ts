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
});
