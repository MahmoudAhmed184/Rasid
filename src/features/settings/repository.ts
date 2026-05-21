import type { ExtensionStorage } from '../../shared/storage/extension-storage';
import type { ExtensionSettings } from '../../entities/settings/model';

export interface SettingsRepository {
    get(): Promise<ExtensionSettings>;
    save(settings: ExtensionSettings): Promise<ExtensionSettings>;
    update(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings>;
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
    };
}
