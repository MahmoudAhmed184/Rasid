import { describe, expect, it } from 'vitest';

import {
    NAFEZLY_SELECTORS,
    extractNafezlyProjectId,
    queryAll,
    queryFirst,
} from '../../../../src/platforms/nafezly/selectors';
import { installTestDom } from '../../../support/html';

describe('nafezly selectors helpers', () => {
    it('extracts project ID from pathname', () => {
        expect(extractNafezlyProjectId('/project/9876-my-project')).toBe('9876');
        expect(extractNafezlyProjectId('/projects')).toBe('');
    });

    it('queries first and all elements across selector lists', () => {
        const doc = installTestDom(`
            <div class="box target">Target 1</div>
            <div class="box">Target 2</div>
        `);

        expect(queryFirst(doc, ['.missing', '.target'])?.textContent).toBe('Target 1');
        expect(queryFirst(doc, ['.missing'])).toBeNull();

        const allFromSingle = queryAll(doc, '.box');
        expect(allFromSingle).toHaveLength(2);

        const allFromList = queryAll(doc, ['.box', '.target']);
        expect(allFromList).toHaveLength(2);
    });

    it('exports defined selector constants', () => {
        expect(NAFEZLY_SELECTORS.project.sectionBlocks).toBe('.main-nafez-box-styles');
        expect(NAFEZLY_SELECTORS.observation.targets.length).toBeGreaterThan(0);
    });
});
