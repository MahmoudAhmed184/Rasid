import { browser } from 'wxt/browser';

// ==========================================
// mostaql/runtime.js — Runtime helpers
// ==========================================

const browserApi = browser;
const PROJECT_PATH_PATTERN = /\/project[s]?\/(\d+)/;

export function isContextValid() {
    try {
        return (
            typeof browserApi !== 'undefined' &&
            !!browserApi.runtime &&
            !!browserApi.runtime.id &&
            !!browserApi.storage
        );
    } catch {
        return false;
    }
}

export function getProjectId() {
    const match = window.location.pathname.match(PROJECT_PATH_PATTERN);
    return match ? match[1] : '';
}
