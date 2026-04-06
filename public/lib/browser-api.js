(function initBrowserApi() {
    if (typeof globalThis.browserApi !== 'undefined') {
        return;
    }

    const api =
        (typeof globalThis.browser !== 'undefined' && globalThis.browser) ||
        (typeof globalThis.chrome !== 'undefined' && globalThis.chrome);

    if (!api) {
        throw new Error('WebExtension API is not available in this context.');
    }

    globalThis.browserApi = api;
})();
