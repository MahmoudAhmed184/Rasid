import type { ExtensionStorage } from '../../shared/storage/extension-storage';
import type { ExtensionSettings } from '../../entities/settings/model';
import type { AppLanguage } from '../../shared/i18n/types';

export interface SettingsRepository {
    get(): Promise<ExtensionSettings>;
    save(settings: ExtensionSettings): Promise<ExtensionSettings>;
    update(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings>;
    getLanguage(): Promise<AppLanguage>;
    setLanguage(language: AppLanguage): Promise<AppLanguage>;
}

export function createSettingsRepository(storage: ExtensionStorage): SettingsRepository {
    return {
        get() {
            return storage.getSettings();
        },
        save(settings) {
            return storage.updateSettings(settings);
        },
        update(patch) {
            return storage.updateSettings(patch);
        },
        getLanguage() {
            return storage.getLanguage();
        },
        setLanguage(language) {
            return storage.setLanguage(language);
        },
    };
}
