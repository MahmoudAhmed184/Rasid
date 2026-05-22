import { describe, expect, it, vi } from 'vitest';

import { createTabController } from '../../../../src/app/dashboard/tabs';
import { installTestDom } from '../../../support/html';

function keyboardEvent(key: string): Event {
    const event = new Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'key', {
        configurable: true,
        value: key,
    });
    return event;
}

describe('dashboard tab controller', () => {
    it('sets ARIA tab state and visible panels on bind and click', () => {
        const root = installTestDom(`
            <nav class="sidebar-nav" role="tablist">
                <button class="nav-item" data-tab="overview">Overview</button>
                <button class="nav-item" data-tab="settings">Settings</button>
            </nav>
            <section id="overview-tab" class="tab-container"></section>
            <section id="settings-tab" class="tab-container"></section>
        `);
        const onTabActivated = vi.fn();
        const controller = createTabController(root, { onTabActivated });

        controller.bind();
        expect(root.getElementById('overview-tab')?.hidden).toBe(false);
        expect(root.getElementById('settings-tab')?.hidden).toBe(true);

        const settingsButton = root.querySelector<HTMLButtonElement>('[data-tab="settings"]');
        settingsButton?.click();

        expect(root.getElementById('overview-tab')?.hidden).toBe(true);
        expect(root.getElementById('settings-tab')?.hidden).toBe(false);
        expect(settingsButton?.getAttribute('aria-selected')).toBe('true');
        expect(onTabActivated).toHaveBeenCalledWith('settings');
    });

    it('supports keyboard navigation without activating until Enter or Space', () => {
        const root = installTestDom(`
            <nav class="sidebar-nav" role="tablist">
                <button class="nav-item" data-tab="overview">Overview</button>
                <button class="nav-item" data-tab="projects">Projects</button>
                <button class="nav-item" data-tab="settings">Settings</button>
            </nav>
            <section id="overview-tab" class="tab-container"></section>
            <section id="projects-tab" class="tab-container"></section>
            <section id="settings-tab" class="tab-container"></section>
        `);
        const controller = createTabController(root);
        const buttons = root.querySelectorAll<HTMLButtonElement>('.nav-item');
        const focusProjects = vi.spyOn(buttons[1]!, 'focus');

        controller.bind();
        buttons[0]?.dispatchEvent(keyboardEvent('ArrowDown'));
        expect(focusProjects).toHaveBeenCalledOnce();

        buttons[1]?.dispatchEvent(keyboardEvent('Enter'));
        expect(root.getElementById('projects-tab')?.hidden).toBe(false);
        expect(buttons[1]?.getAttribute('aria-selected')).toBe('true');
    });

    it('wraps focus with arrow keys, supports Home/End, and ignores tabless buttons', () => {
        const root = installTestDom(`
            <nav class="sidebar-nav" role="tablist">
                <button class="nav-item" data-tab="overview">Overview</button>
                <button class="nav-item" data-tab="projects">Projects</button>
                <button class="nav-item" data-tab="settings">Settings</button>
                <button class="nav-item">Missing tab</button>
            </nav>
            <section id="overview-tab" class="tab-container"></section>
            <section id="projects-tab" class="tab-container"></section>
            <section id="settings-tab" class="tab-container"></section>
        `);
        const onTabActivated = vi.fn();
        const controller = createTabController(root, { onTabActivated });
        const buttons = root.querySelectorAll<HTMLButtonElement>('.nav-item');
        const focusOverview = vi.spyOn(buttons[0]!, 'focus');
        const focusSettings = vi.spyOn(buttons[2]!, 'focus');
        const focusTabless = vi.spyOn(buttons[3]!, 'focus');

        controller.bind();

        const arrowUp = keyboardEvent('ArrowUp');
        buttons[0]?.dispatchEvent(arrowUp);
        expect(arrowUp.defaultPrevented).toBe(true);
        expect(focusTabless).toHaveBeenCalledOnce();

        const arrowDown = keyboardEvent('ArrowDown');
        buttons[3]?.dispatchEvent(arrowDown);
        expect(arrowDown.defaultPrevented).toBe(true);
        expect(focusOverview).toHaveBeenCalledOnce();

        const end = keyboardEvent('End');
        buttons[0]?.dispatchEvent(end);
        expect(end.defaultPrevented).toBe(true);
        expect(focusTabless).toHaveBeenCalledTimes(2);

        const home = keyboardEvent('Home');
        buttons[2]?.dispatchEvent(home);
        expect(home.defaultPrevented).toBe(true);
        expect(focusOverview).toHaveBeenCalledTimes(2);

        const space = keyboardEvent(' ');
        buttons[2]?.dispatchEvent(space);
        expect(space.defaultPrevented).toBe(true);
        expect(root.getElementById('settings-tab')?.hidden).toBe(false);
        expect(onTabActivated).toHaveBeenCalledWith('settings');

        buttons[3]?.click();
        expect(onTabActivated).toHaveBeenCalledTimes(1);
        expect(focusSettings).not.toHaveBeenCalled();
    });
});
