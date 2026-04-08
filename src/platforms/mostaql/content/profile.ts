import { MOSTAQL_SELECTORS, queryFirst } from '../selectors';

// ==========================================
// mostaql/profile.js — Profile page injector
// ==========================================

export function injectProfileTools() {
    const target = queryFirst<HTMLElement>(document, MOSTAQL_SELECTORS.profile.targets);
    if (!target) {
        return;
    }

    if (document.getElementById('mostaql-profile-tools')) {
        return;
    }

    const box = document.createElement('div');
    const button = document.createElement('button');
    box.id = 'mostaql-profile-tools';
    button.className = 'btn btn-success';
    button.textContent = 'أداة بروفايل';
    box.appendChild(button);
    target.appendChild(box);
}
