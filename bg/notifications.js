// ==========================================
// bg/notifications.js — Notification display and interaction (cross-browser)
// Depends on: bg/filters.js (parseDurationDays)
//             bg/offscreen.js (_IS_FIREFOX) — loaded before this script
//
// Firefox differences:
//   - notifications.create() does NOT support `buttons` or `requireInteraction`
//   - chrome.notifications.onButtonClicked does NOT exist
//   - notification body clicks (onClicked) work identically on both browsers
//
// Strategy: build a base options object, then conditionally add Chrome-only
// properties. Wrap the onButtonClicked listener in a feature-detection guard.
// _IS_FIREFOX is defined in bg/offscreen.js which loads before this file.
// ==========================================

// --- showNotification ---

function showNotification(jobs) {
  const job   = jobs[0];
  const title = jobs.length === 1
    ? 'مشروع جديد على مستقل'
    : `${jobs.length} مشاريع جديدة على مستقل`;

  let message = '';
  if (jobs.length === 1) {
    const budget = job.budget ? `[ ${job.budget} ]` : '';
    const desc   = job.description
      ? `\n\n${job.description.substring(0, 150)}${job.description.length > 150 ? '...' : ''}`
      : '';
    message = `${job.title} ${budget}${desc}`;
  } else {
    message = `${job.title}\nو ${jobs.length - 1} مشاريع أخرى`;
  }

  // Base options: supported by both Chrome and Firefox
  const options = {
    type:     'basic',
    iconUrl:  'icons/icon128.png',
    title,
    message,
    priority: 2
  };

  // Chrome-only properties - not supported in Firefox
  if (!_IS_FIREFOX) {
    options.requireInteraction = true;
    options.buttons = [
      { title: 'قدّم الآن' },
      { title: 'فتح المشروع' }
    ];
  }

  chrome.notifications.create(options, (notificationId) => {
    chrome.storage.local.set({ [`notification_${notificationId}`]: job });
  });
}

// --- showTrackedNotification ---

function showTrackedNotification(project, changeMsg) {
  const options = {
    type:     'basic',
    iconUrl:  'icons/icon128.png',
    title:    `تحديث في مشروع: ${project.title}`,
    message:  changeMsg,
    priority: 2
  };

  // Chrome-only
  if (!_IS_FIREFOX) {
    options.requireInteraction = true;
  }

  chrome.notifications.create(options, (notificationId) => {
    chrome.storage.local.set({ [`notification_${notificationId}`]: project.url });
  });
}

// --- Helpers ---

function parseMinBudgetValue(budgetText) {
  if (!budgetText) return 0;
  const matches = budgetText.replace(/,/g, '').match(/\d+(\.\d+)?/g);
  if (!matches) return 0;
  return Math.min(...matches.map(m => parseFloat(m)));
}

// --- Notification click listeners ---

// Body click - supported identically on Chrome and Firefox.
// On Firefox this is the ONLY way to interact with a notification
// (no action buttons), so we ensure it always opens the project URL.
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.storage.local.get([`notification_${notificationId}`], (data) => {
    const job = data[`notification_${notificationId}`];
    if (job) {
      chrome.tabs.create({ url: job.url });
      chrome.storage.local.remove([`notification_${notificationId}`]);
    }
  });
});

// Button clicks - Chrome-only feature.
// Guard with typeof to avoid a ReferenceError on Firefox where
// chrome.notifications.onButtonClicked is undefined.
if (typeof chrome.notifications.onButtonClicked !== 'undefined') {
  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    chrome.storage.local.get([`notification_${notificationId}`], (data) => {
      const job = data[`notification_${notificationId}`];
      if (!job) return;

      if (buttonIndex === 0) {
        // "قدّم الآن" - open project with autofill flag
        console.log(`Apply Now clicked for job ${job.id}`);
        chrome.storage.local.get(['proposalTemplate'], (settingsData) => {
          const minBudget    = parseMinBudgetValue(job.budget);
          const durationDays = parseDurationDays(job.duration || '');

          const autofillData = {
            projectId: job.id,
            amount:    minBudget,
            duration:  durationDays,
            proposal:  settingsData.proposalTemplate || '',
            timestamp: Date.now()
          };

          chrome.storage.local.set({ 'mostaql_pending_autofill': autofillData }, () => {
            const urlWithFlag = job.url + (job.url.includes('?') ? '&' : '?') + 'mostaql_autofill=true';
            chrome.tabs.create({ url: urlWithFlag });
          });
        });
      } else {
        // "فتح المشروع" - open project directly
        chrome.tabs.create({ url: job.url });
      }

      chrome.storage.local.remove([`notification_${notificationId}`]);
    });
  });
}
