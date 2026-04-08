import type { ExtensionStorage } from '../extension-storage';
import type { ExtensionStats } from '../../../models/monitoring';
import type { RuntimeState } from '../../../models/runtime';
import type { NotificationMode } from '../../../models/settings';

export interface MonitoringOverview {
    readonly stats: ExtensionStats;
    readonly seenJobsCount: number;
    readonly notificationsEnabled: boolean;
    readonly runtime: RuntimeState;
    readonly notificationMode: NotificationMode;
}

export interface MonitoringRepository {
    getOverview(): Promise<MonitoringOverview>;
    getNotificationsEnabled(): Promise<boolean>;
    setNotificationsEnabled(enabled: boolean): Promise<boolean>;
}

function cloneRuntimeState(runtime: RuntimeState): RuntimeState {
    return {
        ...runtime,
        signalr: {
            ...runtime.signalr,
        },
    };
}

export function createMonitoringRepository(storage: ExtensionStorage): MonitoringRepository {
    return {
        async getOverview() {
            const snapshot = await storage.getSnapshot();

            return {
                stats: { ...snapshot.stats },
                seenJobsCount: snapshot.seenJobs.length,
                notificationsEnabled: snapshot.notificationsEnabled,
                runtime: cloneRuntimeState(snapshot.runtime),
                notificationMode: snapshot.settings.notificationMode,
            };
        },
        getNotificationsEnabled() {
            return storage.getNotificationsEnabled();
        },
        setNotificationsEnabled(enabled) {
            return storage.setNotificationsEnabled(enabled);
        },
    };
}
