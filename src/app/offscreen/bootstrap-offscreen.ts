import { browser } from 'wxt/browser';

import { createZipObjectUrl, revokeZipObjectUrl } from '../../features/downloads/zip-downloads';
import { playNotificationAudioDirect } from '../../features/notifications/audio-service';
import {
    createOffscreenTransportFailure,
    createOffscreenTransportSuccess,
    dispatchOffscreenTask,
    isOffscreenProtocolMessage,
    type OffscreenTaskHandlerMap,
    type OffscreenTaskEnvelope,
} from '../../features/offscreen/manager';
import { getPlatformMonitoringHtmlParser } from '../../platforms/registry';

let initialized = false;

const offscreenTaskHandlers = {
    async 'audio.play-notification'() {
        await playNotificationAudioDirect();
        return { success: true };
    },
    'downloads.create-zip-url': (payload) => createZipObjectUrl(payload.filename, payload.files),
    'downloads.revoke-object-url': (payload) => {
        revokeZipObjectUrl(payload.objectUrl);
        return { success: true };
    },
    'monitoring.parse-listing-html': (payload) =>
        getPlatformMonitoringHtmlParser(payload.platformId).parseListingHtml(payload.html),
    'monitoring.parse-project-html': (payload) =>
        getPlatformMonitoringHtmlParser(payload.platformId).parseProjectHtml(payload.html),
} satisfies OffscreenTaskHandlerMap;

function handleTask(message: OffscreenTaskEnvelope) {
    return dispatchOffscreenTask(offscreenTaskHandlers, message);
}

function isTrustedOffscreenSender(sender: Browser.runtime.MessageSender): boolean {
    if (sender.id && sender.id !== browser.runtime.id) {
        return false;
    }

    return sender.tab === undefined;
}

export function initOffscreen(): void {
    if (initialized) {
        return;
    }

    initialized = true;

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!isOffscreenProtocolMessage(message)) {
            return undefined;
        }

        if (!isTrustedOffscreenSender(sender)) {
            sendResponse(
                createOffscreenTransportFailure(
                    message.task,
                    'Untrusted offscreen message sender.',
                    message.requestId
                )
            );
            return undefined;
        }

        // The offscreen page is the Chrome execution target for audio and DOM work,
        // so it responds directly to the worker's task envelopes. Chrome MV3
        // requires callback-style async replies for broad version compatibility.
        void Promise.resolve()
            .then(() => handleTask(message))
            .then(
                (result: Awaited<ReturnType<typeof handleTask>>) => {
                    sendResponse(
                        createOffscreenTransportSuccess(message.task, result, message.requestId)
                    );
                },
                (error: unknown) => {
                    sendResponse(
                        createOffscreenTransportFailure(
                            message.task,
                            error instanceof Error ? error.message : String(error),
                            message.requestId
                        )
                    );
                }
            );

        return true;
    });
}
