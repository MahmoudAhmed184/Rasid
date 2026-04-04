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
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      // _parseMostaqlHTML is defined in bg/html-parser.js (loaded first)
      return _parseMostaqlHTML(doc);
    } catch (e) {
      console.error('Firefox Parse Error (parseJobsOffscreen):', e);
      return [];
    }
  }

  // ── Chrome path (unchanged) ───────────────────────────────────────────────
  try {
    await setupOffscreenDocument();
    await new Promise(r => setTimeout(r, 100));

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'parseJobs', html: html }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Parse Error:', chrome.runtime.lastError);
          resolve([]);
        } else if (response && response.success) {
          resolve(response.jobs);
        } else {
          resolve([]);
        }
      });
      setTimeout(() => resolve([]), 3000);
    });
  } catch (e) {
    console.error('Offscreen Parse Error:', e);
    return [];
  }
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
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      // _parseProjectDetails is defined in bg/html-parser.js
      return _parseProjectDetails(doc);
    } catch (e) {
      console.error('Firefox Parse Error (parseTrackedDataOffscreen):', e);
      return null;
    }
  }

  // ── Chrome path (unchanged) ───────────────────────────────────────────────
  try {
    await setupOffscreenDocument();
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'parseTrackedData', html: html }, (response) => {
        if (response && response.success) {
          resolve(response.data);
        } else {
          resolve(null);
        }
      });
      setTimeout(() => resolve(null), 3000);
    });
  } catch (e) {
    return null;
  }
}
