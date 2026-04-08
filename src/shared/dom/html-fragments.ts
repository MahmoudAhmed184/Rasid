type HtmlFragmentContext = 'default' | 'table-body';

interface QueryHtmlFragmentOptions {
    readonly context?: HtmlFragmentContext;
}

function wrapHtmlFragment(html: string, context: HtmlFragmentContext): string {
    if (context === 'table-body') {
        return `<table><tbody>${html}</tbody></table>`;
    }

    return `<div>${html}</div>`;
}

export function queryHtmlFragment<T extends Element>(
    html: string,
    selector: string,
    options: QueryHtmlFragmentOptions = {}
): T | null {
    const normalizedHtml = html.trim();

    if (normalizedHtml.length === 0) {
        return null;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(
        wrapHtmlFragment(normalizedHtml, options.context ?? 'default'),
        'text/html'
    );

    return doc.querySelector<T>(selector);
}
