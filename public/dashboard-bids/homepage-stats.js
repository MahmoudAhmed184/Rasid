// ==========================================
// dashboard-bids/homepage-stats.js — Mostaql homepage bid quota scraping
// ==========================================

/**
 * Scrapes the Mostaql homepage to get the currently available bid count.
 * @returns {Promise<Object>} - { available }
 */
async function fetchMostaqlHomepageStats() {
    const defaults = { available: '-' };

    try {
        const response = await fetch('https://mostaql.com/', {
            credentials: 'include',
            headers: { Accept: 'text/html' },
        });
        if (!response.ok) {
            return defaults;
        }

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        return parseHomepageBidStats(doc, defaults);
    } catch (error) {
        console.warn('Homepage stats fetch failed:', error.message);
        return defaults;
    }
}

/**
 * Parses bid stats from the Mostaql homepage DOM.
 * @param {Document} doc
 * @param {Object} defaults
 * @returns {Object}
 */
function parseHomepageBidStats(doc, defaults) {
    const result = { ...defaults };

    const availableLink = doc.querySelector('a[href*="dashboard/bids"] .text-alpha');
    if (availableLink) {
        result.available = parseInt(availableLink.textContent.trim(), 10) || 0;
    }

    return result;
}
