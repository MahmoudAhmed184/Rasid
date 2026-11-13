import { fakeBrowser } from 'wxt/testing/fake-browser';

export { fakeBrowser };

function initFakePermissions(): void {
    if (fakeBrowser.permissions) {
        fakeBrowser.permissions.contains = (async () => true) as never;
        fakeBrowser.permissions.request = (async () => true) as never;
    }
}

initFakePermissions();

export function resetFakeBrowser(): void {
    fakeBrowser.reset();
    initFakePermissions();
}
