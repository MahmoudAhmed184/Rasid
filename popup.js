// ==========================================
// Frelancia | منبه مستقل - Minimal Popup Script
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize minimal UI
  void loadStats();
  setupEventListeners();
  
  // Refresh stats every 30 seconds while popup is open
  setInterval(() => { void loadStats(); }, 30000);
});

// ==========================================
// Load Stats
// ==========================================
async function loadStats() {
  const data = await browserApi.storage.local.get(['stats', 'seenJobs']);
  const stats = data.stats || {};
  const seenJobs = data.seenJobs || [];

  if (stats.lastCheck) {
    const lastCheck = new Date(stats.lastCheck);
    const now = new Date();
    const diffMinutes = Math.floor((now - lastCheck) / 60000);

    let timeText;
    if (diffMinutes < 1) {
      timeText = 'الآن';
    } else if (diffMinutes < 60) {
      timeText = `منذ ${diffMinutes} دقيقة`;
    } else if (diffMinutes < 1440) {
      timeText = `منذ ${Math.floor(diffMinutes / 60)} ساعة`;
    } else {
      timeText = lastCheck.toLocaleDateString('ar-SA');
    }

    document.getElementById('lastCheck').textContent = `آخر فحص: ${timeText}`;
  } else {
    document.getElementById('lastCheck').textContent = 'لم يتم الفحص بعد';
  }

  document.getElementById('todayCount').textContent = stats.todayCount || 0;
  document.getElementById('totalSeen').textContent = seenJobs.length;
}

// ==========================================
// Event Listeners
// ==========================================
function setupEventListeners() {
  // Open Dashboard
  const dashboardBtn = document.getElementById('open-dashboard-btn');
  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await browserApi.tabs.create({ url: 'dashboard.html' });
    });
  }

  // Check Now
  const checkBtn = document.getElementById('checkNowBtn');
  if (checkBtn) {
    checkBtn.addEventListener('click', async () => {
      const originalContent = checkBtn.innerHTML;
      checkBtn.disabled = true;
      checkBtn.innerHTML = '<span>جاري الفحص...</span>';

      try {
        await browserApi.runtime.sendMessage({ action: 'checkNow' });
        await loadStats();
      } finally {
        checkBtn.disabled = false;
        checkBtn.innerHTML = originalContent;
      }
    });
  }

  // Check Connection (Diagnostics)
  const connBtn = document.getElementById('checkConnectionBtn');
  const connReport = document.getElementById('connectionReport');
  if (connBtn) {
    connBtn.addEventListener('click', async () => {
      const originalContent = connBtn.innerHTML;
      connBtn.disabled = true;
      connBtn.textContent = 'جاري التشخيص...';
      connReport.classList.add('hidden');

      try {
        const response = await browserApi.runtime.sendMessage({ action: 'debugFetch' });

        connBtn.disabled = false;
        connBtn.innerHTML = originalContent;
        connReport.classList.remove('hidden');

        if (response && response.success) {
          connReport.className = 'connection-report success';
          connReport.textContent = `✓ الاتصال ناجح. تم جلب ${response.length} بايت من موقع مستقل.`;
        } else {
          connReport.className = 'connection-report error';
          connReport.textContent = `✗ فشل الاتصال: ${response?.error || 'خطأ غير معروف'}. حاول فتح Mostaql.com أولاً.`;
        }
      } catch (error) {
        connBtn.disabled = false;
        connBtn.innerHTML = originalContent;
        connReport.className = 'connection-report error';
        connReport.classList.remove('hidden');
        connReport.textContent = `✗ فشل الاتصال: ${error.message}. حاول فتح Mostaql.com أولاً.`;
      }
    });
  }

  // Toggle Notifications
  const toggleBtn = document.getElementById('toggleNotificationsBtn');
  if (toggleBtn) {
    browserApi.storage.local.get(['notificationsEnabled']).then((data) => {
      const isEnabled = data.notificationsEnabled !== false; // Default to true
      updateToggleUI(toggleBtn, isEnabled);
    });

    toggleBtn.addEventListener('click', async () => {
      const data = await browserApi.storage.local.get(['notificationsEnabled']);
        const isEnabled = data.notificationsEnabled !== false;
        const newState = !isEnabled;

        await browserApi.storage.local.set({ notificationsEnabled: newState });
        updateToggleUI(toggleBtn, newState);
    });
  }
}

// ==========================================
// Helper: Update Toggle UI
// ==========================================
function updateToggleUI(button, isEnabled) {
  if (isEnabled) {
    button.className = 'btn secondary';
    button.innerHTML = '<i class="fas fa-bell"></i><span>الإشعارات: مفعلة</span>';
  } else {
    button.className = 'btn toggle-off';
    button.innerHTML = '<i class="fas fa-bell-slash"></i><span>الإشعارات: متوقفة</span>';
  }
}
