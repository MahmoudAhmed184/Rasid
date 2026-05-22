import { fakeBrowser } from 'wxt/testing';

export { fakeBrowser };

export function resetFakeBrowser(): void {
    fakeBrowser.reset();
}
