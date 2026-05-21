import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

import { createBackgroundApp } from '../src/app/background/create-background-services';
import { registerBackgroundRuntimeMessageBus } from '../src/app/background/background-message-bus';

function runTask(label: string, task: () => Promise<void>): void {
    void task().catch((error) => {
        console.error(`[background] ${label} failed`, error);
    });
}

export default defineBackground({
    type: 'module',
    main() {
        const backgroundApp = createBackgroundApp();

        backgroundApp.notifications.registerHandlers();

        browser.runtime.onInstalled.addListener(() => {
            runTask('runtime-installed-bootstrap', () =>
                backgroundApp.ensureReady('runtime-installed')
            );
        });

        browser.runtime.onStartup.addListener(() => {
            runTask('runtime-startup-bootstrap', () =>
                backgroundApp.ensureReady('runtime-startup')
            );
        });

        browser.alarms.onAlarm.addListener((alarm) => {
            runTask(`alarm:${alarm.name}`, async () => {
                await backgroundApp.ensureReady(`alarm:${alarm.name}`);
                await backgroundApp.signalr.handleAlarm(alarm);
            });
        });

        registerBackgroundRuntimeMessageBus({
            ensureReady: backgroundApp.ensureReady,
            handlers: backgroundApp.runtimeMessageHandlers,
        });

        runTask('worker-start-bootstrap', () => backgroundApp.ensureReady('worker-start'));
    },
});
