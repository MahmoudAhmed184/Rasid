import { describe, expect, it } from 'vitest';

import {
    MOSTAQL_SELECTORS,
    queryAll,
    queryFirst,
} from '../../../../src/platforms/mostaql/selectors';
import { installTestDom } from '../../../support/html';

describe('mostaql selectors helpers', () => {
    it('queries first matching element across selector candidates', () => {
        const doc = installTestDom(`
            <div class="first-target">First</div>
            <div class="second-target">Second</div>
        `);

        const match = queryFirst(doc, ['.missing', '.second-target', '.first-target']);
        expect(match?.textContent).toBe('Second');

        const noMatch = queryFirst(doc, ['.missing-1', '.missing-2']);
        expect(noMatch).toBeNull();
    });

    it('queries all matching elements across selector list and deduplicates', () => {
        const doc = installTestDom(`
            <div class="item active">Item 1</div>
            <div class="item">Item 2</div>
            <span class="badge active">Badge</span>
        `);

        const matches = queryAll(doc, ['.item', '.active']);
        expect(matches).toHaveLength(3);
        expect(matches.map((el) => el.textContent)).toEqual(['Item 1', 'Item 2', 'Badge']);
    });

    it('exports defined selector constants', () => {
        expect(MOSTAQL_SELECTORS.sidebar.metaPanel).toBe('#project-meta-panel');
        expect(MOSTAQL_SELECTORS.observation.targets.length).toBeGreaterThan(0);
    });
});
