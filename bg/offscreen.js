// ==========================================
// bg/offscreen.js — Offscreen document bridge (cross-browser)
//
// Chrome: background runs as a service worker — no DOMParser available.
//   HTML parsing and audio are delegated to an Offscreen Document.
//
// Firefox: background runs as an event page — DOMParser IS available.
//   We call _parseMostaqlHTML() and _parseProjectDetails() directly
//   (defined in bg/html-parser.js, loaded earlier in the scripts array).
//   No offscreen document is created or needed.
//
// Detection: chrome.offscreen is only defined in Chrome MV3.
// ==========================================

const _IS_FIREFOX = typeof chrome.offscreen === 'undefined';

// ─── Chrome-only: setup the offscreen document ────────────────────────────────

async function setupOffscreenDocument() {
  // No-op on Firefox — this function is called from Chrome paths only,
  // but guard anyway for safety.
  if (_IS_FIREFOX) return;

  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existing.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK', 'DOM_PARSER'],
      justification: 'Parsing HTML and Playing Audio'
    });
  }
}

async function sendOffscreenRequest(message, fallbackValue, transformResponse) {
  try {
    await setupOffscreenDocument();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const response = await Promise.race([
      browserApi.runtime.sendMessage(message),
      new Promise((resolve) => setTimeout(() => resolve(null), 3000))
    ]);

    return transformResponse(response);
  } catch (error) {
    console.error(`Offscreen request failed for ${message.action}:`, error);
    return fallbackValue;
  }
}

function parseHtmlInBackground(html, parser, errorLabel, fallbackValue) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return parser(doc);
  } catch (error) {
    console.error(errorLabel, error);
    return fallbackValue;
  }
}

// ─── parseJobsOffscreen ───────────────────────────────────────────────────────

/**
 * Parse Mostaql job listings from raw HTML.
 * Firefox: uses DOMParser directly in the background event page.
 * Chrome:  delegates to the Offscreen Document via message passing.
 *
 * @param {string} html - Raw HTML from Mostaql
 * @returns {Promise<Array>} Parsed job objects
 */
async function parseJobsOffscreen(html) {
  // ── Firefox path ──────────────────────────────────────────────────────────
  if (_IS_FIREFOX) {
    return parseHtmlInBackground(
      html,
      _parseMostaqlHTML,
      'Firefox Parse Error (parseJobsOffscreen):',
      []
    );
  }

  // ── Chrome path (unchanged) ───────────────────────────────────────────────
  return sendOffscreenRequest(
    { action: 'parseJobs', html },
    [],
    (response) => (response && response.success ? response.jobs : [])
  );
}

// ─── parseTrackedDataOffscreen ────────────────────────────────────────────────

/**
 * Parse tracked project detail metadata from raw HTML.
 * Firefox: uses DOMParser directly.
 * Chrome:  delegates to the Offscreen Document.
 *
 * @param {string} html - Raw HTML from a Mostaql project page
 * @returns {Promise<Object|null>} Parsed project details, or null on failure
 */
async function parseTrackedDataOffscreen(html) {
  // ── Firefox path ──────────────────────────────────────────────────────────
  if (_IS_FIREFOX) {
    return parseHtmlInBackground(
      html,
      _parseProjectDetails,
      'Firefox Parse Error (parseTrackedDataOffscreen):',
      null
    );
  }

  // ── Chrome path (unchanged) ───────────────────────────────────────────────
  return sendOffscreenRequest(
    { action: 'parseTrackedData', html },
    null,
    (response) => (response && response.success ? response.data : null)
  );
}

// ─── parseProjectDetailsOffscreen ─────────────────────────────────────────────

/**
 * Parse project details from raw HTML.
 * Firefox: parses directly in the background event page.
 * Chrome: delegates to the Offscreen Document.
 *
 * @param {string} html - Raw HTML from a Mostaql project page
 * @returns {Promise<Object|null>} Parsed project details, or null on failure
 */
async function parseProjectDetailsOffscreen(html) {
  if (_IS_FIREFOX) {
    return parseHtmlInBackground(
      html,
      _parseProjectDetails,
      'Firefox Parse Error (parseProjectDetailsOffscreen):',
      null
    );
  }

  return sendOffscreenRequest(
    { action: 'parseProjectDetails', html },
    null,
    (response) => (response && response.success ? response.data : null)
  );
}
