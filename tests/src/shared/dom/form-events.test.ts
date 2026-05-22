import { describe, expect, it, vi } from 'vitest';

import { setFormControlValue } from '../../../../src/shared/dom/form-events';
import { installTestDom } from '../../../support/html';

function installKeyboardEventShim(): void {
    Object.defineProperty(globalThis, 'KeyboardEvent', {
        configurable: true,
        value: Event,
    });
}

function installSelectValueShim(): void {
    const selectValues = new WeakMap<HTMLSelectElement, string>();

    Object.defineProperty(HTMLSelectElement.prototype, 'value', {
        configurable: true,
        get() {
            return selectValues.get(this as HTMLSelectElement) ?? '';
        },
        set(value: string) {
            selectValues.set(this as HTMLSelectElement, value);
        },
    });
}

describe('form event helpers', () => {
    it('sets native input values and dispatches focus, input, change, keyboard, and delayed blur events', async () => {
        vi.useFakeTimers();
        const document = installTestDom('<input id="proposal" />');
        installKeyboardEventShim();
        const input = document.getElementById('proposal') as HTMLInputElement;
        const events: string[] = [];

        for (const eventName of [
            'focus',
            'input',
            'change',
            'keydown',
            'keyup',
            'keypress',
            'blur',
        ]) {
            input.addEventListener(eventName, () => events.push(eventName));
        }

        setFormControlValue(input, 'عرض جديد', {
            highlightClassName: 'is-filled',
            includeKeyboardEvents: true,
            blurDelayMs: 10,
        });

        expect(input.value).toBe('عرض جديد');
        expect(input.classList.contains('is-filled')).toBe(true);
        expect(events).toEqual(['focus', 'input', 'change', 'keydown', 'keyup', 'keypress']);

        await vi.advanceTimersByTimeAsync(10);
        expect(events).toEqual([
            'focus',
            'input',
            'change',
            'keydown',
            'keyup',
            'keypress',
            'blur',
        ]);
    });

    it('supports textarea/select controls and can suppress blur dispatch', () => {
        const document = installTestDom(`
            <textarea id="body"></textarea>
            <select id="status"><option value="open">Open</option><option value="closed">Closed</option></select>
        `);
        installSelectValueShim();
        const textarea = document.getElementById('body') as HTMLTextAreaElement;
        const select = document.getElementById('status') as HTMLSelectElement;
        const blur = vi.fn();
        textarea.addEventListener('blur', blur);

        setFormControlValue(textarea, 'نص طويل', { blurDelayMs: false });
        setFormControlValue(select, 'closed', { blurDelayMs: false });

        expect(textarea.value).toBe('نص طويل');
        expect(select.value).toBe('closed');
        expect(blur).not.toHaveBeenCalled();
    });
});
