import { describe, expect, it } from 'vitest';

import {
    KHAMSAT_SELECTORS,
    extractKhamsatProjectId,
    queryAll,
    queryFirst,
} from '../../../../src/platforms/khamsat/selectors';
import { installTestDom } from '../../../support/html';

describe('khamsat selectors helpers', () => {
    it('extracts request ID from pathname', () => {
        expect(extractKhamsatProjectId('/community/requests/12345-my-request')).toBe('12345');
        expect(extractKhamsatProjectId('/community/requests/')).toBe('');
    });

    it('queries first and all elements across selector lists', () => {
        const doc = installTestDom(`
            <div class="row first">First</div>
            <div class="row second">Second</div>
        `);

        expect(queryFirst(doc, ['.missing', '.second'])?.textContent).toBe('Second');
        expect(queryFirst(doc, ['.missing'])).toBeNull();

        const all = queryAll(doc, ['.row', '.first']);
        expect(all).toHaveLength(2);
    });

    it('exports defined selector constants', () => {
        expect(KHAMSAT_SELECTORS.listing.rows).toBe('tr.forum_post');
        expect(KHAMSAT_SELECTORS.observation.targets.length).toBeGreaterThan(0);
    });
});
