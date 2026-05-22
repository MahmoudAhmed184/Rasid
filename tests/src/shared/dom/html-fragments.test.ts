import { describe, expect, it } from 'vitest';

import { queryHtmlFragment } from '../../../../src/shared/dom/html-fragments';
import { installTestDom } from '../../../support/html';

describe('HTML fragment querying', () => {
    it('returns null for empty fragments and queries normal fragments through a wrapper', () => {
        installTestDom();

        expect(queryHtmlFragment('', '.missing')).toBeNull();
        expect(
            queryHtmlFragment<HTMLAnchorElement>(
                '<a href="https://mostaql.com/projects">مشاريع</a>',
                'a'
            )?.href
        ).toBe('https://mostaql.com/projects');
    });

    it('uses a table body wrapper when parsing table rows', () => {
        installTestDom();

        const row = queryHtmlFragment<HTMLTableRowElement>(
            '<tr><td data-testid="title">مشروع</td></tr>',
            'tr',
            { context: 'table-body' }
        );

        expect(row?.querySelector('[data-testid="title"]')?.textContent).toBe('مشروع');
    });
});
