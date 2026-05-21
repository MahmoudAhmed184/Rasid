import { browser } from 'wxt/browser';

import {
    createBackgroundTransportFailure,
    createBackgroundTransportSuccess,
    dispatchBackgroundMessage,
    isBackgroundRuntimeMessage,
    type BackgroundMessageHandlerMap,
} from './background-messages';
import { isOffscreenProtocolMessage } from '../../shared/browser/offscreen/manager';

interface BackgroundMessageBusOptions {
    readonly ensureReady: (reason: string) => Promise<void>;
    readonly handlers: BackgroundMessageHandlerMap;
    readonly logger?: Pick<Console, 'error'>;
}

export function registerBackgroundRuntimeMessageBus(options: BackgroundMessageBusOptions): void {
    const logger = options.logger ?? console;

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        // Offscreen RPC is answered by the offscreen context itself; the worker must
        // ignore the envelope synchronously so it does not intercept its own request.
        if (isOffscreenProtocolMessage(message)) {
            return undefined;
        }

        if (!isBackgroundRuntimeMessage(message)) {
            return undefined;
        }

        void (async () => {
            try {
                await options.ensureReady(`message:${message.action}`);

                sendResponse(
                    createBackgroundTransportSuccess(
                        message.action,
                        await dispatchBackgroundMessage(options.handlers, message)
                    )
                );
            } catch (error) {
                logger.error('[background] runtime message failed', error);
                sendResponse(
                    createBackgroundTransportFailure(
                        message.action,
                        error instanceof Error ? error.message : String(error)
                    )
                );
            }
        })();

        return true;
    });
}
