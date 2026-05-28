// ═══════════════════════════════════════════════════════════════════════════
// PoE2 Campaign Rewards Overlay — Renderer Logic
// ═══════════════════════════════════════════════════════════════════════════

const api = window.poeOverlay;

// ─── DOM Elements ───────────────────────────────────────────────────────────
const elements = {
  app: document.getElementById('app'),
  // Status & Header
  activeCharacterIndicator: document.getElementById('activeCharacterIndicator'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  // Character Select Banner
  charSelectBanner: document.getElementById('charSelectBanner'),
  charSelectActiveName: document.getElementById('charSelectActiveName'),
  charSelectQuickSwitch: document.getElementById('charSelectQuickSwitch'),
  // Area
  areaSection: document.getElementById('areaSection'),
  areaBadge: document.getElementById('areaBadge'),
  areaName: document.getElementById('areaName'),
  // Navigator
  navigatorWidget: document.getElementById('navigatorWidget'),
  navigatorArrow: document.getElementById('navigatorArrow'),
  navigatorDistance: document.getElementById('navigatorDistance'),
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
  btnRunGuide: document.getElementById('btnRunGuide'),
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
  importAccountName: document.getElementById('importAccountName'),
  btnImportCharacters: document.getElementById('btnImportCharacters'),
  profileSelect: document.getElementById('profileSelect'),
  newProfileName: document.getElementById('newProfileName'),
  btnAddProfile: document.getElementById('btnAddProfile'),
  btnDeleteProfile: document.getElementById('btnDeleteProfile'),
  // Run Guide
  runGuideView: document.getElementById('runGuideView'),
  runGuideTitle: document.getElementById('runGuideTitle'),
  runGuideActSelect: document.getElementById('runGuideActSelect'),
  runGuideTotalProgress: document.getElementById('runGuideTotalProgress'),
  runGuideContainer: document.getElementById('runGuideContainer')
};

// ─── State ──────────────────────────────────────────────────────────────────
let currentView = 'rewards';
let currentArea = null;
let allAreas = [];
let completedRewards = [];
let completedRunSteps = [];
let isOnCharSelectScreen = false;
let runGuideData = [];
let currentRunGuideAct = 1;

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

  // Load run guide data
  runGuideData = await api.getRunGuide();
  populateRunGuideActSelector();
  renderRunGuide();

  // Set up event listeners
  setupEventListeners();

  // Set up IPC listeners
  setupIPCListeners();

  // Start Navigator Mockup
  startNavigatorMockup();
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

  elements.btnRunGuide.addEventListener('click', () => {
    switchView(currentView === 'runGuide' ? 'rewards' : 'runGuide');
  });

  // Run Guide act selector
  elements.runGuideActSelect.addEventListener('change', (e) => {
    currentRunGuideAct = parseInt(e.target.value);
    renderRunGuide();
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

  if (elements.activeCharacterIndicator) {
    elements.activeCharacterIndicator.addEventListener('change', async (e) => {
      const profileId = e.target.value;
      await api.switchProfile(profileId);
      await loadProfiles();
      showToast('Profile Switched');
    });
  }

  elements.btnImportCharacters.addEventListener('click', async () => {
    const accountName = elements.importAccountName.value.trim();
    if (!accountName) {
      showToast('Please enter an account name');
      return;
    }
    
    const originalText = elements.btnImportCharacters.textContent;
    elements.btnImportCharacters.textContent = '...';
    elements.btnImportCharacters.disabled = true;
    
    try {
      if (api.importCharacters) {
        await api.importCharacters(accountName);
        await loadProfiles();
        showToast('Characters Imported');
        elements.importAccountName.value = '';
      }
    } catch (err) {
      showToast(err.message || 'Error importing characters');
    } finally {
      elements.btnImportCharacters.textContent = originalText;
      elements.btnImportCharacters.disabled = false;
    }
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

  // Update header character indicator (select)
  if (elements.activeCharacterIndicator) {
    elements.activeCharacterIndicator.innerHTML = '';
    Object.values(profiles).forEach(p => {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = `👤 ${p.name}`;
      if (p.id === activeProfileId) option.selected = true;
      elements.activeCharacterIndicator.appendChild(option);
    });
  }

  // Load completed rewards for active profile
  const activeProfile = profiles[activeProfileId];
  completedRewards = activeProfile ? (activeProfile.completedRewards || []) : [];
  completedRunSteps = activeProfile ? (activeProfile.completedRunSteps || []) : [];

  // Re-render current views if data is loaded
  if (allAreas.length > 0) {
    if (currentArea) updateAreaDisplay(currentArea);
    renderAllRewards(allAreas);
  }
  if (runGuideData.length > 0) {
    renderRunGuide();
  }
}

// ─── IPC Listeners ──────────────────────────────────────────────────────────
function setupIPCListeners() {
  api.onAreaChange((data) => {
    currentArea = data;
    isOnCharSelectScreen = false;
    elements.charSelectBanner.classList.add('hidden');
    updateAreaDisplay(data);
    // Auto-scroll run guide if on that view
    if (currentView === 'runGuide') {
      scrollToCurrentZone(data.area);
    }
    if (currentView !== 'rewards') {
      // Don't auto-switch view, just highlight in run guide
    }
  });

  if (api.onCharacterSelectScreen) {
    api.onCharacterSelectScreen(async () => {
      isOnCharSelectScreen = true;
      
      // Show the banner
      elements.charSelectBanner.classList.remove('hidden');
      
      // Populate quick-switch dropdown
      const { profiles, activeProfileId } = await api.getProfiles();
      const activeProfile = profiles[activeProfileId];
      elements.charSelectActiveName.textContent = activeProfile ? activeProfile.name : '—';
      
      const qs = elements.charSelectQuickSwitch;
      qs.innerHTML = '';
      Object.values(profiles).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === activeProfileId) opt.selected = true;
        qs.appendChild(opt);
      });
      
      // Update area display to show char select
      elements.areaSection.classList.remove('hidden');
      elements.areaName.textContent = 'Character Selection';
      elements.areaBadge.textContent = '🎭';
      elements.areaBadge.style.display = '';
      
      // Render a message in rewards view
      elements.rewardsContainer.innerHTML = `
        <div class="no-area-rewards">
          <div class="no-area-rewards-icon">🎭</div>
          <p>You are on the character selection screen</p>
          <p class="hint">Switch character above if needed</p>
        </div>
      `;
    });
  }

  // Quick-switch handler
  elements.charSelectQuickSwitch.addEventListener('change', async (e) => {
    const profileId = e.target.value;
    await api.setActiveProfile(profileId);
    await loadProfiles();
    
    const { profiles } = await api.getProfiles();
    const activeProfile = profiles[profileId];
    elements.charSelectActiveName.textContent = activeProfile ? activeProfile.name : '—';
    showToast('Character Switched');
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

      // Reload run guide
      runGuideData = await api.getRunGuide();
      populateRunGuideActSelector();
      renderRunGuide();
    });
  }

  // Listen for tray menu commands
  window.poeOverlay && window.poeOverlay.onAreaChange && (() => {
    const { ipcRenderer } = window.require ? window.require('electron') : {};
  })();
}

// ─── Navigator Mockup (WIP) ─────────────────────────────────────────────────
function startNavigatorMockup() {
  if (!elements.navigatorArrow) return;
  
  // Update randomly every 2 seconds to simulate guidance
  setInterval(() => {
    // Random angle between 0 and 360
    const angle = Math.floor(Math.random() * 360);
    // Random distance between 5 and 150
    const distance = Math.floor(Math.random() * 145) + 5;
    
    elements.navigatorArrow.style.transform = `rotate(${angle}deg)`;
    elements.navigatorDistance.textContent = `${distance}m`;
  }, 2000);
}

// ─── View Switching ─────────────────────────────────────────────────────────
function switchView(viewName) {
  elements.rewardsView.classList.remove('active');
  elements.allRewardsView.classList.remove('active');
  elements.settingsView.classList.remove('active');
  elements.runGuideView.classList.remove('active');

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
    case 'runGuide':
      elements.runGuideView.classList.add('active');
      renderRunGuide(); // re-render to highlight current zone
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

// ─── IPC message handlers from tray ─────────────────────────────────────
if (api) {
  api.onShowAllRewards(() => {
    switchView('allRewards');
  });

  api.onShowSettings(() => {
    switchView('settings');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Run Guide — Step-by-step Act Walkthrough
// ═══════════════════════════════════════════════════════════════════════════

function populateRunGuideActSelector() {
  const select = elements.runGuideActSelect;
  select.innerHTML = '';
  runGuideData.forEach(guide => {
    const option = document.createElement('option');
    option.value = guide.act;
    option.textContent = `Act ${guide.act}`;
    if (guide.act === currentRunGuideAct) option.selected = true;
    select.appendChild(option);
  });
}

function renderRunGuide() {
  const container = elements.runGuideContainer;
  container.innerHTML = '';

  const guide = runGuideData.find(g => g.act === currentRunGuideAct);
  if (!guide) {
    container.innerHTML = `
      <div class="no-area-rewards">
        <div class="no-area-rewards-icon">🗺️</div>
        <p>No run guide data available</p>
        <p class="hint">Run guide data not found for this act</p>
      </div>
    `;
    return;
  }

  // Update title
  elements.runGuideTitle.textContent = guide.title;

  // Calculate total progress
  let totalSteps = 0;
  let totalCompleted = 0;

  guide.zones.forEach(zone => {
    totalSteps += zone.steps.length;
    zone.steps.forEach(step => {
      if (completedRunSteps.includes(step.id)) totalCompleted++;
    });
  });

  elements.runGuideTotalProgress.textContent = `${totalCompleted}/${totalSteps}`;

  // Render each zone
  guide.zones.forEach((zone, zoneIndex) => {
    const zoneCard = createZoneCard(zone, zoneIndex);
    container.appendChild(zoneCard);
  });

  // Auto-scroll to current zone if we know the area
  if (currentArea) {
    setTimeout(() => scrollToCurrentZone(currentArea.area), 100);
  }
}

function createZoneCard(zone, zoneIndex) {
  const card = document.createElement('div');
  card.className = 'run-zone-card';
  card.dataset.zoneName = zone.mapName;
  card.dataset.zoneIndex = zoneIndex;
  card.id = `run-zone-${zoneIndex}-${zone.mapName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;

  // Check if this is the current zone
  const isCurrentZone = currentArea && currentArea.area === zone.mapName;
  if (isCurrentZone) {
    card.classList.add('current-zone');
  }

  // Count completed steps
  const completedCount = zone.steps.filter(s => completedRunSteps.includes(s.id)).length;
  const totalCount = zone.steps.length;
  const isZoneComplete = completedCount === totalCount;
  if (isZoneComplete) {
    card.classList.add('zone-complete');
  }

  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Zone header
  const header = document.createElement('div');
  header.className = 'run-zone-header';
  header.innerHTML = `
    <div class="run-zone-header-left">
      <span class="run-zone-order">${zone.order}</span>
      <span class="run-zone-name">${zone.name}</span>
      ${isCurrentZone ? '<span class="run-zone-current-badge">HERE</span>' : ''}
    </div>
    <div class="run-zone-header-right">
      <span class="run-zone-count">${completedCount}/${totalCount}</span>
    </div>
  `;
  card.appendChild(header);

  // Progress bar
  const progressBar = document.createElement('div');
  progressBar.className = 'run-zone-progress';
  progressBar.innerHTML = `<div class="run-zone-progress-fill" style="width: ${progressPercent}%"></div>`;
  card.appendChild(progressBar);

  // Steps
  const stepsContainer = document.createElement('div');
  stepsContainer.className = 'run-zone-steps';

  zone.steps.forEach((step, stepIndex) => {
    const stepEl = createStepItem(step, stepIndex, zone);
    stepsContainer.appendChild(stepEl);
  });

  card.appendChild(stepsContainer);

  // Animation delay
  card.style.animationDelay = `${zoneIndex * 0.06}s`;

  return card;
}

function createStepItem(step, stepIndex, zone) {
  const item = document.createElement('div');
  const isCompleted = completedRunSteps.includes(step.id);
  item.className = `run-step-item action-${step.action}`;
  if (isCompleted) item.classList.add('step-completed');
  item.style.animationDelay = `${stepIndex * 0.04}s`;

  item.innerHTML = `
    <div class="run-step-checkbox-area">
      <input type="checkbox" class="run-step-checkbox" data-step-id="${step.id}" ${isCompleted ? 'checked' : ''}>
    </div>
    <div class="run-step-icon">${step.icon}</div>
    <div class="run-step-content">
      <div class="run-step-text">${step.text}</div>
      ${step.detail ? `<div class="run-step-detail">${step.detail}</div>` : ''}
    </div>
  `;

  // Wire up checkbox
  const checkbox = item.querySelector('.run-step-checkbox');
  checkbox.addEventListener('change', async (e) => {
    const checked = e.target.checked;
    if (checked) {
      item.classList.add('step-completed');
      if (!completedRunSteps.includes(step.id)) completedRunSteps.push(step.id);
    } else {
      item.classList.remove('step-completed');
      completedRunSteps = completedRunSteps.filter(id => id !== step.id);
    }

    await api.toggleRunStep(step.id, checked);

    // Update zone progress
    updateZoneProgress(zone, parseInt(card.dataset.zoneIndex));
    updateTotalProgress();
  });

  return item;
}

function updateZoneProgress(zone, zoneIndex) {
  const card = document.getElementById(`run-zone-${zoneIndex}-${zone.mapName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`);
  if (!card) return;

  const completedCount = zone.steps.filter(s => completedRunSteps.includes(s.id)).length;
  const totalCount = zone.steps.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Update count text
  const countEl = card.querySelector('.run-zone-count');
  if (countEl) countEl.textContent = `${completedCount}/${totalCount}`;

  // Update progress bar
  const fillEl = card.querySelector('.run-zone-progress-fill');
  if (fillEl) fillEl.style.width = `${progressPercent}%`;

  // Update zone-complete class
  if (completedCount === totalCount) {
    card.classList.add('zone-complete');
  } else {
    card.classList.remove('zone-complete');
  }
}

function updateTotalProgress() {
  const guide = runGuideData.find(g => g.act === currentRunGuideAct);
  if (!guide) return;

  let totalSteps = 0;
  let totalCompleted = 0;
  guide.zones.forEach(zone => {
    totalSteps += zone.steps.length;
    zone.steps.forEach(step => {
      if (completedRunSteps.includes(step.id)) totalCompleted++;
    });
  });

  elements.runGuideTotalProgress.textContent = `${totalCompleted}/${totalSteps}`;
}

function scrollToCurrentZone(areaName) {
  // Find all cards for this area
  const cards = document.querySelectorAll(`.run-zone-card[data-zone-name="${areaName}"]`);
  
  // Find the first card that is not fully completed, or just use the last one if all are completed
  let targetCard = null;
  for (const c of cards) {
    if (!c.classList.contains('zone-complete')) {
      targetCard = c;
      break;
    }
  }
  if (!targetCard && cards.length > 0) {
    targetCard = cards[cards.length - 1];
  }

  if (targetCard) {
    // Remove previous highlights
    document.querySelectorAll('.run-zone-card.current-zone').forEach(c => {
      c.classList.remove('current-zone');
      const badge = c.querySelector('.run-zone-current-badge');
      if (badge) badge.remove();
    });

    // Add current highlight
    targetCard.classList.add('current-zone');
    const headerLeft = targetCard.querySelector('.run-zone-header-left');
    if (headerLeft && !headerLeft.querySelector('.run-zone-current-badge')) {
      const badge = document.createElement('span');
      badge.className = 'run-zone-current-badge';
      badge.textContent = 'HERE';
      headerLeft.appendChild(badge);
    }

    // Smooth scroll
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ─── Boot ───────────────────────────────────────────────────────────────
init().catch(err => {
  console.error('[App] Init error:', err);
});
