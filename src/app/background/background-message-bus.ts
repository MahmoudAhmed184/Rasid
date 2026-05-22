import { browser } from 'wxt/browser';

import {
    createBackgroundTransportFailure,
    createBackgroundTransportSuccess,
    dispatchBackgroundMessage,
    getBackgroundMessageAction,
    isBackgroundRuntimeMessage,
    type BackgroundMessageHandlerMap,
} from './background-messages';
import { isOffscreenProtocolMessage } from '../../features/offscreen/manager';
import { isAllowedPlatformHostname } from '../../entities/platform/url';

const TRUSTED_CONTENT_SCRIPT_HOSTS = [
    'chat.openai.com',
    'chatgpt.com',
    'khamsat.com',
    'mostaql.com',
    'nafezly.com',
] as const;

interface BackgroundMessageBusOptions {
    readonly ensureReady: (reason: string) => Promise<void>;
    readonly handlers: BackgroundMessageHandlerMap;
    readonly logger?: Pick<Console, 'error'>;
}

function isTrustedRuntimeSender(sender: Browser.runtime.MessageSender): boolean {
    if (sender.id && sender.id !== browser.runtime.id) {
        return false;
    }

    if (!sender.url) {
        return true;
    }

    try {
        const url = new URL(sender.url);

        if (sender.url.startsWith(browser.runtime.getURL(''))) {
            return true;
        }

        return (
            url.protocol === 'https:' &&
            isAllowedPlatformHostname(url.hostname, TRUSTED_CONTENT_SCRIPT_HOSTS)
        );
    } catch {
        return false;
    }
}

export function registerBackgroundRuntimeMessageBus(options: BackgroundMessageBusOptions): void {
    const logger = options.logger ?? console;

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Offscreen RPC is answered by the offscreen context itself; the worker must
        // ignore the envelope synchronously so it does not intercept its own request.
        if (isOffscreenProtocolMessage(message)) {
            return undefined;
        }

        const action = getBackgroundMessageAction(message);

        if (!action) {
            return undefined;
        }

        if (!isTrustedRuntimeSender(sender)) {
            sendResponse(createBackgroundTransportFailure(action, 'Untrusted message sender.'));
            return undefined;
        }

        if (!isBackgroundRuntimeMessage(message)) {
            sendResponse(createBackgroundTransportFailure(action, 'Invalid message payload.'));
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
