import { showToast, randomInt, isDemoMode } from './shared.js';

const ALERTS_URL = new URL('data/alerts-data.json', import.meta.url).href;
const ROUTES_URL = new URL('data/routes-data.json', import.meta.url).href;

const SCENARIO_ORDER = ['fire', 'medical', 'crowd_surge', 'weather'];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function injectEmergencyStyles() {
  if (document.getElementById('crowdpilot-emergency-js-styles')) return;
  const el = document.createElement('style');
  el.id = 'crowdpilot-emergency-js-styles';
  el.textContent = `
    body.emergency-critical-mode #emergency-header {
      animation: emergency-red-pulse 1.25s ease-in-out infinite;
      box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.45);
    }
    @keyframes emergency-red-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.35); }
      50% { box-shadow: 0 0 28px 4px rgba(220, 38, 38, 0.55); }
    }
    body.emergency-sos-flash {
      animation: emergency-sos-flash 0.6s ease-out 1;
    }
    @keyframes emergency-sos-flash {
      0% { filter: brightness(1); }
      40% { filter: brightness(1.15) saturate(1.2); }
      100% { filter: brightness(1); }
    }
    #emergency-route-svg path[data-emg-path] {
      transition: d 0.55s ease, stroke 0.45s ease, opacity 0.35s ease;
    }
    .emg-badge-critical { background: #ffb4ab; color: #1a0505; border: 1px solid rgba(255,180,171,0.6); }
    .emg-badge-high { background: rgba(234,88,12,0.2); color: #fdba74; border: 1px solid rgba(234,88,12,0.45); }
    .emg-badge-warning { background: rgba(254,183,0,0.15); color: #feb700; border: 1px solid rgba(254,183,0,0.35); }
    .emg-live-pulse { animation: emergency-pulse 1.5s ease-in-out infinite; }
  `;
  document.head.appendChild(el);
}

function badgeClass(tone) {
  if (tone === 'critical') return 'emg-badge-critical';
  if (tone === 'high') return 'emg-badge-high';
  return 'emg-badge-warning';
}

function emergencyRoutesFromJson(routesJson) {
  const dest = routesJson?.destinations?.find((d) => d.id === 'emergency_exit');
  return dest?.routes || null;
}

function setSvgPath(el, d) {
  if (!el) return;
  el.style.opacity = '0.35';
  window.requestAnimationFrame(() => {
    if (d) el.setAttribute('d', d);
    el.style.opacity = '0.92';
  });
}

function renderExits(container, exits) {
  if (!container) return;
  container.innerHTML = (exits || [])
    .map((ex) => {
      const blocked = ex.blocked;
      const isBlue = !blocked && (ex.id === 'gate-b' || ex.name === 'Gate B' || String(ex.name || '').includes('Gate 8'));
      const border = blocked ? 'rgba(255,180,171,0.25)' : isBlue ? 'rgba(96,165,250,0.4)' : 'rgba(83,225,111,0.4)';
      const bg = blocked ? 'rgba(147,0,10,0.1)' : isBlue ? 'rgba(96,165,250,0.08)' : 'rgba(83,225,111,0.08)';
      const titleColor = blocked ? 'text-error' : isBlue ? 'text-blue-400' : 'text-tertiary';
      const iconWrap = blocked ? 'bg-error/15' : isBlue ? 'bg-blue-500/20' : 'bg-tertiary/20';
      const status = blocked ? ' — CLOSED' : ex.crowd === 'Surge' ? ' — SURGE' : ' — CLEAR';
      return `
      <div class="exit-card" style="background:${bg};border-color:${border}" data-exit-id="${escapeHtml(ex.id)}">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 ${iconWrap} rounded-xl flex items-center justify-center">
            <span class="material-symbols-outlined ${blocked ? 'text-error emg-live-pulse' : isBlue ? 'text-blue-400' : 'text-tertiary'} text-xl" style="font-variation-settings:'FILL' 1;">${blocked ? 'block' : 'exit_to_app'}</span>
          </div>
          <div>
            <p class="font-black headline-font text-lg ${titleColor}">${escapeHtml(ex.name)}${status}</p>
            <p class="text-xs text-stone-400">${escapeHtml(ex.detail || '')}</p>
          </div>
        </div>
        <div class="space-y-2 text-xs">
          <div class="flex justify-between"><span class="text-stone-500">Walk time</span><span class="font-bold ${titleColor}">${blocked ? '—' : `${ex.walkMin} min`}</span></div>
          <div class="flex justify-between"><span class="text-stone-500">Crowd level</span><span class="font-bold ${blocked ? 'text-error' : 'text-tertiary'}">${escapeHtml(String(ex.crowd || '—'))}</span></div>
          <div class="flex justify-between"><span class="text-stone-500">Accessible</span><span class="font-bold ${blocked ? 'text-error' : titleColor}">${escapeHtml(ex.accessible || '—')}</span></div>
        </div>
        <button type="button" class="w-full mt-4 ${blocked ? 'bg-error/15 text-error border border-error/25 py-3 rounded-xl font-black text-xs uppercase tracking-widest cursor-not-allowed opacity-70' : isBlue ? 'bg-blue-500 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 glide' : 'bg-tertiary text-black py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 glide'}" ${blocked ? 'disabled' : ''}>${blocked ? 'Blocked' : 'Navigate →'}</button>
      </div>`;
    })
    .join('');
}

function renderInstructions(container, items) {
  if (!container) return;
  container.innerHTML = (items || [])
    .map((it) => {
      const border = it.accent === 'tertiary' ? 'border-tertiary' : 'border-error';
      const numBg = it.accent === 'tertiary' ? 'bg-tertiary' : 'bg-error';
      return `
      <div class="rounded-2xl p-7 border-l-4 ${border} relative overflow-hidden" style="background:rgba(28,27,27,0.7)">
        <div class="w-11 h-11 ${numBg} rounded-full flex items-center justify-center font-black text-xl text-black mb-5 headline-font">${it.n}</div>
        <h3 class="font-black headline-font text-xl mb-3 ${it.accent === 'tertiary' ? 'text-tertiary' : ''}">${escapeHtml(it.title)}</h3>
        <p class="text-stone-400 text-sm leading-relaxed">${escapeHtml(it.body)}</p>
      </div>`;
    })
    .join('');
}

function renderContacts(container, list) {
  if (!container) return;
  container.innerHTML = (list || [])
    .map(
      (c) => `
    <div class="flex justify-between items-center p-4 bg-white/03 rounded-xl">
      <div>
        <p class="font-bold text-sm">${escapeHtml(c.name)}</p>
        <p class="text-xs text-stone-500">${escapeHtml(c.subtitle || '')}</p>
      </div>
      <a href="${escapeHtml(c.tel || 'tel:911')}" class="flex items-center gap-2 bg-error/15 text-error px-4 py-2 rounded-xl text-xs font-bold hover:bg-error/25 glide">
        <span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 1;">phone</span>
        ${escapeHtml(c.phone)}
      </a>
    </div>`,
    )
    .join('');
}

function timeStr() {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

function renderLiveFeed(container, rows) {
  if (!container) return;
  container.innerHTML = (rows || [])
    .map((row) => {
      const titleCls =
        row.tone === 'error' ? 'text-error' : row.tone === 'tertiary' ? 'text-tertiary' : row.tone === 'warning' ? 'text-secondary-container' : 'text-white';
      return `
      <div class="flex gap-5 items-start pb-5 border-b border-white/04 last:border-0 last:pb-0">
        <p class="text-xs font-mono text-stone-500 uppercase w-24 shrink-0 pt-0.5">${escapeHtml(row.time)}</p>
        <div>
          <p class="font-bold ${titleCls}">${escapeHtml(row.title)}</p>
          <p class="text-sm text-stone-400 mt-1">${escapeHtml(row.body)}</p>
        </div>
      </div>`;
    })
    .join('');
}

function renderScenarioTabs(root, active) {
  if (!root) return;
  const labels = {
    fire: 'Fire',
    medical: 'Medical',
    crowd_surge: 'Crowd Surge',
    weather: 'Weather',
  };
  root.innerHTML = SCENARIO_ORDER.map(
    (id) => `
    <button type="button" class="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest border transition-all ${
      id === active
        ? 'bg-error/20 border-error text-error emg-live-pulse'
        : 'bg-white/04 border-white/10 text-stone-500 hover:text-white hover:border-white/20'
    }" data-emergency-scenario="${id}">${escapeHtml(labels[id])}</button>`,
  ).join('');
}

/**
 * @param {object} [opts]
 */
export function initEmergency(opts = {}) {
  injectEmergencyStyles();
  const alertsUrl = opts.alertsUrl ?? ALERTS_URL;
  const routesUrl = opts.routesUrl ?? ROUTES_URL;

  const badgeEl = document.querySelector('#emergency-severity-badge');
  const titleEl = document.querySelector('#emergency-header-title');
  const subEl = document.querySelector('#emergency-header-sub');
  const tabsRoot = document.querySelector('#emergency-scenario-tabs');
  const pathPrimary = document.querySelector('#emg-path-primary');
  const pathSecondary = document.querySelector('#emg-path-secondary');
  const pathBlocked = document.querySelector('#emg-path-blocked');
  const routeTitle = document.querySelector('#emergency-primary-route-title');
  const routeSub = document.querySelector('#emergency-primary-route-sub');
  const exitsGrid = document.querySelector('#emergency-exits-grid');
  const instrGrid = document.querySelector('#emergency-instructions');
  const contactsList = document.querySelector('#emergency-contacts-list');
  const liveFeed = document.querySelector('#emergency-live-feed');
  const sosBtn = document.querySelector('#emergency-sos-btn');

  if (!titleEl || !tabsRoot) return null;

  let scenarios = {};
  let emergencyRoutes = null;
  let scenarioId = 'fire';
  let working = null;
  let liveRows = [];
  let simTimer = null;
  let useReroutePaths = false;
  let prevBlockedIds = new Set();

  function isCritical() {
    const s = scenarios[scenarioId];
    return s?.badgeTone === 'critical';
  }

  function applyBodyCritical() {
    if (isCritical()) document.body.classList.add('emergency-critical-mode');
    else document.body.classList.remove('emergency-critical-mode');
  }

  function buildWorking() {
    const base = scenarios[scenarioId];
    if (!base) return;
    working = structuredClone(base);
    working._basePaths = working.paths ? { ...working.paths } : {};
    liveRows = (working.liveSeeds || []).map((r) => ({
      time: timeStr(),
      tone: r.tone,
      title: r.title,
      body: r.body,
    }));
  }

  function paintPaths() {
    if (!working?.paths || !working._basePaths) return;
    const base = working._basePaths;
    const p = useReroutePaths ? base.secondary : base.primary;
    const s = useReroutePaths ? base.primary : base.secondary;
    const b = base.blocked;
    if (pathPrimary) pathPrimary.setAttribute('stroke', '#53e16f');
    if (pathSecondary) pathSecondary.setAttribute('stroke', '#60a5fa');
    setSvgPath(pathPrimary, p);
    setSvgPath(pathSecondary, s);
    setSvgPath(pathBlocked, b);
  }

  function updateRouteSubtext() {
    if (!routeSub || !working) return;
    let sub = working.primaryRouteSub || '';
    if (useReroutePaths && emergencyRoutes?.fastest?.summary) {
      sub = `${sub} · ${emergencyRoutes.fastest.summary}`;
    }
    routeSub.textContent = sub;
  }

  function paintAll() {
    const s = working;
    if (!s) return;
    if (badgeEl) {
      badgeEl.textContent = s.severityBadge || 'ALERT';
      badgeEl.className = `text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${badgeClass(s.badgeTone)}`;
    }
    if (titleEl) titleEl.textContent = s.headerTitle || '';
    if (subEl) subEl.textContent = s.headerSub || '';
    if (routeTitle) routeTitle.textContent = s.primaryRouteTitle || '';
    updateRouteSubtext();
    paintPaths();
    renderExits(exitsGrid, s.exits);
    renderInstructions(instrGrid, s.instructions);
    renderContacts(contactsList, s.contacts);
    renderLiveFeed(liveFeed, liveRows);
    renderScenarioTabs(tabsRoot, scenarioId);
    applyBodyCritical();
  }

  function simulateTick() {
    if (!working?.exits) return;
    const rerouteFlip = Math.random() < 0.35;
    if (rerouteFlip) {
      useReroutePaths = !useReroutePaths;
      paintPaths();
      updateRouteSubtext();
      showToast(
        useReroutePaths
          ? 'Evacuation route updated — follow the newly highlighted path.'
          : 'Primary stadium route restored on map.',
        { duration: 4200 },
      );
    }

    const overcrowded = Math.random() < 0.4;
    if (overcrowded && scenarioId === 'crowd_surge') {
      const msg = `Section ${100 + randomInt(10, 28)} overcrowded — staff redirecting flow.`;
      liveRows.unshift({ time: timeStr(), tone: 'error', title: 'Crowd density alert', body: msg });
      showToast('Overcrowded section reported — check live updates.', { duration: 4500 });
    }

    const medical = Math.random() < 0.25 && scenarioId === 'medical';
    if (medical) {
      liveRows.unshift({
        time: timeStr(),
        tone: 'tertiary',
        title: 'Medical alert',
        body: 'Responder team moving through east tunnel — keep aisle clear.',
      });
      showToast('Medical response in progress — keep corridors clear.', { duration: 4200 });
    }

    for (const ex of working.exits) {
      if (Math.random() < 0.18 && (ex.id === 'gate-12' || String(ex.name || '').includes('12'))) {
        ex.blocked = !ex.blocked;
      }
      if (scenarioId === 'crowd_surge' && (ex.id === 'gate-b' || ex.name === 'Gate B') && Math.random() < 0.22) {
        ex.blocked = !ex.blocked;
      }
    }

    const blockedAfter = new Set(working.exits.filter((e) => e.blocked).map((e) => e.id));
    for (const id of blockedAfter) {
      if (!prevBlockedIds.has(id)) {
        const ex = working.exits.find((e) => e.id === id);
        showToast(`Exit blocked: ${ex?.name || id} — do not use this route.`, { duration: 5000 });
      }
    }
    prevBlockedIds = blockedAfter;

    if (liveRows.length > 12) liveRows.length = 12;
    renderLiveFeed(liveFeed, liveRows);
    renderExits(exitsGrid, working.exits);
  }

  function scheduleSim() {
    if (opts.enableSimulation === false || !isDemoMode()) return;
    simTimer = window.setTimeout(() => {
      simulateTick();
      scheduleSim();
    }, randomInt(5000, 10000));
  }

  function setScenario(id) {
    if (!scenarios[id]) return;
    scenarioId = id;
    useReroutePaths = false;
    buildWorking();
    prevBlockedIds = new Set((working.exits || []).filter((e) => e.blocked).map((e) => e.id));
    paintAll();
  }

  tabsRoot.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-emergency-scenario]');
    if (!btn) return;
    setScenario(btn.dataset.emergencyScenario);
  });

  sosBtn?.addEventListener('click', () => {
    document.body.classList.add('emergency-sos-flash');
    window.setTimeout(() => document.body.classList.remove('emergency-sos-flash'), 700);
    showToast('SOS sent — your seat location was shared with security & medical.', { duration: 5000 });
  });

  fetch(alertsUrl, { cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    })
    .then((alerts) => {
      scenarios = alerts.emergency?.scenarios || {};
      /* Missing scenarios: fall back to empty object; UI still renders */
      return fetch(routesUrl, { cache: 'no-store' }).then((r2) => {
        if (!r2.ok) throw new Error(String(r2.status));
        return r2.json();
      });
    })
    .then((routesJson) => {
      emergencyRoutes = emergencyRoutesFromJson(routesJson);
      const first = SCENARIO_ORDER.find((k) => scenarios[k]);
      if (!first) {
        if (titleEl) titleEl.textContent = 'Emergency data unavailable';
        if (subEl) subEl.textContent = 'Add emergency.scenarios to data/alerts-data.json';
        return;
      }
      setScenario(scenarioId in scenarios ? scenarioId : first);
      scheduleSim();
    })
    .catch(() => {
      showToast('Could not load emergency data. Refresh the page.', { duration: 6000, type: 'error' });
    });

  return {
    stop() {
      if (simTimer) clearTimeout(simTimer);
      simTimer = null;
      document.body.classList.remove('emergency-critical-mode');
    },
    getScenario: () => scenarioId,
  };
}
