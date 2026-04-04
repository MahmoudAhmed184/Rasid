// ==========================================
// bg/offscreen-firefox.js — Firefox background parsing bridge
//
// Firefox MV3 uses a background page with DOMParser support, so parsing can
// happen directly without Chrome's offscreen document APIs.
// ==========================================

const _IS_FIREFOX = true;

async function setupOffscreenDocument() {
  // Firefox does not need an offscreen document.
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

async function parseJobsOffscreen(html) {
  return parseHtmlInBackground(
    html,
    _parseMostaqlHTML,
    'Firefox Parse Error (parseJobsOffscreen):',
    []
  );
}

async function parseTrackedDataOffscreen(html) {
  return parseHtmlInBackground(
    html,
    _parseProjectDetails,
    'Firefox Parse Error (parseTrackedDataOffscreen):',
    null
  );
}

async function parseProjectDetailsOffscreen(html) {
  return parseHtmlInBackground(
    html,
    _parseProjectDetails,
    'Firefox Parse Error (parseProjectDetailsOffscreen):',
    null
  );
}
