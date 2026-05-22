import { isSignalRFallbackState } from '../../entities/runtime/model';
import type { MonitoringRepository } from '../../features/monitoring/repository';

interface ConnectionStatusPanelDependencies {
    readonly monitoringRepository: Pick<MonitoringRepository, 'getOverview'>;
}

function setStatusIcon(
    root: Document,
    container: HTMLElement,
    tone: string,
    iconClass: string
): void {
    const icon = root.createElement('i');
    icon.className = `fas ${iconClass}`;
    container.className = `stat-icon ${tone}`;
    container.replaceChildren(icon);
}

export function createConnectionStatusPanel(
    root: Document,
    deps: ConnectionStatusPanelDependencies
) {
    async function load() {
        const overview = await deps.monitoringRepository.getOverview();

        const statusEl = root.getElementById('stat-connection');
        const iconEl = root.getElementById('connection-status-icon');

        if (!(statusEl instanceof HTMLElement) || !(iconEl instanceof HTMLElement)) {
            return;
        }

        const mode = overview.notificationMode;
        const runtimeSignalr = overview.runtime.signalr;
        const isConnected = runtimeSignalr.status === 'connected';
        const isFallbackActive = isSignalRFallbackState(runtimeSignalr);

        if (mode === 'polling') {
            statusEl.textContent = 'استعلام دوري';
            setStatusIcon(root, iconEl, 'blue', 'fa-sync-alt');
            return;
        }

        if (isConnected) {
            statusEl.textContent = 'اتصال مباشر';
            setStatusIcon(root, iconEl, 'green', 'fa-wifi');
            return;
        }

        if (isFallbackActive) {
            statusEl.textContent = 'وضع الاستعلام';
            setStatusIcon(root, iconEl, 'orange', 'fa-sync-alt');
            return;
        }

        statusEl.textContent = 'غير متصل';
        setStatusIcon(root, iconEl, 'purple', 'fa-plug');
    }

    return {
        load,
    };
}
