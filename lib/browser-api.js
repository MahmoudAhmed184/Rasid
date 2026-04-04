(function initBrowserApi() {
    if (typeof globalThis.browserApi !== 'undefined') {
        return;
    }

    if (typeof globalThis.browser !== 'undefined') {
        globalThis.browserApi = globalThis.browser;
        return;
    }

    if (typeof globalThis.chrome === 'undefined') {
        throw new Error('WebExtension API is not available in this context.');
    }

    const api = globalThis.chrome;

    function createPromisifiedMethod(namespace, methodName) {
        const method = namespace && namespace[methodName];
        if (typeof method !== 'function') {
            return undefined;
        }

        return (...args) =>
            new Promise((resolve, reject) => {
                method.call(namespace, ...args, (result) => {
                    const lastError = api.runtime && api.runtime.lastError;
                    if (lastError) {
                        reject(new Error(lastError.message));
                        return;
                    }
                    resolve(result);
                });
            });
    }

    function extendNamespace(namespace, overrides = {}) {
        return Object.assign(Object.create(namespace || null), overrides);
    }

    const browserApi = extendNamespace(api, {
        storage: extendNamespace(api.storage, {
            local: extendNamespace(api.storage && api.storage.local, {
                get: createPromisifiedMethod(api.storage.local, 'get'),
                set: createPromisifiedMethod(api.storage.local, 'set'),
                remove: createPromisifiedMethod(api.storage.local, 'remove'),
                clear: createPromisifiedMethod(api.storage.local, 'clear'),
            }),
        }),
        runtime: extendNamespace(api.runtime, {
            sendMessage: createPromisifiedMethod(api.runtime, 'sendMessage'),
        }),
        tabs: extendNamespace(api.tabs, {
            create: createPromisifiedMethod(api.tabs, 'create'),
        }),
        alarms: extendNamespace(api.alarms, {
            clear: createPromisifiedMethod(api.alarms, 'clear'),
        }),
        notifications: extendNamespace(api.notifications, {
            create: createPromisifiedMethod(api.notifications, 'create'),
        }),
        downloads: extendNamespace(api.downloads, {
            download: createPromisifiedMethod(api.downloads, 'download'),
        }),
    });

    globalThis.browserApi = browserApi;
    globalThis.browser = browserApi;
})();
