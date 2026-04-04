// ==========================================
// bg/html-parser.js — Shared HTML parsing functions
//
// This module is used in TWO different contexts:
//   • Chrome: loaded by offscreen.html inside the Offscreen Document
//   • Firefox: loaded directly in the background event page (bg scripts array)
//
// All functions accept a pre-parsed `document` object so the caller
// controls whether to use DOMParser or the live page document.
// ==========================================

/**
 * Parse Mostaql job listings from a parsed HTML document.
 * @param {Document} doc - A document parsed from Mostaql HTML
 * @returns {Array<Object>} Array of job objects
 */
function _parseMostaqlHTML(doc) {
  const jobs = [];
  const seenIds = new Set();

  // Strategy 0: Mostaql list-group-item layout (dashboard/projects page)
  const listItems = doc.querySelectorAll('.list-group-item');
  listItems.forEach(item => {
    const link = item.querySelector('a[href*="/project/"]');
    if (!link) return;
    const href = link.getAttribute('href');
    const idMatch = href.match(/\/project\/(\d+)/);
    if (!idMatch) return;
    const id = idMatch[1];
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const title = link.textContent.trim();
    const url = href.startsWith('http') ? href : 'https://mostaql.com' + href;

    // Client/poster name (element with fa-user icon)
    const userIcon = item.querySelector('.fa-user');
    const poster = userIcon ? userIcon.parentElement.textContent.replace(/\s+/g, ' ').trim() : '';

    // Time ago
    const timeEl = item.querySelector('time');
    const time = timeEl ? timeEl.textContent.replace(/\s+/g, ' ').trim() : '';
    const postedAt = timeEl ? (timeEl.getAttribute('datetime') || '') : '';

    // Bids count (third li in .project__meta)
    const metaItems = item.querySelectorAll('.project__meta li');
    const bidsText = metaItems.length >= 3 ? metaItems[2].textContent.replace(/\s+/g, ' ').trim() : '';

    jobs.push({ id, title, url, poster, time, postedAt, bidsText, budget: 'غير محدد' });
  });

  // Strategy 1: Table Rows (Classic View)
  const rows = doc.querySelectorAll('tr');
  rows.forEach(row => {
    const link = row.querySelector('a[href*="/project/"]');
    if (link) {
      const href = link.getAttribute('href');
      const idMatch = href.match(/\/project\/(\d+)/);
      if (idMatch) {
        const id = idMatch[1];
        if (!seenIds.has(id)) {
          const title = link.textContent.trim();
          const budgetEl = row.querySelector('td:nth-child(4), [class*="budget"]');
          const budget = budgetEl ? budgetEl.textContent.trim() : 'غير محدد';
          const timeEl = row.querySelector('td:nth-child(5n), .timeSince, [class*="date"]');
          const time = timeEl ? timeEl.textContent.trim() : '';
          seenIds.add(id);
          jobs.push({
            id, title, budget, time, postedAt: '', poster: '', bidsText: '',
            url: href.startsWith('http') ? href : 'https://mostaql.com' + href
          });
        }
      }
    }
  });

  // Strategy 2: Cards (Grid View)
  const cards = doc.querySelectorAll('.card, .project-card, div[class*="project"]');
  cards.forEach(card => {
    const link = card.querySelector('a[href*="/project/"]');
    if (link) {
      const href = link.getAttribute('href');
      const idMatch = href.match(/\/project\/(\d+)/);
      if (idMatch) {
        const id = idMatch[1];
        if (!seenIds.has(id)) {
          seenIds.add(id);
          const timeEl = card.querySelector('.timeSince, [class*="date"]');
          jobs.push({
            id, title: link.textContent.trim(), budget: 'غير محدد',
            time: timeEl ? timeEl.textContent.trim() : '', postedAt: '', poster: '', bidsText: '',
            url: href.startsWith('http') ? href : 'https://mostaql.com' + href
          });
        }
      }
    }
  });

  // Strategy 3: Fallback — All Links
  if (jobs.length === 0) {
    const allLinks = doc.querySelectorAll('a[href*="/project/"]');
    allLinks.forEach(link => {
      const href = link.getAttribute('href');
      const idMatch = href.match(/\/project\/(\d+)/);
      if (idMatch) {
        const id = idMatch[1];
        // Use textContent for parsed documents (innerText is undefined in DOMParser output)
        const text = (link.textContent || link.innerText || '').trim();
        if (!seenIds.has(id) && text.length > 5) {
          seenIds.add(id);
          jobs.push({
            id, title: text, budget: '', postedAt: '', poster: '', bidsText: '',
            url: href.startsWith('http') ? href : 'https://mostaql.com' + href
          });
        }
      }
    });
  }

  return jobs;
}

/**
 * Parse project detail metadata from a parsed HTML document.
 * @param {Document} doc - A document parsed from a Mostaql project page
 * @returns {Object} Project details object
 */
function _parseProjectDetails(doc) {
  // Extract Status
  const statusLabel = doc.querySelector(
    '.label-prj-open, .label-prj-closed, .label-prj-completed, ' +
    '.label-prj-cancelled, .label-prj-underway, .label-prj-processing'
  );
  const status = statusLabel ? statusLabel.textContent.trim() : 'غير معروف';

  // Extract Description
  const descriptionEl = doc.querySelector('.project-post__body');
  const description = descriptionEl ? descriptionEl.textContent.trim() : '';

  // Extract Metadata
  let communications = '0';
  let hiringRate = '';
  let duration = 'غير محددة';
  let budget = '';
  let registrationDate = '';

  const metaRows = doc.querySelectorAll('.meta-row, .table-meta tr');
  metaRows.forEach(row => {
    const text = row.textContent;
    const val = row.querySelector('.meta-value, td:last-child');
    if (!val) return;

    if (text.includes('التواصلات الجارية')) {
      communications = val.textContent.trim();
    } else if (text.includes('معدل التوظيف')) {
      hiringRate = val.textContent.trim();
    } else if (text.includes('مدة التنفيذ')) {
      duration = val.textContent.trim();
    } else if (text.includes('الميزانية')) {
      budget = val.textContent.trim();
    } else if (text.includes('تاريخ التسجيل')) {
      registrationDate = val.textContent.trim();
    }
  });

  return { status, communications, hiringRate, description, duration, budget, registrationDate };
}
