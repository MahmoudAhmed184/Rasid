import { browser } from 'wxt/browser';

// ==========================================
// mostaql/runtime.js — Runtime helpers
// ==========================================

const browserApi = browser;

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

export function getPageType() {
    const path = location.pathname;
    if (/\/project[s]?\/\d+/.test(path)) {
        return 'project';
    }
    if (/\/message\//.test(path)) {
        return 'message';
    }
    if (/\/messages/.test(path)) {
        return 'messages';
    }
    if (/\/profile/.test(path)) {
        return 'profile';
    }
    if (path === '/' || path === '') {
        return 'home';
    }
    return 'other';
}

export function getProjectId() {
    const match = window.location.pathname.match(/\/project\/(\d+)/);
    return match ? match[1] : '';
}
