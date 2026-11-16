import { describe, expect, it, beforeEach } from 'vitest';
import {
    ar,
    en,
    t,
    getLanguage,
    setLanguage,
    getDirection,
    getLocale,
    formatDate,
    formatTime,
    formatDateTime,
    detectBrowserLanguage,
    type TranslationKey,
} from '../../../../src/shared/i18n';

describe('i18n translation system', () => {
    beforeEach(() => {
        setLanguage('ar');
    });

    it('ensures every key in ar exists in en and every key in en exists in ar', () => {
        const arKeys = Object.keys(ar).sort();
        const enKeys = Object.keys(en).sort();

        // Check for missing keys in English
        const missingInEn = arKeys.filter((key) => !Object.hasOwn(en, key));
        expect(missingInEn, 'Keys in Arabic but missing in English').toEqual([]);

        // Check for missing keys in Arabic
        const missingInAr = enKeys.filter((key) => !Object.hasOwn(ar, key));
        expect(missingInAr, 'Keys in English but missing in Arabic').toEqual([]);

        // Ensure both key lists are exactly identical
        expect(arKeys).toEqual(enKeys);
    });

    it('translates keys for the active language', () => {
        setLanguage('ar');
        expect(getLanguage()).toBe('ar');
        expect(t('common.save')).toBe('حفظ');
        expect(getDirection()).toBe('rtl');
        expect(getLocale()).toBe('ar-EG');

        setLanguage('en');
        expect(getLanguage()).toBe('en');
        expect(t('common.save')).toBe('Save');
        expect(getDirection()).toBe('ltr');
        expect(getLocale()).toBe('en-US');
    });

    it('replaces parameter placeholders correctly', () => {
        setLanguage('en');
        expect(t('notification.new_project', { title: 'Web App' })).toBe('New Project: Web App');

        setLanguage('ar');
        expect(t('notification.new_project', { title: 'تطبيق ويب' })).toBe('مشروع جديد: تطبيق ويب');
    });

    it('falls back to Arabic when a key is missing in English', () => {
        setLanguage('en');
        // Test with a key that is missing in en dictionary temporarily
        const customKey = 'temporary_test_fallback_key';
        (ar as Record<string, string>)[customKey] = 'نص عربي بديل';

        try {
            expect(t(customKey as TranslationKey)).toBe('نص عربي بديل');
        } finally {
            delete (ar as Record<string, string>)[customKey];
        }
    });

    it('returns the key itself when missing in both dictionaries', () => {
        expect(t('completely.non.existent.key')).toBe('completely.non.existent.key');
    });

    it('formats dates and times using Intl.DateTimeFormat with active locale', () => {
        const testDate = new Date(Date.UTC(2025, 4, 15, 14, 30, 0));

        setLanguage('ar');
        const arDateFormatted = formatDate(testDate, { timeZone: 'UTC' });
        expect(arDateFormatted).toBeDefined();
        expect(arDateFormatted.length).toBeGreaterThan(0);

        setLanguage('en');
        const enDateFormatted = formatDate(testDate, {
            timeZone: 'UTC',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
        });
        expect(enDateFormatted).toContain('2025');

        const enTimeFormatted = formatTime(testDate, { timeZone: 'UTC' });
        expect(enTimeFormatted).toBeDefined();

        const enDateTimeFormatted = formatDateTime(testDate, { timeZone: 'UTC' });
        expect(enDateTimeFormatted).toContain('2025');
    });

    it('detects browser language with fallback to Arabic', () => {
        const originalNavigator = globalThis.navigator;

        try {
            // Mock navigator with English
            Object.defineProperty(globalThis, 'navigator', {
                value: { language: 'en-US' },
                configurable: true,
            });
            expect(detectBrowserLanguage()).toBe('en');

            // Mock navigator with Arabic
            Object.defineProperty(globalThis, 'navigator', {
                value: { language: 'ar-SA' },
                configurable: true,
            });
            expect(detectBrowserLanguage()).toBe('ar');

            // Mock navigator with other language (fallback to ar)
            Object.defineProperty(globalThis, 'navigator', {
                value: { language: 'fr-FR' },
                configurable: true,
            });
            expect(detectBrowserLanguage()).toBe('ar');
        } finally {
            Object.defineProperty(globalThis, 'navigator', {
                value: originalNavigator,
                configurable: true,
            });
        }
    });
});
