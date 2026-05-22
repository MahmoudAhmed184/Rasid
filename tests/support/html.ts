import { DOMParser, parseHTML } from 'linkedom';

const DEFAULT_MARKUP = '<!doctype html><html><head></head><body></body></html>';

export function installTestDom(markup = DEFAULT_MARKUP): Document {
    const window = parseHTML(markup);

    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: window,
    });
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: window.document,
    });
    Object.defineProperty(globalThis, 'DOMParser', {
        configurable: true,
        value: DOMParser,
    });

    for (const key of [
        'CustomEvent',
        'Element',
        'Event',
        'File',
        'FileReader',
        'HTMLAnchorElement',
        'HTMLButtonElement',
        'HTMLElement',
        'HTMLInputElement',
        'HTMLSelectElement',
        'HTMLTextAreaElement',
        'HTMLTimeElement',
        'KeyboardEvent',
        'MouseEvent',
        'Node',
    ] as const) {
        const value = window[key];

        if (value) {
            Object.defineProperty(globalThis, key, {
                configurable: true,
                value,
            });
        }
    }

    return window.document as unknown as Document;
}

export function parseDocument(markup: string): Document {
    return new DOMParser().parseFromString(markup, 'text/html') as unknown as Document;
}
