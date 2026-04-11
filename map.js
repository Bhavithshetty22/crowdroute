import { saveToStorage, loadFromStorage, showToast, randomInt, isDemoMode } from './shared.js';

const CROWD_URL = new URL('data/crowd-data.json', import.meta.url).href;
const ROUTES_URL = new URL('data/routes-data.json', import.meta.url).href;
const KEY_FILTER = 'crowdpilotMapRouteFilter';

const CAT_ORDER = ['fastest', 'least_crowded', 'accessible'];
const FILTER_META = {
  fastest: { label: '⚡ Fastest Route', key: 'fastest' },
  least_crowded: { label: '👥 Least Crowded', key: 'least_crowded' },
  accessible: { label: '♿ Accessible', key: 'accessible' },
};

const ZONE_LAYOUT = {
  north: { leftPct: 15, topPct: 30, w: 240, h: 240 },
  east: { leftPct: 42, topPct: 48, w: 200, h: 200 },
  south: { leftPct: 52, topPct: 58, w: 220, h: 220 },
  parkingA: { leftPct: 72, topPct: 68, w: 180, h: 180 },
};

const CONGESTION_RANK = {
  clear: 0,
  low: 1,
  free: 1,
  medium: 2,
  moderate: 2,
  variable: 2,
  busy: 3,
  congested: 4,
  high: 4,
  critical: 5,
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function congestionRank(label) {
  if (!label) return 0;
  const k = String(label).toLowerCase();
  for (const [word, rank] of Object.entries(CONGESTION_RANK)) {
    if (k.includes(word)) return rank;
  }
  return 2;
}

function densityHue(pct) {
  if (pct >= 75) return 'bg-red-500';
  if (pct >= 55) return 'bg-orange-500';
  if (pct >= 35) return 'bg-yellow-400';
  return 'bg-green-500';
}

function injectMapStyles() {
  if (document.getElementById('crowdpilot-map-js-styles')) return;
  const el = document.createElement('style');
  el.id = 'crowdpilot-map-js-styles';
  el.textContent = `
    #map-route-path[data-map-route] {
      transition: d 0.55s ease, stroke 0.45s ease, opacity 0.35s ease;
    }
    .map-heat-zone {
      position: absolute;
      border-radius: 50%;
      filter: blur(50px);
      pointer-events: none;
      transition: opacity 0.6s ease, transform 0.8s ease;
      will-change: opacity, transform;
    }
    .map-pin-el {
      position: absolute;
      transform: translate(-50%, -100%);
      cursor: pointer;
      transition: transform 0.2s ease, filter 0.2s ease;
      z-index: 5;
    }
    .map-pin-el:hover { transform: translate(-50%, -108%) scale(1.06); z-index: 8; }
    .map-pin-el.map-pin-selected { z-index: 12; filter: drop-shadow(0 0 12px rgba(255,107,0,0.85)); transform: translate(-50%, -108%) scale(1.12); }
    #map-tooltip {
      position: fixed;
      z-index: 10050;
      pointer-events: none;
      max-width: 260px;
      padding: 8px 10px;
      border-radius: 10px;
      background: rgba(15,15,15,0.92);
      border: 1px solid rgba(255,255,255,0.12);
      color: #e5e2e1;
      font-size: 11px;
      line-height: 1.35;
      opacity: 0;
      transition: opacity 0.15s ease;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    }
    #map-tooltip.visible { opacity: 1; }
  `;
  document.head.appendChild(el);
}

function iconForKind(kind) {
  switch (kind) {
    case 'you':
      return 'person_pin';
    case 'food':
      return 'restaurant';
    case 'washroom':
      return 'wc';
    case 'gate':
      return 'door_front';
    case 'parking':
      return 'local_parking';
    case 'emergency':
      return 'emergency';
    default:
      return 'place';
  }
}

function pinShell(pin) {
  const k = pin.kind;
  if (k === 'you') {
    return `<div class="relative">
      <div class="absolute inset-0 bg-primary-container rounded-full opacity-30 animate-ping scale-150"></div>
      <div class="w-8 h-8 bg-primary-container rounded-full border-4 border-white flex items-center justify-center relative z-10" style="box-shadow:0 0 24px rgba(255,107,0,0.6)">
        <span class="material-symbols-outlined text-white text-xs" style="font-variation-settings:'FILL' 1;">person_pin</span>
      </div>
    </div>
    <div class="glass-panel px-2 py-1 rounded-lg mt-1 text-center whitespace-nowrap"><p class="text-[10px] font-bold text-primary-container">${escapeHtml(pin.label)}</p></div>`;
  }
  const colors = {
    food: ['bg-tertiary', 'text-black', 'rgba(83,225,111,0.5)'],
    washroom: ['bg-secondary-container', 'text-black', 'rgba(254,183,0,0.5)'],
    gate: ['bg-blue-500', 'text-white', 'rgba(59,130,246,0.5)'],
    parking: ['bg-amber-500', 'text-black', 'rgba(245,158,11,0.5)'],
    emergency: ['bg-red-600', 'text-white', 'rgba(220,38,38,0.5)'],
  };
  const [bg, fg, glow] = colors[k] || ['bg-white/20', 'text-white', 'rgba(255,255,255,0.3)'];
  const pulse = k === 'emergency' ? ' animate-pulse' : '';
  return `<div class="w-8 h-8 ${bg} rounded-full border-2 border-black flex items-center justify-center${pulse}" style="box-shadow:0 0 18px ${glow}">
      <span class="material-symbols-outlined ${fg} text-xs" style="font-variation-settings:'FILL' 1;">${escapeHtml(iconForKind(k))}</span>
    </div>
    <div class="glass-panel px-2 py-1 rounded-lg mt-1 text-center whitespace-nowrap"><p class="text-[10px] font-bold ${k === 'food' ? 'text-tertiary' : k === 'washroom' ? 'text-secondary-container' : k === 'gate' ? 'text-blue-400' : k === 'parking' ? 'text-amber-400' : 'text-red-400'}">${escapeHtml(pin.label)}</p></div>`;
}

function renderFilterChips(root, activeKey) {
  if (!root) return;
  root.innerHTML = CAT_ORDER.map((k) => {
    const meta = FILTER_META[k];
    const on = k === activeKey;
    return `<button type="button" class="filter-chip${on ? ' active' : ''}" data-map-filter="${k}">${escapeHtml(meta.label)}</button>`;
  }).join('');
}

function renderHeatZones(container, zones) {
  if (!container) return;
  container.innerHTML = (zones || [])
    .map((z) => {
      const lay = ZONE_LAYOUT[z.id] || { leftPct: 50, topPct: 50, w: 160, h: 160 };
      const pct = Number(z.densityPct) || 0;
      const hue = densityHue(pct);
      const op = 0.22 + (pct / 100) * 0.55;
      const sc = 0.85 + (pct / 100) * 0.35;
      return `<div class="map-heat-zone heat-zone ${hue}" data-zone="${escapeHtml(z.id)}" style="left:${lay.leftPct}%;top:${lay.topPct}%;width:${lay.w}px;height:${lay.h}px;opacity:${op.toFixed(2)};transform:translate(-50%,-50%) scale(${sc.toFixed(2)})"></div>`;
    })
    .join('');
}

function renderPins(layer, pins, selectedId, onSelect) {
  if (!layer) return;
  layer.innerHTML = (pins || [])
    .map((p) => {
      const sel = p.id === selectedId ? ' map-pin-selected' : '';
      return `<div class="map-pin-el${sel}" style="left:${p.leftPct}%;top:${p.topPct}%;" data-pin-id="${escapeHtml(p.id)}" data-pin-kind="${escapeHtml(p.kind)}" title="${escapeHtml(p.tooltip || p.label)}">${pinShell(p)}</div>`;
    })
    .join('');

  layer.querySelectorAll('.map-pin-el').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.pinId;
      onSelect(id);
    });
    el.addEventListener('mouseenter', (ev) => showPinTooltip(ev, el));
    el.addEventListener('mousemove', (ev) => movePinTooltip(ev));
    el.addEventListener('mouseleave', hidePinTooltip);
  });
}

let tooltipEl = null;
/** @type {Array<{id:string,label?:string,tooltip?:string}>} */
let pinTooltipIndex = [];

function ensureTooltip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.id = 'map-tooltip';
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function showPinTooltip(ev, el) {
  const id = el.dataset.pinId;
  const pin = pinTooltipIndex.find((p) => p.id === id);
  const tip = ensureTooltip();
  tip.innerHTML = pin
    ? `<strong class="text-primary-container">${escapeHtml(pin.label || '')}</strong><br/><span class="text-stone-400">${escapeHtml(pin.tooltip || '')}</span>`
    : escapeHtml(el.getAttribute('title') || '');
  tip.classList.add('visible');
  movePinTooltip(ev);
}

function movePinTooltip(ev) {
  const tip = ensureTooltip();
  const pad = 14;
  tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - pad, ev.clientX + pad)}px`;
  tip.style.top = `${Math.min(window.innerHeight - tip.offsetHeight - pad, ev.clientY + pad)}px`;
}

function hidePinTooltip() {
  tooltipEl?.classList.remove('visible');
}

function updateRoutePath(pathEl, d, stroke) {
  if (!pathEl) return;
  pathEl.style.opacity = '0.35';
  window.requestAnimationFrame(() => {
    pathEl.setAttribute('d', d || '');
    if (stroke) pathEl.setAttribute('stroke', stroke);
    pathEl.style.opacity = '0.95';
  });
}

function initMapPanZoom() {
  const viewport = document.querySelector('#map-viewport');
  const layer = document.querySelector('#map-transform-layer');
  if (!viewport || !layer) return;

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let rot = 0;
  const MIN = 1;
  const MAX = 3.25;

  function apply() {
    layer.style.transform = `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rot}deg)`;
  }

  let drag = false;
  let lx = 0;
  let ly = 0;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = true;
    lx = e.clientX;
    ly = e.clientY;
    try {
      viewport.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!drag) return;
    tx += e.clientX - lx;
    ty += e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
    apply();
  });

  const endDrag = (e) => {
    if (!drag) return;
    drag = false;
    try {
      viewport.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const next = Math.min(MAX, Math.max(MIN, scale + delta));
      const rect = viewport.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const mx = cx - rect.width / 2;
      const my = cy - rect.height / 2;
      const factor = next / scale;
      tx = mx - (mx - tx) * factor;
      ty = my - (my - ty) * factor;
      scale = next;
      apply();
    },
    { passive: false },
  );

  document.querySelector('#map-zoom-in')?.addEventListener('click', () => {
    scale = Math.min(MAX, scale + 0.22);
    apply();
  });
  document.querySelector('#map-zoom-out')?.addEventListener('click', () => {
    scale = Math.max(MIN, scale - 0.22);
    if (scale <= MIN + 0.01) {
      tx = 0;
      ty = 0;
    }
    apply();
  });
  document.querySelector('#map-recenter')?.addEventListener('click', () => {
    tx = 0;
    ty = 0;
    scale = MIN;
    rot = 0;
    apply();
  });
  document.querySelector('#map-rotate-demo')?.addEventListener('click', () => {
    rot = (rot - 90) % 360;
    apply();
  });
}

function avgDensity(zones) {
  if (!zones?.length) return 0;
  return Math.round(zones.reduce((a, z) => a + (Number(z.densityPct) || 0), 0) / zones.length);
}

function crowdScoreLabel(pct) {
  if (pct >= 72) return 'High';
  if (pct >= 48) return 'Moderate';
  if (pct >= 28) return 'Medium';
  return 'Low';
}

const ROUTE_HEADLINE = {
  fastest: 'Fastest route',
  least_crowded: 'Least crowded route',
  accessible: 'Accessible route',
};

function updatePanel(panel, destFood, filterKey, zones) {
  if (!panel || !destFood?.routes) return;
  const r = destFood.routes[filterKey];
  if (!r) return;
  const title = panel.querySelector('.js-map-route-title');
  const walk = panel.querySelector('.js-map-walk');
  const dist = panel.querySelector('.js-map-dist');
  const cong = panel.querySelector('.js-map-congestion');
  const dens = panel.querySelector('.js-map-crowd-density');
  if (title) title.textContent = `${ROUTE_HEADLINE[filterKey] || 'Route'} → ${destFood.label}`;
  if (walk) walk.textContent = `${r.walkMinutes} min`;
  if (dist) dist.textContent = `${r.distanceM}m`;
  if (cong) cong.textContent = r.congestion;
  if (dens) dens.textContent = `${crowdScoreLabel(avgDensity(zones))} (${avgDensity(zones)}%)`;
}

/**
 * @param {object} [opts]
 * @param {string} [opts.crowdUrl]
 * @param {string} [opts.routesUrl]
 * @param {boolean} [opts.enableSimulation]
 */
export function initMap(opts = {}) {
  injectMapStyles();
  const crowdUrl = opts.crowdUrl ?? CROWD_URL;
  const routesUrl = opts.routesUrl ?? ROUTES_URL;

  const chipsRoot = document.querySelector('#map-filter-chips');
  const heatRoot = document.querySelector('#map-heat-zones');
  const pinsLayer = document.querySelector('#map-pins-layer');
  const pathEl = document.querySelector('#map-route-path');
  const panels = document.querySelectorAll('[data-route-summary-panel]');

  if (!pathEl || !panels.length) return null;

  let filterKey = loadFromStorage(KEY_FILTER, 'fastest') || 'fastest';
  if (!CAT_ORDER.includes(filterKey)) filterKey = 'fastest';

  let crowd = { zones: [] };
  let routesPayload = { destinations: [], mapOverlay: { pins: [], paths: {} } };
  let selectedPinId = null;
  let simTimer = null;

  function persistFilter() {
    saveToStorage(KEY_FILTER, filterKey);
  }

  function handlePinPick(id) {
    selectedPinId = selectedPinId === id ? null : id;
    pinTooltipIndex = routesPayload.mapOverlay?.pins || [];
    renderPins(pinsLayer, routesPayload.mapOverlay?.pins, selectedPinId, handlePinPick);
  }

  function paint() {
    const destFood = routesPayload.destinations?.find((d) => d.id === 'food') || routesPayload.destinations?.[0];
    const paths = routesPayload.mapOverlay?.paths || {};
    const pathD = paths[filterKey] || paths.fastest || '';
    const destRoute = destFood?.routes?.[filterKey];
    const stroke = destRoute?.stroke || '#ff6b00';
    updateRoutePath(pathEl, pathD, stroke);
    renderHeatZones(heatRoot, crowd.zones);
    pinTooltipIndex = routesPayload.mapOverlay?.pins || [];
    renderPins(pinsLayer, routesPayload.mapOverlay?.pins, selectedPinId, handlePinPick);
    panels.forEach((p) => updatePanel(p, destFood, filterKey, crowd.zones));
    renderFilterChips(chipsRoot, filterKey);
  }

  function wire() {
    chipsRoot?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-map-filter]');
      if (!btn) return;
      filterKey = btn.dataset.mapFilter || 'fastest';
      persistFilter();
      paint();
    });
  }

  function simulate() {
    const destFood = routesPayload.destinations?.find((d) => d.id === 'food') || routesPayload.destinations?.[0];
    if (!destFood?.routes?.[filterKey]) return;

    (crowd.zones || []).forEach((z) => {
      z.densityPct = Math.min(98, Math.max(5, (Number(z.densityPct) || 0) + randomInt(-8, 10)));
    });

    const r = destFood.routes[filterKey];
    const beforeRank = congestionRank(r.congestion);
    if (Math.random() < 0.45) {
      const labels = ['Low', 'Medium', 'Moderate', 'High', 'Critical'];
      const i = labels.indexOf(r.congestion);
      const ni = i < 0 ? randomInt(0, labels.length - 1) : Math.min(labels.length - 1, Math.max(0, i + randomInt(-1, 1)));
      r.congestion = labels[ni];
    }
    r.walkMinutes = Math.max(1, (Number(r.walkMinutes) || 0) + randomInt(-1, 1));

    const afterRank = congestionRank(r.congestion);
    if (afterRank >= 4 && beforeRank < 4) {
      showToast('Your selected route is getting crowded — consider switching filters.', { duration: 4800 });
    }

    paint();
  }

  function scheduleSim() {
    if (opts.enableSimulation === false || !isDemoMode()) return;
    simTimer = window.setTimeout(() => {
      simulate();
      scheduleSim();
    }, randomInt(3200, 6200));
  }

  const firstPanel = panels[0];
  if (firstPanel) {
    const live = document.createElement('div');
    live.id = 'map-panel-skeleton';
    live.className = 'absolute inset-0 z-10 bg-[#1c1b1b]/95 p-4 rounded-2xl flex flex-col gap-3';
    live.setAttribute('aria-hidden', 'true');
    live.innerHTML = Array.from({ length: 5 }, () => '<div class="cp-skel h-10 rounded-lg"></div>').join('');
    if (firstPanel.style.position !== 'relative') firstPanel.style.position = 'relative';
    firstPanel.appendChild(live);
  }

  Promise.all([
    fetch(crowdUrl, { cache: 'no-store' }).then((res) => {
      if (!res.ok) throw new Error(`crowd ${res.status}`);
      return res.json();
    }),
    fetch(routesUrl, { cache: 'no-store' }).then((res) => {
      if (!res.ok) throw new Error(`routes ${res.status}`);
      return res.json();
    }),
  ])
    .then(([crowdJson, routesJson]) => {
      crowd = structuredClone(crowdJson);
      routesPayload = structuredClone(routesJson);
      document.getElementById('map-panel-skeleton')?.remove();
      wire();
      paint();
      scheduleSim();
      initMapPanZoom();
    })
    .catch(() => {
      document.getElementById('map-panel-skeleton')?.remove();
      showToast('Could not load map data. Check your connection and refresh.', { duration: 5000, type: 'error' });
    });

  return {
    stop() {
      if (simTimer) clearTimeout(simTimer);
      simTimer = null;
    },
    getState: () => ({ filterKey, selectedPinId }),
  };
}
