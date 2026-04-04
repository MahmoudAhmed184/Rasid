// ==========================================
// dashboard/init.js — Entry point: data loading & DOMContentLoaded
// Depends on: all other dashboard/* modules
// ==========================================

async function loadData() {
    const [data, trackedData] = await Promise.all([
        browserApi.storage.local.get(['settings', 'stats', 'prompts', 'proposalTemplate', 'seenJobs']),
        browserApi.storage.local.get(['trackedProjects'])
    ]);

    if (data.stats) {
        const todayCount = parseInt(data.stats.todayCount);
        const el = document.getElementById('stat-today');
        if (el) el.textContent = isNaN(todayCount) ? 0 : todayCount;

        const lastTime = data.stats.lastCheck
            ? new Date(data.stats.lastCheck).toLocaleTimeString('ar-EG')
            : '-';
        const lastEl = document.getElementById('stat-last-time');
        if (lastEl) lastEl.textContent = lastTime;
    }

    if (data.seenJobs) {
        const totalEl = document.getElementById('stat-total');
        if (totalEl) totalEl.textContent = Array.isArray(data.seenJobs) ? data.seenJobs.length : 0;
    }

    const tracked = trackedData.trackedProjects || {};
    const trackedList = Object.values(tracked)
        .sort((a, b) => (b.lastChecked || '').localeCompare(a.lastChecked || ''));
    renderTrackedProjects(trackedList);

    applySettingsToForm(data.settings || {});

    const proposalEl = document.getElementById('proposalTemplate');
    if (proposalEl) proposalEl.value = data.proposalTemplate || '';

    renderPrompts(data.prompts || []);
}

document.addEventListener('DOMContentLoaded', () => {
    void loadData();
    void loadConnectionStatus();
    setupEventListeners();
});
