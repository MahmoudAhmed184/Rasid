import { browser } from 'wxt/browser';

import { ALARM_NAMES, SIGNALR_HEALTH_INTERVAL_MINUTES } from './constants';
import type { DesiredTransport, SignalREffect } from './signalr-reducer';
import { clampPollingInterval } from '../../models/settings';

export function createRecurringSignalREffects(
    desiredTransport: DesiredTransport,
    pollingInterval: number
): readonly SignalREffect[] {
    if (desiredTransport === 'disabled') {
        return [
            { kind: 'clear-alarm', name: ALARM_NAMES.jobPolling },
            { kind: 'clear-alarm', name: ALARM_NAMES.signalrHealth },
            { kind: 'clear-alarm', name: ALARM_NAMES.signalrLease },
            { kind: 'clear-alarm', name: ALARM_NAMES.signalrReconnect },
        ];
    }

    const effects: SignalREffect[] = [
        {
            kind: 'schedule-alarm',
            name: ALARM_NAMES.jobPolling,
            periodInMinutes: clampPollingInterval(pollingInterval),
        },
    ];

    if (desiredTransport === 'polling') {
        effects.push(
            { kind: 'clear-alarm', name: ALARM_NAMES.signalrHealth },
            { kind: 'clear-alarm', name: ALARM_NAMES.signalrLease },
            { kind: 'clear-alarm', name: ALARM_NAMES.signalrReconnect }
        );
        return effects;
    }

    effects.push({
        kind: 'schedule-alarm',
        name: ALARM_NAMES.signalrHealth,
        periodInMinutes: SIGNALR_HEALTH_INTERVAL_MINUTES,
    });

    return effects;
}

export async function executeSignalREffects(effects: readonly SignalREffect[]): Promise<void> {
    for (const effect of effects) {
        if (effect.kind === 'clear-alarm') {
            await browser.alarms.clear(effect.name);
            continue;
        }

        if ('periodInMinutes' in effect) {
            await browser.alarms.create(effect.name, {
                periodInMinutes: effect.periodInMinutes,
            });
            continue;
        }

        await browser.alarms.create(effect.name, {
            delayInMinutes: effect.delayInMinutes,
        });
    }
}
