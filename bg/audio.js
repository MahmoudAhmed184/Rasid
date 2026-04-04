// ==========================================
// bg/audio.js — Sound playback via offscreen document (Chrome)
//               or Web Audio API directly (Firefox)
//
// Depends on: bg/offscreen.js (_IS_FIREFOX, setupOffscreenDocument)
//
// Firefox event pages have full access to AudioContext, so we play
// the notification beeps directly without any offscreen document.
// Chrome service workers lack AudioContext, so we keep the existing
// offscreen-document delegation path unchanged.
// ==========================================

// ─── Firefox path: direct Web Audio API ──────────────────────────────────────

/**
 * Play a single tone using the Web Audio API.
 * Used by the Firefox direct playback path.
 * @param {AudioContext} audioContext
 * @param {number} frequency  - Hz
 * @param {number} startTime  - offset in seconds from audioContext.currentTime
 * @param {number} duration   - length in seconds
 */
function _playToneDirectly(audioContext, frequency, startTime, duration) {
  const oscillator = audioContext.createOscillator();
  const gainNode   = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = frequency;
  oscillator.type = 'sine';

  const now = audioContext.currentTime;
  gainNode.gain.setValueAtTime(0.3, now + startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + startTime + duration);

  oscillator.start(now + startTime);
  oscillator.stop(now + startTime + duration);

  return oscillator;
}

/**
 * Play the standard new-job notification beep (two ascending tones).
 * Firefox only.
 */
async function _playBeepDirectly() {
  try {
    const audioContext = new AudioContext();
    if (audioContext.state === 'suspended') await audioContext.resume();
    _playToneDirectly(audioContext, 800,  0,   0.15);
    const lastOsc = _playToneDirectly(audioContext, 1000, 0.2, 0.15);

    lastOsc.onended = () => {
      if (audioContext.state !== 'closed') {
        audioContext.close().catch(console.error);
      }
    };
  } catch (error) {
    console.error('Firefox Audio Error (playBeepDirectly):', error);
  }
}

/**
 * Play the tracked-project update beep (high-high-higher sequence).
 * Firefox only.
 */
async function _playTrackedBeepDirectly() {
  try {
    const audioContext = new AudioContext();
    if (audioContext.state === 'suspended') await audioContext.resume();
    _playToneDirectly(audioContext, 1200, 0,    0.1);
    _playToneDirectly(audioContext, 1200, 0.15, 0.1);
    const lastOsc = _playToneDirectly(audioContext, 1500, 0.3,  0.2);

    lastOsc.onended = () => {
      if (audioContext.state !== 'closed') {
        audioContext.close().catch(console.error);
      }
    };
  } catch (error) {
    console.error('Firefox Audio Error (playTrackedBeepDirectly):', error);
  }
}

// ─── Chrome path: delegate to offscreen document (unchanged) ─────────────────

/**
 * Send an action to the Offscreen Document for audio playback.
 * Chrome only.
 * @param {string} action - 'playSound' | 'playTrackedSound'
 */
async function triggerOffscreenAction(action) {
  try {
    await setupOffscreenDocument();
    await new Promise(r => setTimeout(r, 200));

    await browserApi.runtime.sendMessage({ action: action });
  } catch (error) {
    console.error(`Error in triggerOffscreenAction (${action}):`, error);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Play the new-job notification sound.
 * Routes to the correct implementation based on browser.
 */
async function playSound() {
  if (_IS_FIREFOX) {
    await _playBeepDirectly();
  } else {
    await triggerOffscreenAction('playSound');
  }
}

/**
 * Play the tracked-project update sound.
 * Routes to the correct implementation based on browser.
 */
async function playTrackedSound() {
  if (_IS_FIREFOX) {
    await _playTrackedBeepDirectly();
  } else {
    await triggerOffscreenAction('playTrackedSound');
  }
}
