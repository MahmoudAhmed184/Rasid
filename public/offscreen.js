// ==========================================
// Offscreen Document — Audio Player & HTML Parsing bridge (Chrome only)
//
// bg/html-parser.js must be loaded BEFORE this script (see offscreen.html).
// The actual parsing logic lives there so it can be shared with Firefox.
// ==========================================

// Listen for messages
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'playSound') {
        playBeep().then(() => sendResponse({ success: true }));
        return true;
    } else if (message.action === 'parseJobs') {
        const jobs = parseMostaqlHTML(message.html);
        sendResponse({ success: true, jobs });
    } else if (message.action === 'parseProjectDetails') {
        const data = parseProjectDetails(message.html);
        sendResponse({ success: true, data });
    } else if (message.action === 'playTrackedSound') {
        playTrackedSound().then(() => sendResponse({ success: true }));
        return true;
    }
});

/**
 * Thin wrappers that hand off to the shared parsing functions in bg/html-parser.js.
 * bg/html-parser.js is loaded before this script via offscreen.html.
 */
function parseMostaqlHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return _parseMostaqlHTML(doc);
}

function parseProjectDetails(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return _parseProjectDetails(doc);
}

// Create a notification sound using Web Audio API (as fallback)
async function playBeep() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // Basic notification: two beeps (low then high)
        playTone(audioContext, 800, 0, 0.15);
        playTone(audioContext, 1000, 0.2, 0.15);
    } catch (error) {
        console.error('Error playing beep:', error);
    }
}

async function playTrackedSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // Tracked update: 三 sequence of beeps (high-high-low) or distinct pattern
        playTone(audioContext, 1200, 0, 0.1);
        playTone(audioContext, 1200, 0.15, 0.1);
        playTone(audioContext, 1500, 0.3, 0.2);
    } catch (error) {
        console.error('Error playing tracked sound:', error);
    }
}

function playTone(audioContext, frequency, startTime, duration) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';

    const now = audioContext.currentTime;
    gainNode.gain.setValueAtTime(0.3, now + startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + startTime + duration);

    oscillator.start(now + startTime);
    oscillator.stop(now + startTime + duration);
}
