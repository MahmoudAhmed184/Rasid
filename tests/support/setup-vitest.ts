import { afterEach, beforeEach, vi } from 'vitest';

import { installTestDom } from './html';
import { resetFakeBrowser } from './fake-browser';

beforeEach(() => {
    installTestDom();
    resetFakeBrowser();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    installTestDom();
    resetFakeBrowser();
});
