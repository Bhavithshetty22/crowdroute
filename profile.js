import {
  saveToStorage,
  loadFromStorage,
  showToast,
  isDemoMode,
  setDemoMode,
  LS_GEMINI_API_KEY,
} from './shared.js';
import { getSavedRoutes, removeSavedRouteById } from './routes.js';
import { checkGeminiStatus, checkFirebaseStatus, checkGoogleMapsStatus } from './services/status.js';

/** Same keys as onboarding.js */
const ONBOARD = {
  seatSection: 'seatSection',
  favoriteCategories: 'favoriteCategories',
  routePreference: 'routePreference',
  accessibilityPreference: 'accessibilityPreference',
  complete: 'crowdpilotOnboardingComplete',
};

const PROFILE_NOTIFICATIONS = 'crowdpilotProfileNotifications';
const PROFILE_SECURITY = 'crowdpilotProfileSecurity';
const PROFILE_FACILITIES = 'crowdpilotFavoriteFacilities';
const PROFILE_ACCESSIBILITY_UI = 'crowdpilotAccessibilityUi';
const PROFILE_AVATAR_KEY = 'crowdpilot_profile_avatar_base64';

const ROUTE_KEYS = ['fastest', 'least_crowded', 'accessible'];
const ROUTE_LABELS = {
  fastest: 'Fastest Route',
  least_crowded: 'Least Crowded',
  accessible: 'Accessible Route',
};

const FACILITY_IDS = [
  { id: 'food_stalls', label: 'Food stalls' },
  { id: 'washrooms', label: 'Washrooms' },
  { id: 'gates', label: 'Gates' },
  { id: 'parking', label: 'Parking' },
  { id: 'emergency_exits', label: 'Emergency exits' },
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function iconForSavedCategory(cat) {
  if (cat === 'least_crowded') return 'groups';
  if (cat === 'accessible') return 'accessible';
  return 'bolt';
}

const SEAT_CODES = [
  { code: 'A', label: 'North Stand' },
  { code: 'B', label: 'West Wing' },
  { code: 'C', label: 'East Stand' },
  { code: 'D', label: 'South Curve' },
  { code: 'VIP', label: 'Premium Box' },
  { code: 'GA', label: 'General Admit.' },
];

function normalizeRoutePref(raw) {
  if (!raw) return '';
  const s = String(raw).toLowerCase();
  if (s.includes('least') || s.includes('crowd')) return 'least_crowded';
  if (s.includes('access')) return 'accessible';
  if (s.includes('fast')) return 'fastest';
  if (ROUTE_KEYS.includes(raw)) return raw;
  return '';
}

function routeKeyToStoredLabel(key) {
  return ROUTE_LABELS[key] || key;
}

function defaultNotifications() {
  return {
    notifications: true,
    emergencyAlerts: true,
    parkingAlerts: true,
    queueAlerts: true,
  };
}

function defaultSecurity() {
  return {
    biometricLogin: true,
    twoFactorAuth: true,
    sessionTimeout: false,
  };
}

function defaultAccessibilityUi() {
  return { wheelchair: false, largeText: false, highContrast: false };
}

function completionPercent(state) {
  let score = 0;
  const wSeat = 22;
  const wCat = 18;
  const wRoute = 18;
  const wAcc = 14;
  const wFac = 18;
  const wNotif = 10;

  if (state.seatSection?.code) score += wSeat;
  if (Array.isArray(state.favoriteCategories) && state.favoriteCategories.length > 0) score += wCat;
  if (normalizeRoutePref(state.routePreference)) score += wRoute;
  if (state.accessibilityPreference || Object.values(state.accessibilityUi || {}).some(Boolean)) score += wAcc;
  if (Array.isArray(state.favoriteFacilities) && state.favoriteFacilities.length > 0) score += wFac;
  const n = state.notifications || defaultNotifications();
  if (n.notifications || n.emergencyAlerts || n.parkingAlerts || n.queueAlerts) score += wNotif;

  return Math.min(100, Math.round(score));
}

function loadState() {
  return {
    seatSection: loadFromStorage(ONBOARD.seatSection, null),
    favoriteCategories: loadFromStorage(ONBOARD.favoriteCategories, []) || [],
    routePreference: loadFromStorage(ONBOARD.routePreference, null),
    accessibilityPreference: loadFromStorage(ONBOARD.accessibilityPreference, null),
    notifications: loadFromStorage(PROFILE_NOTIFICATIONS, null) || defaultNotifications(),
    security: loadFromStorage(PROFILE_SECURITY, null) || defaultSecurity(),
    favoriteFacilities: loadFromStorage(PROFILE_FACILITIES, []) || [],
    accessibilityUi: loadFromStorage(PROFILE_ACCESSIBILITY_UI, null) || defaultAccessibilityUi(),
  };
}

function persistOnboardingSlice(state) {
  saveToStorage(ONBOARD.seatSection, state.seatSection);
  saveToStorage(ONBOARD.favoriteCategories, state.favoriteCategories);
  saveToStorage(ONBOARD.routePreference, state.routePreference);
  saveToStorage(ONBOARD.accessibilityPreference, state.accessibilityPreference);
  saveToStorage(ONBOARD.complete, true);
  saveToStorage(PROFILE_NOTIFICATIONS, state.notifications);
  saveToStorage(PROFILE_SECURITY, state.security);
  saveToStorage(PROFILE_FACILITIES, state.favoriteFacilities);
  saveToStorage(PROFILE_ACCESSIBILITY_UI, state.accessibilityUi);
}

function applySeatUI(root, seat) {
  if (!root) return;
  root.querySelectorAll('[data-seat-code]').forEach((el) => {
    el.classList.toggle('selected', seat?.code === el.dataset.seatCode);
  });
  const detail = document.querySelector('#profile-seat-detail');
  if (detail) detail.value = seat?.seatDetail || '';
  const display = document.querySelector('#profile-seat-section-display');
  if (display) {
    display.textContent = seat?.code
      ? `Section ${seat.code}${seat.label ? ` — ${seat.label}` : ''}`
      : 'Not set';
  }
}

function applyCategoriesUI(root, selected) {
  if (!root) return;
  const set = new Set(selected || []);
  root.querySelectorAll('[data-category-id]').forEach((el) => {
    el.classList.toggle('selected', set.has(el.dataset.categoryId));
  });
}

function applyRouteUI(root, rawPref) {
  if (!root) return;
  let key = normalizeRoutePref(rawPref);
  if (!key) key = 'fastest';
  root.querySelectorAll('[data-route-pref]').forEach((el) => {
    el.classList.toggle('selected', el.dataset.routePref === key);
  });
}

function applyAccessibilityMain(select, value) {
  if (!select) return;
  const allowed = ['standard', 'wheelchair_paths', 'hearing', 'visual'];
  const v = value && allowed.includes(String(value)) ? String(value) : 'standard';
  select.value = v;
}

function applyAccessibilityUiToggles(state) {
  const ui = state.accessibilityUi || defaultAccessibilityUi();
  document.querySelectorAll('[data-a11y-ui]').forEach((el) => {
    const k = el.dataset.a11yUi;
    const on = !!ui[k];
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function applyFacilitiesUI(root, selected) {
  if (!root) return;
  const set = new Set(selected || []);
  root.querySelectorAll('[data-facility-id]').forEach((el) => {
    el.classList.toggle('selected', set.has(el.dataset.facilityId));
  });
}

function applyToggles(state) {
  const n = state.notifications || defaultNotifications();
  const sec = state.security || defaultSecurity();
  document.querySelectorAll('[data-toggle-key]').forEach((el) => {
    const k = el.dataset.toggleKey;
    let on = false;
    if (k in n) on = !!n[k];
    else if (k in sec) on = !!sec[k];
    else return;
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function updateCompletionBar(pct) {
  const fill = document.querySelector('#profile-completion-fill');
  const label = document.querySelector('#profile-completion-label');
  if (fill) fill.style.width = `${pct}%`;
  if (label) label.textContent = `${pct}%`;
}

function readFormState() {
  const seatRoot = document.querySelector('#profile-seat-grid');
  const selectedSeat = seatRoot?.querySelector('[data-seat-code].selected');
  const code = selectedSeat?.dataset.seatCode || '';
  const label = selectedSeat?.querySelector('.text-xs')?.textContent?.trim() || '';
  const seatDetail = document.querySelector('#profile-seat-detail')?.value?.trim() || '';

  const categories = [];
  document.querySelectorAll('#profile-category-grid [data-category-id].selected').forEach((el) => {
    categories.push(el.dataset.categoryId);
  });

  const routeEl = document.querySelector('#profile-route-prefs [data-route-pref].selected');
  const routeKey = routeEl?.dataset.routePref || 'fastest';

  const accSel = document.querySelector('#profile-accessibility-main');
  const accessibilityPreference = accSel?.value || 'standard';

  const facilities = [];
  document.querySelectorAll('#profile-facilities-grid [data-facility-id].selected').forEach((el) => {
    facilities.push(el.dataset.facilityId);
  });

  const notifications = { ...defaultNotifications() };
  const security = { ...defaultSecurity() };
  document.querySelectorAll('[data-toggle-key]').forEach((el) => {
    const k = el.dataset.toggleKey;
    if (k in notifications) notifications[k] = el.classList.contains('on');
    else if (k in security) security[k] = el.classList.contains('on');
  });

  const accessibilityUi = { ...defaultAccessibilityUi() };
  document.querySelectorAll('[data-a11y-ui]').forEach((el) => {
    const k = el.dataset.a11yUi;
    if (k in accessibilityUi) accessibilityUi[k] = el.classList.contains('on');
  });

  return {
    seatSection: code ? { code, label, seatDetail } : null,
    favoriteCategories: categories,
    routePreference: routeKeyToStoredLabel(routeKey),
    accessibilityPreference,
    favoriteFacilities: facilities,
    notifications,
    security,
    accessibilityUi,
  };
}

function wirePrefCards(container, multiSelect, onChange) {
  if (!container) return;
  container.addEventListener('click', (e) => {
    const card = e.target.closest('[data-seat-code], [data-category-id], [data-route-pref], [data-facility-id]');
    if (!card || !container.contains(card)) return;
    if (card.dataset.routePref != null || card.dataset.seatCode != null) {
      container.querySelectorAll(
        card.dataset.routePref != null ? '[data-route-pref]' : '[data-seat-code]',
      ).forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
    } else if (multiSelect) {
      card.classList.toggle('selected');
    }
    onChange?.();
  });
}

function wireToggles(root, onChange) {
  if (!root) return;
  const toggleFn = (t) => {
    t.classList.toggle('on');
    t.setAttribute('aria-checked', t.classList.contains('on') ? 'true' : 'false');
    onChange?.();
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle-key], [data-a11y-ui]');
    if (!t || !root.contains(t)) return;
    if (!t.classList.contains('toggle')) return;
    toggleFn(t);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const t = e.target.closest('[data-toggle-key], [data-a11y-ui]');
      if (!t || !root.contains(t)) return;
      if (!t.classList.contains('toggle')) return;
      e.preventDefault();
      toggleFn(t);
    }
  });
}

function renderSavedRoutesList() {
  const root = document.querySelector('#profile-saved-routes');
  if (!root) return;
  const list = getSavedRoutes();
  if (!list.length) {
    root.innerHTML = `<div class="rounded-xl border border-dashed border-white/12 p-6 text-center">
      <span class="material-symbols-outlined text-stone-600 text-4xl mb-2 block" aria-hidden="true">alt_route</span>
      <p class="text-sm text-stone-400 mb-1">No saved routes yet</p>
      <p class="text-xs text-stone-600">Open <a href="routes.html" class="text-primary-container font-bold hover:underline">Routes</a> and tap <strong>Save route</strong> on any card.</p>
    </div>`;
    return;
  }
  root.innerHTML = list
    .map(
      (item) => `
    <div class="flex items-center justify-between p-3 bg-white/03 rounded-xl gap-2" data-saved-route-id="${escapeHtml(item.id)}">
      <a href="routes.html" class="flex items-center gap-3 min-w-0 flex-1 hover:opacity-90 glide">
        <span class="material-symbols-outlined text-primary-container text-sm shrink-0" style="font-variation-settings:'FILL' 1;">${escapeHtml(iconForSavedCategory(item.category))}</span>
        <div class="min-w-0 text-left">
          <p class="text-xs font-medium truncate">${escapeHtml(item.destLabel)} — ${escapeHtml(item.routeTitle || '')}</p>
          <p class="text-[10px] text-stone-500 truncate">${escapeHtml(item.summary || '')}</p>
        </div>
      </a>
      <button type="button" class="text-stone-600 hover:text-error glide shrink-0 p-2 rounded-lg profile-remove-route" aria-label="Remove saved route" data-remove-route="${escapeHtml(item.id)}"><span class="material-symbols-outlined text-sm">delete</span></button>
    </div>`,
    )
    .join('');
}

const DEFAULT_AVATAR_URL =
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=80';

function applyAvatarFromStorage() {
  const img = document.querySelector('#profile-avatar-img');
  if (!img) return;
  const data = loadFromStorage(PROFILE_AVATAR_KEY, '');
  if (typeof data === 'string' && data.startsWith('data:image')) {
    img.src = data;
  } else {
    img.src = DEFAULT_AVATAR_URL;
  }
}

function wireSavedRoutesRemove() {
  const root = document.querySelector('#profile-saved-routes');
  root?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-route]');
    if (!btn) return;
    removeSavedRouteById(btn.getAttribute('data-remove-route') || '');
    renderSavedRoutesList();
    showToast('Route removed.', { duration: 2200 });
  });
}

function wireAvatarUpload() {
  const input = document.querySelector('#profile-avatar-input');
  const edit = document.querySelector('#profile-avatar-edit');
  edit?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      showToast('Choose an image file.', { type: 'error' });
      return;
    }
    if (file.size > 1_200_000) {
      showToast('Image too large — use a photo under ~1.2MB.', { type: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      if (typeof res === 'string' && saveToStorage(PROFILE_AVATAR_KEY, res)) {
        applyAvatarFromStorage();
        showToast('Profile photo updated.', { duration: 2200 });
      }
    };
    reader.readAsDataURL(file);
    input.value = '';
  });
}

function renderFacilitiesGrid(root) {
  if (!root) return;
  const icons = {
    food_stalls: 'restaurant',
    washrooms: 'wc',
    gates: 'logout',
    parking: 'local_parking',
    emergency_exits: 'emergency',
  };
  root.innerHTML = FACILITY_IDS.map(
    (f) => `
    <button type="button" class="pref-card flex items-center gap-3 p-3 bg-white/03 border border-white/06 rounded-xl cursor-pointer hover:border-primary-container/25 glide text-left w-full" data-facility-id="${f.id}">
      <span class="material-symbols-outlined text-stone-400 text-base" style="font-variation-settings:'FILL' 1;">${icons[f.id] || 'place'}</span>
      <span class="text-xs font-medium text-stone-300">${f.label}</span>
    </button>`,
  ).join('');
}

/**
 * @param {object} [opts]
 */
export function initProfile(opts = {}) {
  const main = document.querySelector(opts.rootSelector || '#profile-main');
  if (!main) return null;

  let state = loadState();

  const seatGrid = document.querySelector('#profile-seat-grid');
  const categoryGrid = document.querySelector('#profile-category-grid');
  const routePrefs = document.querySelector('#profile-route-prefs');
  const facilitiesGrid = document.querySelector('#profile-facilities-grid');
  const accSelect = document.querySelector('#profile-accessibility-main');

  if (seatGrid && !seatGrid.querySelector('[data-seat-code]')) {
    seatGrid.innerHTML = SEAT_CODES.map(
      (s) => `
      <button type="button" class="pref-card text-center" data-seat-code="${s.code}">
        <p class="text-2xl font-black headline-font seat-code">${s.code}</p>
        <p class="text-xs text-stone-400 mt-1">${s.label}</p>
      </button>`,
    ).join('');
  }

  if (routePrefs && !routePrefs.querySelector('[data-route-pref]')) {
    routePrefs.innerHTML = ROUTE_KEYS.map(
      (k) => `
      <button type="button" class="pref-card flex items-center gap-4 w-full text-left" data-route-pref="${k}">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center ${
          k === 'fastest'
            ? 'bg-primary-container/15'
            : k === 'least_crowded'
              ? 'bg-tertiary/15'
              : 'bg-blue-500/15'
        }">
          <span class="material-symbols-outlined ${
            k === 'fastest' ? 'text-primary-container' : k === 'least_crowded' ? 'text-tertiary' : 'text-blue-400'
          }" style="font-variation-settings:'FILL' 1;">${k === 'fastest' ? 'bolt' : k === 'least_crowded' ? 'groups' : 'accessible'}</span>
        </div>
        <div>
          <p class="font-bold text-sm">${ROUTE_LABELS[k]}</p>
          <p class="text-stone-500 text-xs">${k === 'fastest' ? 'Shortest walk time' : k === 'least_crowded' ? 'Quieter paths' : 'Ramps & lifts priority'}</p>
        </div>
      </button>`,
    ).join('');
  }

  if (categoryGrid && !categoryGrid.querySelector('[data-category-id]')) {
    const meta = [
      ['restaurant', 'text-primary-container', 'Food & Drinks'],
      ['local_mall', 'text-stone-400', 'Merchandise'],
      ['sports_bar', 'text-secondary-container', 'Beer & Snacks'],
      ['photo_camera', 'text-primary', 'Photo Spots'],
      ['directions_car', 'text-amber-400', 'Parking Exit'],
      ['accessible', 'text-blue-400', 'Accessibility'],
    ];
    categoryGrid.innerHTML = meta
      .map(
        ([icon, colCls, label]) => `
      <button type="button" class="pref-card flex items-center gap-3 p-3 bg-white/03 border border-white/06 rounded-xl cursor-pointer hover:border-primary-container/25 glide w-full text-left" data-category-id="${label}">
        <span class="material-symbols-outlined ${colCls} text-base" style="font-variation-settings:'FILL' 1;">${icon}</span>
        <span class="text-xs font-medium text-stone-300">${label}</span>
      </button>`,
      )
      .join('');
  }

  renderFacilitiesGrid(facilitiesGrid);

  function paint() {
    state = loadState();
    applySeatUI(seatGrid, state.seatSection);
    applyCategoriesUI(categoryGrid, state.favoriteCategories);
    applyRouteUI(routePrefs, state.routePreference);
    applyAccessibilityMain(accSelect, state.accessibilityPreference);
    applyFacilitiesUI(facilitiesGrid, state.favoriteFacilities);
    applyToggles(state);
    applyAccessibilityUiToggles(state);
    updateCompletionBar(completionPercent(state));
    renderSavedRoutesList();
    applyAvatarFromStorage();
    const statusEl = document.querySelector('#profile-gemini-status');
    if (statusEl) {
      checkGeminiStatus().then(status => {
        if (status === 'connected') {
          statusEl.textContent = 'Connected';
          statusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-tertiary/20 text-tertiary';
        } else if (status === 'partially connected') {
          statusEl.textContent = 'Partially Connected';
          statusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400';
        } else {
          statusEl.textContent = 'Not Connected';
          statusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-stone-400';
        }
      });
    }

    const fbStatusEl = document.querySelector('#profile-firebase-status');
    if (fbStatusEl) {
      checkFirebaseStatus().then(status => {
        if (status === 'connected') {
          fbStatusEl.textContent = 'Connected';
          fbStatusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-tertiary/20 text-tertiary';
        } else if (status === 'partially connected') {
          fbStatusEl.textContent = 'Partially Connected';
          fbStatusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400';
        } else {
          fbStatusEl.textContent = 'Not Connected';
          fbStatusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-stone-400';
        }
      });
    }

    const mapStatusEl = document.querySelector('#profile-maps-status');
    if (mapStatusEl) {
      checkGoogleMapsStatus().then(status => {
        if (status === 'connected') {
          mapStatusEl.textContent = 'Connected';
          mapStatusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-tertiary/20 text-tertiary';
        } else if (status === 'partially connected') {
          mapStatusEl.textContent = 'Partially Connected';
          mapStatusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400';
        } else {
          mapStatusEl.textContent = 'Not Connected';
          mapStatusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-stone-400';
        }
      });
    }

  function onLocalChange() {
    const merged = { ...state, ...readFormState() };
    updateCompletionBar(completionPercent(merged));
  }

  paint();
  wireSavedRoutesRemove();
  wireAvatarUpload();

  wirePrefCards(seatGrid, false, onLocalChange);
  wirePrefCards(categoryGrid, true, onLocalChange);
  wirePrefCards(routePrefs, false, onLocalChange);
  wirePrefCards(facilitiesGrid, true, onLocalChange);
  wireToggles(main, onLocalChange);

  accSelect?.addEventListener('change', onLocalChange);

  document.querySelector('#profile-save-btn')?.addEventListener('click', () => {
    const next = readFormState();
    state = next;
    persistOnboardingSlice(state);
    paint();
    updateCompletionBar(completionPercent(state));
    showToast('Settings saved successfully.', { duration: 3200, type: 'info' });
  });

  const demoToggle = document.querySelector('#profile-demo-toggle');
  if (demoToggle instanceof HTMLInputElement) {
    demoToggle.checked = isDemoMode();
    demoToggle.addEventListener('change', () => {
      setDemoMode(demoToggle.checked);
      showToast(
        demoToggle.checked
          ? 'Demo mode on: live simulations enabled.'
          : 'Demo mode off: static data until you refresh pages.',
        { duration: 3200 },
      );
    });
  }

  document.querySelector('#profile-reset-btn')?.addEventListener('click', () => {
    [
      ONBOARD.seatSection,
      ONBOARD.favoriteCategories,
      ONBOARD.routePreference,
      ONBOARD.accessibilityPreference,
      ONBOARD.complete,
      PROFILE_NOTIFICATIONS,
      PROFILE_SECURITY,
      PROFILE_FACILITIES,
      PROFILE_ACCESSIBILITY_UI,
      PROFILE_AVATAR_KEY,
      LS_GEMINI_API_KEY,
      'crowdpilotSavedRoutes',
    ].forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    });
    state = loadState();
    paint();
    showToast('Preferences reset to defaults.', { duration: 3200, type: 'info' });
  });

  return {
    getState: () => ({ ...state }),
    refresh: paint,
  };
}
