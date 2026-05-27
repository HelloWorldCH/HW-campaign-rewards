// ═══════════════════════════════════════════════════════════════════════════
// PoE2 Campaign Rewards Overlay — Renderer Logic
// ═══════════════════════════════════════════════════════════════════════════

const api = window.poeOverlay;

// ─── DOM Elements ───────────────────────────────────────────────────────────
const elements = {
  app: document.getElementById('app'),
  // Status
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  // Area
  areaSection: document.getElementById('areaSection'),
  areaBadge: document.getElementById('areaBadge'),
  areaName: document.getElementById('areaName'),
  // Views
  rewardsView: document.getElementById('rewardsView'),
  allRewardsView: document.getElementById('allRewardsView'),
  settingsView: document.getElementById('settingsView'),
  // Content
  rewardsContainer: document.getElementById('rewardsContainer'),
  noRewards: document.getElementById('noRewards'),
  allRewardsContainer: document.getElementById('allRewardsContainer'),
  // Buttons
  btnAllRewards: document.getElementById('btnAllRewards'),
  btnSettings: document.getElementById('btnSettings'),
  btnMinimize: document.getElementById('btnMinimize'),
  btnClose: document.getElementById('btnClose'),
  // Settings
  settingLanguage: document.getElementById('settingLanguage'),
  settingLogPath: document.getElementById('settingLogPath'),
  btnBrowseLog: document.getElementById('btnBrowseLog'),
  settingHotkey: document.getElementById('settingHotkey'),
  settingOpacity: document.getElementById('settingOpacity'),
  opacityValue: document.getElementById('opacityValue'),
  settingShowOnChange: document.getElementById('settingShowOnChange'),
  btnSaveSettings: document.getElementById('btnSaveSettings'),
  testAreaSelect: document.getElementById('testAreaSelect'),
  btnTestArea: document.getElementById('btnTestArea'),
  // Profiles
  profileSelect: document.getElementById('profileSelect'),
  newProfileName: document.getElementById('newProfileName'),
  btnAddProfile: document.getElementById('btnAddProfile'),
  btnDeleteProfile: document.getElementById('btnDeleteProfile')
};

// ─── State ──────────────────────────────────────────────────────────────────
let currentView = 'rewards';
let currentArea = null;
let allAreas = [];
let completedRewards = [];

// ─── Initialize ─────────────────────────────────────────────────────────────
async function init() {
  // Load profiles first
  await loadProfiles();

  // Load settings
  const settings = await api.getSettings();
  applySettings(settings);

  // Load all areas for the test dropdown and all-rewards view
  allAreas = await api.getAllAreas();
  populateTestDropdown(allAreas);
  renderAllRewards(allAreas);

  // Set up event listeners
  setupEventListeners();

  // Set up IPC listeners
  setupIPCListeners();
}

// ─── Settings ───────────────────────────────────────────────────────────────
function applySettings(settings) {
  elements.settingLanguage.value = settings.language || 'en';
  elements.settingLogPath.value = settings.clientLogPath || '';
  elements.settingHotkey.value = settings.hotkey || 'F12';
  elements.settingOpacity.value = (settings.opacity || 0.9) * 100;
  elements.opacityValue.textContent = Math.round((settings.opacity || 0.9) * 100) + '%';
  elements.settingShowOnChange.checked = settings.showOnAreaChange !== false;
}

// ─── Event Listeners ────────────────────────────────────────────────────────
function setupEventListeners() {
  // Navigation buttons
  elements.btnAllRewards.addEventListener('click', () => {
    switchView(currentView === 'allRewards' ? 'rewards' : 'allRewards');
  });

  elements.btnSettings.addEventListener('click', () => {
    switchView(currentView === 'settings' ? 'rewards' : 'settings');
  });

  elements.btnMinimize.addEventListener('click', () => {
    api.hideOverlay();
  });

  elements.btnClose.addEventListener('click', () => {
    api.hideOverlay();
  });

  // Settings
  elements.settingOpacity.addEventListener('input', (e) => {
    const val = e.target.value;
    elements.opacityValue.textContent = val + '%';
    api.setOpacity(val / 100);
  });

  elements.btnBrowseLog.addEventListener('click', async () => {
    const filePath = await api.browseForFile();
    if (filePath) {
      elements.settingLogPath.value = filePath;
    }
  });

  elements.btnSaveSettings.addEventListener('click', async () => {
    const updates = {
      language: elements.settingLanguage.value,
      clientLogPath: elements.settingLogPath.value,
      hotkey: elements.settingHotkey.value,
      opacity: elements.settingOpacity.value / 100,
      showOnAreaChange: elements.settingShowOnChange.checked
    };
    await api.updateSettings(updates);
    showToast('Settings saved!');
  });

  // Test area
  elements.btnTestArea.addEventListener('click', () => {
    const area = elements.testAreaSelect.value;
    if (area) {
      api.simulateArea(area);
    }
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterAllRewards(btn.dataset.filter);
    });
  });

  // Profiles
  elements.profileSelect.addEventListener('change', async (e) => {
    const profileId = e.target.value;
    await api.switchProfile(profileId);
    await loadProfiles(); // reload to get new completedRewards state
    showToast('Profile Switched');
  });

  elements.btnAddProfile.addEventListener('click', async () => {
    const name = elements.newProfileName.value.trim();
    if (!name) return;
    await api.createProfile(name);
    elements.newProfileName.value = '';
    await loadProfiles();
    showToast('Profile Created');
  });

  elements.btnDeleteProfile.addEventListener('click', async () => {
    const profileId = elements.profileSelect.value;
    if (!profileId) return;
    await api.deleteProfile(profileId);
    await loadProfiles();
    showToast('Profile Deleted');
  });
}

async function loadProfiles() {
  const { profiles, activeProfileId } = await api.getProfiles();
  
  // Update select dropdown
  const select = elements.profileSelect;
  select.innerHTML = '';
  
  Object.values(profiles).forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    if (p.id === activeProfileId) option.selected = true;
    select.appendChild(option);
  });

  // Load completed rewards for active profile
  const activeProfile = profiles[activeProfileId];
  completedRewards = activeProfile ? (activeProfile.completedRewards || []) : [];
  
  // Re-render current views if data is loaded
  if (allAreas.length > 0) {
    if (currentArea) updateAreaDisplay(currentArea);
    renderAllRewards(allAreas); // will respect current filter due to inner filter logic or just re-render all
  }
}

// ─── IPC Listeners ──────────────────────────────────────────────────────────
function setupIPCListeners() {
  api.onAreaChange((data) => {
    currentArea = data;
    updateAreaDisplay(data);
    if (currentView !== 'rewards') {
      switchView('rewards');
    }
  });

  api.onWatcherStatus((status) => {
    updateStatus(status);
  });

  api.onError((error) => {
    updateStatus('error', error);
  });

  if (api.onLanguageChanged) {
    api.onLanguageChanged(async () => {
      allAreas = await api.getAllAreas();
      
      const select = elements.testAreaSelect;
      select.innerHTML = '<option value="">Select area to test...</option>';
      populateTestDropdown(allAreas);
      
      if (currentArea && currentArea.area) {
        const areaData = await api.getAreaRewards(currentArea.area);
        if (areaData) {
          currentArea.rewards = areaData;
          updateAreaDisplay(currentArea);
        }
      }
      
      if (currentView === 'allRewards') {
        const activeFilterBtn = document.querySelector('.filter-btn.active');
        const filterVal = activeFilterBtn ? activeFilterBtn.dataset.filter : 'all';
        renderAllRewards(allAreas, filterVal);
      }
    });
  }

  // Listen for tray menu commands
  window.poeOverlay && window.poeOverlay.onAreaChange && (() => {
    const { ipcRenderer } = window.require ? window.require('electron') : {};
  })();
}

// ─── View Switching ─────────────────────────────────────────────────────────
function switchView(viewName) {
  elements.rewardsView.classList.remove('active');
  elements.allRewardsView.classList.remove('active');
  elements.settingsView.classList.remove('active');

  switch (viewName) {
    case 'rewards':
      elements.rewardsView.classList.add('active');
      break;
    case 'allRewards':
      elements.allRewardsView.classList.add('active');
      break;
    case 'settings':
      elements.settingsView.classList.add('active');
      break;
  }

  currentView = viewName;
}

// ─── Status ─────────────────────────────────────────────────────────────────
function updateStatus(status, detail) {
  const dot = elements.statusDot;
  const text = elements.statusText;

  dot.className = 'status-dot';

  switch (status) {
    case 'watching':
      dot.classList.add('watching');
      text.textContent = 'Watching for area changes...';
      break;
    case 'stopped':
      dot.classList.add('stopped');
      text.textContent = 'Watcher stopped';
      break;
    case 'error':
      dot.classList.add('error');
      text.textContent = `Error: ${detail || 'Unknown'}`;
      break;
    case 'no-log-file':
      dot.classList.add('error');
      text.textContent = 'Client.txt not found — configure in Settings';
      break;
    default:
      text.textContent = status;
  }
}

// ─── Area Display ───────────────────────────────────────────────────────────
function updateAreaDisplay(data) {
  const { area, rewards } = data;

  // Show area section
  elements.areaSection.classList.remove('hidden');

  // Update area info
  elements.areaName.textContent = area;

  if (rewards) {
    elements.areaBadge.textContent = rewards.act;
    elements.areaBadge.style.display = '';
  } else {
    elements.areaBadge.style.display = 'none';
  }

  // Flash animation
  elements.app.classList.remove('area-transition');
  void elements.app.offsetWidth; // Force reflow
  elements.app.classList.add('area-transition');

  // Render rewards
  renderRewards(rewards, area);
}

// ─── Render Rewards ─────────────────────────────────────────────────────────
function renderRewards(areaData, areaName) {
  const container = elements.rewardsContainer;

  if (!areaData || !areaData.rewards || areaData.rewards.length === 0) {
    container.innerHTML = `
      <div class="no-area-rewards">
        <div class="no-area-rewards-icon">✨</div>
        <p>No campaign rewards in this area</p>
        <p class="hint">Keep moving, Exile!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  areaData.rewards.forEach((reward, index) => {
    const isCompleted = completedRewards.includes(reward.id);
    const card = createRewardCard(reward, index, isCompleted);
    container.appendChild(card);
  });
}

// ─── Create Reward Card ─────────────────────────────────────────────────────
function createRewardCard(reward, index, isCompleted = false) {
  const card = document.createElement('div');
  card.className = `reward-card type-${reward.type}`;
  card.dataset.id = reward.id;

  if (reward.element) {
    card.classList.add(`element-${reward.element}`);
  }

  if (reward.priority === 'essential') {
    card.classList.add('priority-essential');
  }

  if (isCompleted) {
    card.classList.add('completed');
  }

  card.style.animationDelay = `${index * 0.08}s`;

  // Priority badge
  const priorityHTML = reward.priority
    ? `<span class="priority-badge ${reward.priority}">${reward.priority}</span>`
    : '';

  // Swappable/permanent badge
  let changeBadge = '';
  if (reward.type === 'choice') {
    if (reward.swappable) {
      changeBadge = '<span class="swappable-badge">🔄 Swappable</span>';
    } else {
      changeBadge = '<span class="permanent-badge">🔒 Permanent</span>';
    }
  }

  // Choice options
  let optionsHTML = '';
  if (reward.options && reward.options.length > 0) {
    optionsHTML = `
      <div class="choice-options">
        ${reward.options.map(opt => `<div class="choice-option">${opt}</div>`).join('')}
      </div>
    `;
  }

  card.innerHTML = `
    <div class="reward-card-header">
      <div class="reward-card-title">
        <div class="reward-checkbox-container">
          <input type="checkbox" class="reward-checkbox" data-id="${reward.id}" ${isCompleted ? 'checked' : ''} title="Mark as completed">
        </div>
        <span class="reward-icon">${reward.icon || '📦'}</span>
        <span class="reward-value">${reward.value}</span>
        ${changeBadge}
      </div>
      ${priorityHTML}
    </div>
    <div class="reward-source">📍 ${reward.source}</div>
    ${reward.description ? `<div class="reward-description">${reward.description}</div>` : ''}
    ${optionsHTML}
  `;

  // Wire up checkbox
  const checkbox = card.querySelector('.reward-checkbox');
  if (checkbox) {
    checkbox.addEventListener('change', async (e) => {
      const checked = e.target.checked;
      if (checked) {
        card.classList.add('completed');
      } else {
        card.classList.remove('completed');
      }
      
      // Update global array so it reflects in all views
      if (checked && !completedRewards.includes(reward.id)) completedRewards.push(reward.id);
      if (!checked) completedRewards = completedRewards.filter(id => id !== reward.id);

      await api.toggleRewardCompletion(reward.id, checked);
      
      // Keep UI in sync across views by re-rendering the other view (lazy way)
      // Actually, since they share IDs, next time the view is generated it will be correct.
      // But if we want instant sync, we could fire an event or just re-render.
    });
  }

  return card;
}

// ─── All Rewards View ───────────────────────────────────────────────────────
function renderAllRewards(areas, filter = 'all') {
  const container = elements.allRewardsContainer;
  container.innerHTML = '';

  const filtered = filter === 'all'
    ? areas
    : areas.filter(a => String(a.actNumber) === filter);

  // Group by act
  const grouped = {};
  filtered.forEach(area => {
    const act = area.act;
    if (!grouped[act]) grouped[act] = [];
    grouped[act].push(area);
  });

  Object.entries(grouped).forEach(([act, areaList]) => {
    areaList.forEach(area => {
      // Area group header
      const groupDiv = document.createElement('div');
      groupDiv.className = 'area-group';

      const headerDiv = document.createElement('div');
      headerDiv.className = 'area-group-header';
      headerDiv.innerHTML = `
        <span class="area-group-name">${area.name}</span>
        <span class="area-group-act">${area.act}</span>
      `;
      groupDiv.appendChild(headerDiv);

      // Rewards
      if (area.rewards) {
        area.rewards.forEach((reward, idx) => {
          const isCompleted = completedRewards.includes(reward.id);
          const card = createRewardCard(reward, idx, isCompleted);
          groupDiv.appendChild(card);
        });
      }

      container.appendChild(groupDiv);
    });
  });
}

function filterAllRewards(filter) {
  renderAllRewards(allAreas, filter);
}

// ─── Test Area Dropdown ─────────────────────────────────────────────────────
function populateTestDropdown(areas) {
  const select = elements.testAreaSelect;
  areas.forEach(area => {
    const option = document.createElement('option');
    option.value = area.name;
    option.textContent = `${area.name} (${area.act})`;
    select.appendChild(option);
  });
}

// ─── Toast Notification ─────────────────────────────────────────────────────
function showToast(message, duration = 2000) {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── IPC message handlers from tray ─────────────────────────────────────────
if (api) {
  api.onShowAllRewards(() => {
    switchView('allRewards');
  });

  api.onShowSettings(() => {
    switchView('settings');
  });
}

// ─── Boot ───────────────────────────────────────────────────────────────────
init().catch(err => {
  console.error('[App] Init error:', err);
});

