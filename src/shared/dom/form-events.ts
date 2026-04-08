type FormControlElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

interface SetFormControlValueOptions {
    readonly highlightClassName?: string;
    readonly includeKeyboardEvents?: boolean;
    readonly blurDelayMs?: number | false;
}

function getValueDescriptor(control: FormControlElement): PropertyDescriptor | undefined {
    if (control instanceof HTMLTextAreaElement) {
        return Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    }

    if (control instanceof HTMLSelectElement) {
        return Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    }

    return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
}

function dispatchFormValueEvents(
    control: FormControlElement,
    options: SetFormControlValueOptions
): void {
    control.dispatchEvent(new Event('focus', { bubbles: true }));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));

    if (options.includeKeyboardEvents) {
        control.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        control.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        control.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true }));
    }

    const blurDelayMs = options.blurDelayMs ?? 50;

    if (blurDelayMs !== false) {
        window.setTimeout(() => {
            control.dispatchEvent(new Event('blur', { bubbles: true }));
        }, blurDelayMs);
    }
}

export function setFormControlValue(
    control: FormControlElement,
    value: string,
    options: SetFormControlValueOptions = {}
): void {
    const descriptor = getValueDescriptor(control);

    if (descriptor?.set) {
        descriptor.set.call(control, value);
    } else {
        control.value = value;
    }

    if (options.highlightClassName) {
        control.classList.add(options.highlightClassName);
    }

    dispatchFormValueEvents(control, options);
}
