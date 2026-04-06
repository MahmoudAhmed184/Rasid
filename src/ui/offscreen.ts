import { browser } from 'wxt/browser';

import { playNotificationAudioDirect } from '../core/audio';
import {
    isOffscreenProtocolMessage,
    type OffscreenTaskEnvelope,
} from '../core/offscreen-manager';
import { parseJobsFromHtml, parseProjectDetailsFromHtml } from '../core/dom';

let initialized = false;

async function handleTask(message: OffscreenTaskEnvelope) {
    switch (message.task) {
        case 'audio.play-notification':
            await playNotificationAudioDirect();
            return undefined;
        case 'dom.parse-jobs':
            return parseJobsFromHtml(message.payload.html);
        case 'dom.parse-project-details':
            return parseProjectDetailsFromHtml(message.payload.html);
        default:
            return undefined;
    }
}

export function initOffscreen(): void {
    if (initialized) {
        return;
    }

    initialized = true;

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!isOffscreenProtocolMessage(message)) {
            return undefined;
        }

        // The offscreen page is the Chrome execution target for audio and DOM work,
        // so it responds directly to the worker's task envelopes. Chrome MV3
        // requires callback-style async replies for broad version compatibility.
        void handleTask(message).then(sendResponse);

        return true;
    });
}
