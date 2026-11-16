import { browser } from 'wxt/browser';
import { ar, type TranslationKey } from './ar';
import { en } from './en';
import type { AppLanguage, TranslationParams } from './types';

export * from './types';
export * from './ar';
export * from './en';

let activeLanguage: AppLanguage = 'ar';
const languageChangeListeners = new Set<(lang: AppLanguage) => void>();

export function getLanguage(): AppLanguage {
    return activeLanguage;
}

export function onLanguageChange(listener: (lang: AppLanguage) => void): () => void {
    languageChangeListeners.add(listener);
    return () => {
        languageChangeListeners.delete(listener);
    };
}

export function setLanguage(lang: AppLanguage): void {
    if (lang === 'en' || lang === 'ar') {
        const changed = activeLanguage !== lang;
        activeLanguage = lang;
        if (changed) {
            for (const listener of Array.from(languageChangeListeners)) {
                try {
                    listener(lang);
                } catch {
                    // Ignore listener errors
                }
            }
        }
    }
}

export function detectBrowserLanguage(): AppLanguage {
    if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
        if (navigator.language.toLowerCase().startsWith('en')) {
            return 'en';
        }
    }
    return 'ar';
}

export function getDirection(lang: AppLanguage = activeLanguage): 'rtl' | 'ltr' {
    return lang === 'en' ? 'ltr' : 'rtl';
}

export function getLocale(lang: AppLanguage = activeLanguage): string {
    return lang === 'en' ? 'en-US' : 'ar-EG';
}

const dictionaries: Record<AppLanguage, Record<string, string>> = {
    ar,
    en,
};

export function t(key: TranslationKey, params?: TranslationParams): string;
export function t(key: string, params?: TranslationParams): string;
export function t(key: string, params?: TranslationParams): string {
    const dict = dictionaries[activeLanguage] || dictionaries.ar;
    let text = dict[key];

    // Fall back to Arabic if missing in active dictionary
    if (text === undefined || text === null) {
        text = dictionaries.ar[key];
    }

    // Fall back to key if missing in both
    if (text === undefined || text === null) {
        text = key;
    }

    if (params) {
        for (const [paramKey, paramValue] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
        }
    }

    return text;
}

function parseDateInput(input: Date | string | number): Date | null {
    if (input instanceof Date) {
        return Number.isNaN(input.getTime()) ? null : input;
    }
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(
    date: Date | string | number,
    options?: Intl.DateTimeFormatOptions,
    lang: AppLanguage = activeLanguage
): string {
    const parsed = parseDateInput(date);
    if (!parsed) {
        return '';
    }
    return new Intl.DateTimeFormat(getLocale(lang), options).format(parsed);
}

export function formatTime(
    date: Date | string | number,
    options?: Intl.DateTimeFormatOptions,
    lang: AppLanguage = activeLanguage
): string {
    const parsed = parseDateInput(date);
    if (!parsed) {
        return '';
    }
    const defaultOptions: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        ...options,
    };
    return new Intl.DateTimeFormat(getLocale(lang), defaultOptions).format(parsed);
}

export function formatDateTime(
    date: Date | string | number,
    options?: Intl.DateTimeFormatOptions,
    lang: AppLanguage = activeLanguage
): string {
    const parsed = parseDateInput(date);
    if (!parsed) {
        return '';
    }
    const defaultOptions: Intl.DateTimeFormatOptions = {
        dateStyle: 'medium',
        timeStyle: 'short',
        ...options,
    };
    return new Intl.DateTimeFormat(getLocale(lang), defaultOptions).format(parsed);
}

export async function initStorageLanguage(): Promise<AppLanguage> {
    try {
        if (browser?.storage?.local) {
            const data: Record<string, unknown> = await browser.storage.local.get([
                'language',
                'settings',
            ]);
            const lang =
                data?.language ?? (data?.settings as Record<string, unknown> | undefined)?.language;
            if (lang === 'ar' || lang === 'en') {
                setLanguage(lang);
                return lang;
            }
        }
    } catch {
        // Fall back
    }

    const detected = detectBrowserLanguage();
    setLanguage(detected);
    return detected;
}

if (typeof browser !== 'undefined' && browser.storage?.onChanged?.addListener) {
    try {
        browser.storage.onChanged.addListener(
            (changes: Record<string, { newValue?: unknown }>, area: string) => {
                if (area === 'local') {
                    const newLang =
                        changes.language?.newValue ??
                        (changes.settings?.newValue as Record<string, unknown> | undefined)
                            ?.language;
                    if (newLang === 'ar' || newLang === 'en') {
                        setLanguage(newLang);
                    }
                }
            }
        );
    } catch {
        // Ignore listener errors in testing
    }
}
