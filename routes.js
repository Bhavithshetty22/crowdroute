import { saveToStorage, loadFromStorage, showToast, randomInt, isDemoMode } from './shared.js';

const DATA_URL = new URL('data/routes-data.json', import.meta.url).href;
const KEY_DEST = 'crowdpilotRoutesDestination';
const KEY_CAT = 'crowdpilotRoutesCategory';
export const SAVED_ROUTES_KEY = 'crowdpilotSavedRoutes';

const SIM_MS = { min: 6000, max: 12000 };

const CAT_ORDER = ['fastest', 'least_crowded', 'accessible'];
const CAT_META = {
  fastest: { title: 'Fastest Route', cardClass: 'orange', icon: 'bolt', headBadge: '⚡ Recommended' },
  least_crowded: {
    title: 'Least Crowded',
    cardClass: 'green',
    icon: 'groups',
    headBadge: '🌿 Calmest',
  },
  accessible: {
    title: 'Accessible Route',
    cardClass: 'blue',
    icon: 'accessible',
    headBadge: '♿ Accessible',
  },
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function injectRoutesStyles() {
  if (document.getElementById('crowdpilot-routes-js-styles')) return;
  const el = document.createElement('style');
  el.id = 'crowdpilot-routes-js-styles';
  el.textContent = `
    #routes-preview-svg path[data-route-line] {
      transition: d 0.55s ease, stroke 0.45s ease, opacity 0.35s ease,
        stroke-dashoffset 0.45s ease;
    }
    .route-step.route-step-done { opacity: 0.55; }
    .route-step.route-step-active .step-icon {
      background: rgba(255,107,0,0.25) !important;
      box-shadow: 0 0 0 2px rgba(255,107,0,0.45);
    }
    .route-step.route-step-active .text-sm { color: #fff; }
    #routes-map-preview.route-map-pulse::after {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      animation: routes-map-pulse 1.2s ease-out infinite;
    }
    @keyframes routes-map-pulse {
      0% { box-shadow: inset 0 0 0 0 rgba(255,107,0,0.25); }
      70% { box-shadow: inset 0 0 40px 2px rgba(255,107,0,0.08); }
      100% { box-shadow: inset 0 0 0 0 rgba(255,107,0,0); }
    }
  `;
  document.head.appendChild(el);
}

function getDest(data, id) {
  return data.destinations?.find((d) => d.id === id) || data.destinations?.[0];
}

function recommendedKey(routes) {
  let best = 'fastest';
  let min = Infinity;
  for (const k of CAT_ORDER) {
    const w = Number(routes[k]?.walkMinutes);
    if (!Number.isNaN(w) && w < min) {
      min = w;
      best = k;
    }
  }
  return best;
}

function renderDestPills(destinations, activeId, root) {
  if (!root) return;
  root.innerHTML = destinations
    .map((d) => {
      const on = d.id === activeId;
      const cls = on
        ? 'dest-btn flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-container/15 border border-primary-container/40 text-primary-container text-xs font-bold'
        : 'dest-btn flex items-center gap-2 px-4 py-2 rounded-xl glass-card text-stone-400 text-xs font-bold hover:text-white glide border border-white/08';
      return `<button type="button" class="${cls}" data-dest-id="${escapeHtml(d.id)}">
        <span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 1;">${escapeHtml(d.icon)}</span> ${escapeHtml(d.label)}
      </button>`;
    })
    .join('');
}

function statPills(r, cat) {
  const fourthLabel = cat === 'accessible' ? 'Accessibility' : 'Difficulty';
  const fourthVal = cat === 'accessible' ? r.accessibility || '—' : r.difficulty || '—';
  const fourthCls = cat === 'accessible' ? 'text-blue-400' : 'text-tertiary';
  return `
    <div class="stat-pill"><p class="text-[10px] text-stone-500 uppercase font-bold mb-1">Walk Time</p><p class="text-xl font-black text-primary-container headline-font route-walk">${escapeHtml(String(r.walkMinutes))} min</p></div>
    <div class="stat-pill"><p class="text-[10px] text-stone-500 uppercase font-bold mb-1">Distance</p><p class="text-xl font-black headline-font route-dist">${escapeHtml(String(r.distanceM))}m</p></div>
    <div class="stat-pill"><p class="text-[10px] text-stone-500 uppercase font-bold mb-1">Congestion</p><p class="text-xl font-black text-secondary-container headline-font route-cong">${escapeHtml(r.congestion)}</p></div>
    <div class="stat-pill"><p class="text-[10px] text-stone-500 uppercase font-bold mb-1">${escapeHtml(fourthLabel)}</p><p class="text-xl font-black headline-font route-stat-4 ${fourthCls}">${escapeHtml(fourthVal)}</p></div>
  `;
}

function renderRouteCards(dest, selectedCat, recKey, root) {
  if (!root || !dest?.routes) return;
  const routes = dest.routes;
  root.innerHTML = CAT_ORDER.map((cat) => {
    const r = routes[cat];
    const meta = CAT_META[cat];
    const rec = cat === recKey;
    const head = rec
      ? `<span class="badge-best">Recommended</span>`
      : `<span class="text-[10px] bg-white/08 text-stone-400 px-2 py-0.5 rounded-full border border-white/10 font-bold uppercase tracking-widest">${escapeHtml(meta.headBadge)}</span>`;

    const btnCls =
      meta.cardClass === 'green'
        ? 'w-full bg-tertiary/15 text-tertiary border border-tertiary/30 py-3 rounded-xl font-bold text-sm hover:bg-tertiary/25 glide'
        : meta.cardClass === 'blue'
          ? 'w-full bg-blue-500/15 text-blue-400 border border-blue-500/30 py-3 rounded-xl font-bold text-sm hover:bg-blue-500/25 glide'
          : 'w-full bg-primary-container text-white py-3 rounded-xl font-bold text-sm hover:brightness-110 glide';

    return `
      <div class="route-card" data-route-cat="${cat}" role="button" tabindex="0">
        <div class="flex justify-between items-start mb-5">
          <div>
            <div class="flex items-center gap-2 mb-2">${head}</div>
            <h3 class="text-xl font-black headline-font">${escapeHtml(meta.title)}</h3>
          </div>
          <div class="w-12 h-12 ${meta.cardClass === 'green' ? 'bg-tertiary/15' : meta.cardClass === 'blue' ? 'bg-blue-500/15' : 'bg-primary-container/15'} rounded-2xl flex items-center justify-center">
            <span class="material-symbols-outlined ${meta.cardClass === 'green' ? 'text-tertiary' : meta.cardClass === 'blue' ? 'text-blue-400' : 'text-primary-container'} text-xl" style="font-variation-settings:'FILL' 1;">${escapeHtml(meta.icon)}</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-5">${statPills(r, cat)}</div>
        <p class="text-xs text-stone-400 leading-relaxed mb-5 route-summary">${escapeHtml(r.summary)}</p>
        <button type="button" class="route-nav-btn ${btnCls}">Navigate This Route</button>
        <button type="button" class="route-save-btn w-full mt-2 py-2.5 rounded-xl text-xs font-bold border border-white/12 text-stone-400 hover:text-primary-container hover:border-primary-container/35 glide">Save route</button>
      </div>`;
  }).join('');

  applyCardSelection(root, selectedCat);
}

function selClassFor(cat) {
  return CAT_META[cat]?.cardClass || 'orange';
}

function applyCardSelection(root, selectedCat) {
  root.querySelectorAll('.route-card').forEach((card) => {
    const cat = card.dataset.routeCat;
    const sel = cat === selectedCat;
    card.classList.remove('selected', 'selected-green', 'selected-blue');
    if (sel) {
      const c = selClassFor(cat);
      if (c === 'orange') card.classList.add('selected');
      if (c === 'green') card.classList.add('selected-green');
      if (c === 'blue') card.classList.add('selected-blue');
    }
  });
}

function updatePreviewSvg(svg, pathStr, stroke) {
  if (!svg) return;
  let path = svg.querySelector('path[data-route-line]');
  if (!path) {
    path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('data-route-line', '1');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-width', '4');
    const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
    anim.setAttribute('attributeName', 'stroke-dashoffset');
    anim.setAttribute('from', '0');
    anim.setAttribute('to', '-100');
    anim.setAttribute('dur', '3s');
    anim.setAttribute('repeatCount', 'indefinite');
    path.appendChild(anim);
    svg.appendChild(path);
  }
  path.style.opacity = '0.35';
  window.requestAnimationFrame(() => {
    path.setAttribute('d', pathStr);
    path.setAttribute('stroke', stroke);
    path.setAttribute('stroke-dasharray', '12 6');
    path.style.opacity = '0.9';
  });
}

function updateSteps(container, steps, destLabel, activeIndex = -1) {
  if (!container) return;
  const list = (steps || [])
    .map(
      (s, i) => {
        const done = activeIndex >= 0 && i < activeIndex;
        const active = activeIndex >= 0 && i === activeIndex;
        const iconBg = active || (activeIndex < 0 && i === 0) ? 'bg-primary-container/15' : 'bg-white/05';
        const iconCol = active || (activeIndex < 0 && i === 0) ? 'text-primary-container' : 'text-stone-400';
        const cls = `route-step${done ? ' route-step-done' : ''}${active ? ' route-step-active' : ''}`;
        return `
    <div class="${cls}" data-route-step-index="${i}">
      <div class="step-icon ${iconBg} shrink-0">
        <span class="material-symbols-outlined ${iconCol} text-sm" style="font-variation-settings:'FILL' 1;">${escapeHtml(s.icon)}</span>
      </div>
      <div>
        <p class="text-sm font-bold">${escapeHtml(s.title)}</p>
        <p class="text-xs text-stone-500">${escapeHtml(s.subtitle)}</p>
      </div>
    </div>`;
      },
    )
    .join('');
  container.innerHTML = list;
}

function applyPathProgress(svg, fraction) {
  const path = svg?.querySelector('path[data-route-line]');
  if (!path || typeof path.getTotalLength !== 'function') return;
  const len = path.getTotalLength();
  if (!len || Number.isNaN(len)) return;
  const f = Math.min(1, Math.max(0, fraction));
  path.style.strokeDasharray = String(len);
  path.style.strokeDashoffset = String(len * (1 - f));
}

function clearPathProgress(svg) {
  const path = svg?.querySelector('path[data-route-line]');
  if (!path) return;
  path.style.strokeDasharray = '12 6';
  path.style.strokeDashoffset = '0';
}

export function getSavedRoutes() {
  return loadFromStorage(SAVED_ROUTES_KEY, []) || [];
}

export function persistSavedRoutes(list) {
  saveToStorage(SAVED_ROUTES_KEY, list);
}

export function addSavedRouteEntry(entry) {
  const list = getSavedRoutes().filter((r) => r.id !== entry.id);
  list.unshift(entry);
  persistSavedRoutes(list.slice(0, 24));
}

export function removeSavedRouteById(id) {
  persistSavedRoutes(getSavedRoutes().filter((r) => r.id !== id));
}

function updateCardStats(root, dest) {
  if (!dest?.routes) return;
  root.querySelectorAll('[data-route-cat]').forEach((card) => {
    const cat = card.dataset.routeCat;
    const r = dest.routes[cat];
    if (!r) return;
    const w = card.querySelector('.route-walk');
    const d = card.querySelector('.route-dist');
    const c = card.querySelector('.route-cong');
    const sum = card.querySelector('.route-summary');
    if (w) w.textContent = `${r.walkMinutes} min`;
    if (d) d.textContent = `${r.distanceM}m`;
    if (c) c.textContent = r.congestion;
    const s4 = card.querySelector('.route-stat-4');
    if (s4) {
      s4.textContent = cat === 'accessible' ? r.accessibility || '—' : r.difficulty || '—';
      s4.className = `text-xl font-black headline-font route-stat-4 ${
        cat === 'accessible' ? 'text-blue-400' : 'text-tertiary'
      }`;
    }
    if (sum) sum.textContent = r.summary;
  });
}

function minWalkSnapshot(dest) {
  if (!dest?.routes) return 999;
  return Math.min(...CAT_ORDER.map((k) => Number(dest.routes[k]?.walkMinutes) || 999));
}

/**
 * @param {object} [opts]
 * @param {string} [opts.dataUrl]
 */
export function initRoutes(opts = {}) {
  injectRoutesStyles();
  const dataUrl = opts.dataUrl ?? DATA_URL;

  const pillsRoot = document.querySelector('#routes-dest-pills');
  const cardsRoot = document.querySelector('#routes-cards-row');
  const stepsRoot = document.querySelector('#routes-steps-list');
  const svg = document.querySelector('#routes-preview-svg');
  const captionTitle = document.querySelector('#routes-preview-title');
  const captionSub = document.querySelector('#routes-preview-sub');
  const mapBox = document.querySelector('#routes-map-preview');
  const startNavBtn = document.querySelector('#routes-start-nav');

  if (!cardsRoot) return null;

  let data = { destinations: [] };
  let destId = loadFromStorage(KEY_DEST, 'food') || 'food';
  let category = loadFromStorage(KEY_CAT, 'fastest') || 'fastest';
  let simTimer = null;
  let navActive = false;
  let navStep = 0;

  function persist() {
    saveToStorage(KEY_DEST, destId);
    saveToStorage(KEY_CAT, category);
  }

  function resetNavUiOnly() {
    navActive = false;
    navStep = 0;
    if (startNavBtn) {
      startNavBtn.textContent = 'Start navigation';
      startNavBtn.setAttribute('aria-expanded', 'false');
    }
  }

  function endNavigation() {
    resetNavUiOnly();
    clearPathProgress(svg);
    const dest = getDest(data, destId);
    const r = dest?.routes?.[category];
    if (r) {
      updatePreviewSvg(svg, r.svgPath || '', r.stroke || '#ff6b00');
      updateSteps(stepsRoot, r.steps, dest.label, -1);
      if (captionSub) captionSub.textContent = `${r.walkMinutes} min · ${r.distanceM}m`;
    }
  }

  function paintNavigation() {
    const dest = getDest(data, destId);
    const r = dest?.routes?.[category];
    if (!dest || !r?.steps?.length) return;
    const steps = r.steps;
    updatePreviewSvg(svg, r.svgPath || '', r.stroke || '#ff6b00');
    updateSteps(stepsRoot, steps, dest.label, navStep);
    const frac = (navStep + 1) / steps.length;
    window.requestAnimationFrame(() => applyPathProgress(svg, frac));
    if (captionSub) captionSub.textContent = `Step ${navStep + 1} of ${steps.length} · ${r.walkMinutes} min total`;
    if (captionTitle)
      captionTitle.textContent = `${CAT_META[category]?.title || 'Navigating'} — ${dest.label}`;
    if (startNavBtn) {
      startNavBtn.textContent = navStep >= steps.length - 1 ? 'Finish' : 'Next step';
      startNavBtn.setAttribute('aria-expanded', 'true');
    }
  }

  function beginNavigation() {
    const dest = getDest(data, destId);
    const r = dest?.routes?.[category];
    if (!r?.steps?.length) return;
    navActive = true;
    navStep = 0;
    paintNavigation();
  }

  function advanceNavigation() {
    const dest = getDest(data, destId);
    const r = dest?.routes?.[category];
    if (!r?.steps?.length) return;
    if (navStep >= r.steps.length - 1) {
      endNavigation();
      showToast('Route complete — you reached the final step.', { duration: 3200 });
      return;
    }
    navStep += 1;
    paintNavigation();
  }

  function syncUI() {
    resetNavUiOnly();
    const dest = getDest(data, destId);
    if (!dest) return;
    const rec = recommendedKey(dest.routes);
    renderDestPills(data.destinations || [], destId, pillsRoot);
    renderRouteCards(dest, category, rec, cardsRoot);
    applyCardSelection(cardsRoot, category);

    const r = dest.routes[category];
    if (r) {
      updatePreviewSvg(svg, r.svgPath || '', r.stroke || '#ff6b00');
      clearPathProgress(svg);
      updateSteps(stepsRoot, r.steps, dest.label, -1);
      if (captionTitle)
        captionTitle.textContent = `${CAT_META[category]?.title || 'Route'} — ${dest.label}`;
      if (captionSub) captionSub.textContent = `${r.walkMinutes} min · ${r.distanceM}m`;
    }
    mapBox?.classList.add('route-map-pulse');
    window.setTimeout(() => mapBox?.classList.remove('route-map-pulse'), 1400);
  }

  function wire() {
    pillsRoot?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-dest-id]');
      if (!btn) return;
      destId = btn.dataset.destId;
      persist();
      syncUI();
    });

    cardsRoot.addEventListener('click', (e) => {
      const navCardBtn = e.target.closest('.route-nav-btn');
      if (navCardBtn) {
        e.stopPropagation();
        const card = navCardBtn.closest('.route-card');
        category = card?.dataset.routeCat || category;
        persist();
        applyCardSelection(cardsRoot, category);
        const dest = getDest(data, destId);
        const r = dest?.routes?.[category];
        if (r) {
          updatePreviewSvg(svg, r.svgPath, r.stroke);
          clearPathProgress(svg);
          updateSteps(stepsRoot, r.steps, dest?.label || '', -1);
          if (captionTitle)
            captionTitle.textContent = `${CAT_META[category]?.title || 'Route'} — ${dest?.label || ''}`;
          if (captionSub) captionSub.textContent = `${r.walkMinutes} min · ${r.distanceM}m`;
        }
        beginNavigation();
        return;
      }

      const saveBtn = e.target.closest('.route-save-btn');
      if (saveBtn) {
        e.stopPropagation();
        const card = saveBtn.closest('.route-card');
        const cat = card?.dataset.routeCat || category;
        const dest = getDest(data, destId);
        const r = dest?.routes?.[cat];
        if (!r) return;
        const id =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `sr-${Date.now()}`;
        addSavedRouteEntry({
          id,
          destId,
          category: cat,
          destLabel: dest?.label || '',
          routeTitle: CAT_META[cat]?.title || cat,
          summary: r.summary,
          savedAt: new Date().toISOString(),
        });
        showToast('Route saved. Open Profile to view or remove it.', { duration: 3200 });
        return;
      }

      const card = e.target.closest('.route-card');
      if (!card) return;
      if (navActive) {
        resetNavUiOnly();
        clearPathProgress(svg);
      }
      category = card.dataset.routeCat || 'fastest';
      persist();
      applyCardSelection(cardsRoot, category);
      const dest = getDest(data, destId);
      const r = dest?.routes?.[category];
      if (r) {
        updatePreviewSvg(svg, r.svgPath, r.stroke);
        clearPathProgress(svg);
        updateSteps(stepsRoot, r.steps, dest.label, -1);
        if (captionTitle)
          captionTitle.textContent = `${CAT_META[category]?.title || 'Route'} — ${dest?.label || ''}`;
        if (captionSub) captionSub.textContent = `${r.walkMinutes} min · ${r.distanceM}m`;
      }
    });

    startNavBtn?.addEventListener('click', () => {
      if (!navActive) beginNavigation();
      else advanceNavigation();
    });
  }

  const CONG_LEVELS = ['Low', 'Medium', 'Moderate', 'High', 'Critical', 'Variable'];

  function simulate() {
    const dest = getDest(data, destId);
    if (!dest?.routes) return;
    const beforeMin = minWalkSnapshot(dest);
    for (const k of CAT_ORDER) {
      const r = dest.routes[k];
      if (!r) continue;
      r.walkMinutes = Math.max(1, (Number(r.walkMinutes) || 0) + randomInt(-1, 1));
      r.distanceM = Math.max(80, (Number(r.distanceM) || 0) + randomInt(-15, 20));
      if (Math.random() < 0.35) {
        const idx = CONG_LEVELS.indexOf(r.congestion);
        const next =
          idx < 0
            ? randomInt(0, CONG_LEVELS.length - 1)
            : Math.min(CONG_LEVELS.length - 1, Math.max(0, idx + randomInt(-1, 1)));
        r.congestion = CONG_LEVELS[next];
      }
      if (Math.random() < 0.2 && k !== 'accessible') {
        r.difficulty = randomInt(0, 1) ? 'Easy' : 'Moderate';
      }
    }
    updateCardStats(cardsRoot, dest);
    const afterMin = minWalkSnapshot(dest);
    if (beforeMin - afterMin >= 2) {
      showToast('A faster route is available — walk time dropped.', { duration: 4500 });
    }
    const r = dest.routes[category];
    if (r && captionSub && !navActive) captionSub.textContent = `${r.walkMinutes} min · ${r.distanceM}m`;
  }

  function scheduleSim() {
    if (opts.enableSimulation === false || !isDemoMode()) return;
    simTimer = window.setTimeout(() => {
      simulate();
      scheduleSim();
    }, randomInt(SIM_MS.min, SIM_MS.max));
  }

  if (cardsRoot) {
    cardsRoot.innerHTML = Array.from({ length: 3 }, () => '<div class="cp-skel rounded-[24px] min-h-[260px]" aria-hidden="true"></div>').join('');
  }
  if (pillsRoot) {
    pillsRoot.innerHTML =
      '<div class="flex gap-3 flex-wrap">' +
      Array.from({ length: 5 }, () => '<div class="cp-skel h-10 w-28 rounded-xl" aria-hidden="true"></div>').join('') +
      '</div>';
  }
  if (stepsRoot) {
    stepsRoot.innerHTML = Array.from({ length: 4 }, () => '<div class="cp-skel h-14 rounded-xl mb-3" aria-hidden="true"></div>').join('');
  }

  fetch(dataUrl, { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    })
    .then((json) => {
      data = json;
      if (!getDest(data, destId)) destId = data.destinations?.[0]?.id || 'food';
      if (!CAT_ORDER.includes(category)) category = 'fastest';
      wire();
      syncUI();
      scheduleSim();
    })
    .catch(() => {
      showToast('Could not load routes. Refresh to retry.', { duration: 5000, type: 'error' });
      if (cardsRoot) {
        cardsRoot.innerHTML = `<div class="cp-empty-state lg:col-span-3">
          <div class="cp-empty-icon" aria-hidden="true">🛤️</div>
          <h3 class="headline-font">Could not load routes</h3>
          <p>Check your connection and ensure data/routes-data.json is available.</p>
        </div>`;
      }
    });

  return {
    stop() {
      if (simTimer) clearTimeout(simTimer);
      simTimer = null;
    },
    getState: () => ({ destId, category }),
  };
}
