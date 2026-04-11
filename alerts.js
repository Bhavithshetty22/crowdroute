import {
  saveToStorage,
  loadFromStorage,
  showToast,
  randomInt,
  isDemoMode,
} from './shared.js';

const DEFAULT_PATH = 'data/alerts-data.json';
const DISMISSED_KEY = 'crowdpilotDismissedAlertIds';

const SIM_MS = { min: 10000, max: 20000 };

const SIM_TEMPLATES = [
  {
    severity: 'warning',
    title: 'Concourse sensor drift',
    body: 'North mezzanine sensors report elevated dwell time. Consider the east bypass if you are heading to the upper bowl.',
    icon: 'sensors',
    cta: 'Map',
    href: 'map.html',
  },
  {
    severity: 'critical',
    title: 'Gate 4 — Congestion spike',
    body: 'Inflow at Gate 4 exceeded safe threshold. Security may throttle entry — use Gate B or Gate 9 if you are re-entering.',
    icon: 'warning',
    cta: 'Routes',
    href: 'routes.html',
  },
  {
    severity: 'info',
    title: 'Transit partner update',
    body: 'Extra subway service is scheduled for 30 minutes after the final buzzer on the 7 line.',
    icon: 'train',
  },
  {
    severity: 'warning',
    body: 'South plaza rideshare pickup is backing up. Walk to Zone C for typically shorter driver match times.',
    title: 'Rideshare pickup delay',
    icon: 'local_taxi',
    cta: 'Dashboard',
    href: 'dashboard.html',
  },
];

function injectAlertsStyles() {
  if (document.getElementById('crowdpilot-alerts-js-styles')) return;
  const s = document.createElement('style');
  s.id = 'crowdpilot-alerts-js-styles';
  s.textContent = `
    .alert-card[data-alert-id] {
      border: 1px solid rgba(255,255,255,0.08);
      border-left-width: 4px;
      animation: alert-card-enter 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    @keyframes alert-card-enter {
      from { opacity: 0; transform: translateY(-12px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .alert-card.alert-severity-critical {
      border-color: rgba(255, 180, 171, 0.35);
      border-left-color: #ffb4ab;
      box-shadow: 0 0 0 1px rgba(147, 0, 10, 0.2);
    }
    .alert-card.alert-severity-warning {
      border-color: rgba(254, 183, 0, 0.25);
      border-left-color: #feb700;
    }
    .alert-card.alert-severity-info {
      border-color: rgba(96, 165, 250, 0.25);
      border-left-color: #60a5fa;
    }
    .alert-card.alert-severity-success {
      border-color: rgba(83, 225, 111, 0.28);
      border-left-color: #53e16f;
    }
    .alert-card-pulse .alert-pulse-icon {
      animation: alert-critical-pulse 1.6s ease-in-out infinite;
    }
    @keyframes alert-critical-pulse {
      0%, 100% { opacity: 1; filter: drop-shadow(0 0 0 transparent); }
      50% { opacity: 0.85; filter: drop-shadow(0 0 6px rgba(255, 180, 171, 0.6)); }
    }
  `;
  document.head.appendChild(s);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadDismissedSet() {
  const raw = loadFromStorage(DISMISSED_KEY, []);
  return new Set(Array.isArray(raw) ? raw : []);
}

function persistDismissed(set) {
  saveToStorage(DISMISSED_KEY, [...set]);
}

function formatClock(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

function formatRelative(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 45) return 'Just now';
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    return m === 1 ? '1 min ago' : `${m} mins ago`;
  }
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    return h === 1 ? '1 hour ago' : `${h} hours ago`;
  }
  const d = Math.floor(sec / 86400);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

function severityClass(sev) {
  if (sev === 'critical') return 'alert-critical alert-severity-critical';
  if (sev === 'warning') return 'alert-warning alert-severity-warning';
  if (sev === 'success') return 'alert-success alert-severity-success';
  return 'alert-info alert-severity-info';
}

function severityLabel(sev) {
  if (sev === 'critical') return 'Critical';
  if (sev === 'warning') return 'Warning';
  if (sev === 'success') return 'Resolved';
  return 'Information';
}

function badgeClass(sev) {
  if (sev === 'critical') return 'badge-critical';
  if (sev === 'warning') return 'badge-warning';
  if (sev === 'success') return 'badge-best';
  return 'badge-info';
}

function iconWrapClass(sev) {
  if (sev === 'critical') return 'bg-error/15';
  if (sev === 'warning') return 'bg-secondary-container/15';
  if (sev === 'success') return 'bg-tertiary/15';
  return 'bg-blue-500/15';
}

function iconColorClass(sev) {
  if (sev === 'critical') return 'text-error';
  if (sev === 'warning') return 'text-secondary-container';
  if (sev === 'success') return 'text-tertiary';
  return 'text-blue-400';
}

function titleColorClass(sev) {
  if (sev === 'critical') return 'text-error';
  if (sev === 'warning') return 'text-secondary-container';
  if (sev === 'success') return 'text-tertiary';
  return 'text-blue-300';
}

function filterMatches(sev, filter) {
  if (filter === 'all') return true;
  if (filter === 'critical') return sev === 'critical';
  if (filter === 'warning') return sev === 'warning';
  if (filter === 'info') return sev === 'info' || sev === 'success';
  return true;
}

function buildCardEl(item, dismissedSet, filter) {
  if (dismissedSet.has(item.id)) return null;

  const sev = item.severity || 'info';
  const card = document.createElement('div');
  card.dataset.alertId = item.id;
  card.dataset.type = sev === 'success' ? 'info' : sev;
  card.dataset.severity = sev;
  card.className = `alert-card ${severityClass(sev)} flex`;
  if (sev === 'critical') card.classList.add('alert-card-pulse');

  if (!filterMatches(sev, filter)) {
    card.style.display = 'none';
  }

  const icon = item.icon || 'notifications';
  const pulseClass = sev === 'critical' ? 'alert-pulse-icon' : '';

  const actions = [];
  if (item.href && item.cta) {
    const btnClass =
      sev === 'critical'
        ? 'bg-error/15 text-error px-4 py-2 rounded-xl text-xs font-bold hover:bg-error/25 glide'
        : sev === 'warning'
          ? 'bg-secondary-container/15 text-secondary-container px-4 py-2 rounded-xl text-xs font-bold hover:bg-secondary-container/25 glide'
          : 'bg-blue-500/10 text-blue-400 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-500/20 glide shrink-0';
    actions.push(
      `<a href="${escapeHtml(item.href)}" class="${btnClass}">${escapeHtml(item.cta)}</a>`,
    );
  }
  actions.push(
    `<button type="button" class="alert-dismiss glass-card px-4 py-2 rounded-xl text-xs font-bold text-stone-400 hover:text-white glide" data-dismiss="${escapeHtml(item.id)}">Dismiss</button>`,
  );

  card.innerHTML = `
    <div class="w-10 h-10 ${iconWrapClass(sev)} rounded-xl flex items-center justify-center shrink-0">
      <span class="material-symbols-outlined ${iconColorClass(sev)} text-xl ${pulseClass}" style="font-variation-settings:'FILL' 1;">${escapeHtml(icon)}</span>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div class="flex items-center gap-3 flex-wrap mb-1">
            <span class="${badgeClass(sev)}">${escapeHtml(severityLabel(sev))}</span>
            <span class="text-[10px] text-stone-500 font-mono alert-time-clock">${escapeHtml(formatClock(item.createdAt))}</span>
            <span class="text-[10px] text-stone-500 alert-time-relative">${escapeHtml(formatRelative(item.createdAt))}</span>
          </div>
          <h3 class="font-bold ${titleColorClass(sev)} text-base mb-1">${escapeHtml(item.title)}</h3>
          <p class="text-stone-400 text-sm leading-relaxed">${escapeHtml(item.body)}</p>
        </div>
        <div class="flex gap-2 shrink-0 flex-wrap">${actions.join('')}</div>
      </div>
    </div>
  `;

  return card;
}

function updateRelativeTimes(container) {
  container.querySelectorAll('[data-alert-id]').forEach((card) => {
    const iso = card.dataset.createdAt;
    if (!iso) return;
    const rel = card.querySelector('.alert-time-relative');
    if (rel) rel.textContent = formatRelative(iso);
  });
}

function countBySeverity(items, dismissedSet) {
  let critical = 0;
  let warning = 0;
  let info = 0;
  for (const it of items) {
    if (dismissedSet.has(it.id)) continue;
    const s = it.severity || 'info';
    if (s === 'critical') critical += 1;
    else if (s === 'warning') warning += 1;
    else info += 1;
  }
  return { critical, warning, info, total: critical + warning + info };
}

function updateFilterTabCounts(root, counts) {
  root.querySelectorAll('[data-alert-filter]').forEach((btn) => {
    const f = btn.dataset.alertFilter;
    const badge = btn.querySelector('.filter-count');
    if (!badge) return;
    if (f === 'all') badge.textContent = String(counts.total);
    if (f === 'critical') badge.textContent = String(counts.critical);
    if (f === 'warning') badge.textContent = String(counts.warning);
    if (f === 'info') badge.textContent = String(counts.info);
  });
}

function updateHeaderBadge(root, criticalCount) {
  const el = root.querySelector('#alerts-critical-badge');
  if (!el) return;
  el.textContent = `${criticalCount} Critical`;
}

function alertsSkeletonHtml() {
  return Array.from({ length: 5 }, () => '<div class="cp-skel cp-skel-block rounded-[20px] mb-3" style="height:100px"></div>').join('');
}

function toggleAlertsEmpty(show) {
  document.getElementById('alerts-empty-state')?.classList.toggle('hidden', !show);
}

function applyFilter(container, filter) {
  container.querySelectorAll('[data-alert-id]').forEach((card) => {
    const sev = card.dataset.severity || 'info';
    const show = filterMatches(sev, filter);
    card.style.display = show ? 'flex' : 'none';
  });
}

/**
 * @param {object} [options]
 * @param {string} [options.dataUrl]
 * @param {string} [options.containerSelector]
 * @param {string} [options.filtersRootSelector]
 * @param {boolean} [options.enableSimulation]
 */
export function initAlerts(options = {}) {
  injectAlertsStyles();

  const dataUrl = options.dataUrl ?? DEFAULT_PATH;
  const containerSel = options.containerSelector ?? '#alerts-container';
  const filtersSel = options.filtersRootSelector ?? '#alerts-filters';

  const container = document.querySelector(containerSel);
  const filtersRoot = document.querySelector(filtersSel);
  if (!container) return null;

  container.innerHTML = alertsSkeletonHtml();
  toggleAlertsEmpty(false);

  let dismissed = loadDismissedSet();
  /** @type {object[]} */
  let feedItems = [];
  let activeFilter = 'all';
  let relativeTimer = null;
  let simTimer = null;

  function dismissById(id) {
    if (!id) return;
    dismissed.add(id);
    persistDismissed(dismissed);
    container.querySelectorAll(`[data-alert-id]`).forEach((card) => {
      if (card.dataset.alertId === id) card.remove();
    });
    refreshCounts();
  }

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.alert-dismiss');
    if (!btn) return;
    dismissById(btn.getAttribute('data-dismiss'));
  });

  function refreshCounts() {
    const counts = countBySeverity(feedItems, dismissed);
    if (filtersRoot) updateFilterTabCounts(filtersRoot, counts);
    updateHeaderBadge(document, counts.critical);
    toggleAlertsEmpty(counts.total === 0);
  }

  function renderAll(items, { prependIds } = {}) {
    const prepend = new Set(prependIds || []);
    const frag = document.createDocumentFragment();
    const existing = new Set(
      [...container.querySelectorAll('[data-alert-id]')].map((n) => n.dataset.alertId),
    );

    for (const it of items) {
      if (dismissed.has(it.id)) continue;
      if (existing.has(it.id) && !prepend.has(it.id)) continue;

      const card = buildCardEl(it, dismissed, activeFilter);
      if (!card) continue;
      card.dataset.createdAt = it.createdAt;
      if (prepend.has(it.id)) {
        container.insertBefore(card, container.firstChild);
      } else {
        frag.appendChild(card);
      }
    }

    if (frag.childNodes.length) container.appendChild(frag);
    applyFilter(container, activeFilter);
    refreshCounts();
  }

  function setActiveFilterTab(filter) {
    activeFilter = filter;
    filtersRoot?.querySelectorAll('[data-alert-filter]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.alertFilter === filter);
    });
    applyFilter(container, filter);
  }

  filtersRoot?.querySelectorAll('[data-alert-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setActiveFilterTab(btn.dataset.alertFilter || 'all');
    });
  });

  document.querySelector('#alerts-mark-all-read')?.addEventListener('click', () => {
    feedItems.forEach((it) => dismissed.add(it.id));
    persistDismissed(dismissed);
    container.querySelectorAll('[data-alert-id]').forEach((n) => n.remove());
    refreshCounts();
  });

  async function load() {
    const res = await fetch(dataUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Alerts: ${res.status}`);
    const data = await res.json();
    const feed = Array.isArray(data.feed) ? data.feed : [];
    feedItems = feed.map((row) => ({
      ...row,
      createdAt: row.createdAt || new Date().toISOString(),
    }));
    container.replaceChildren();
    renderAll(feedItems);
  }

  function pushSimulatedAlert() {
    const tpl = SIM_TEMPLATES[randomInt(0, SIM_TEMPLATES.length - 1)];
    const id = `sim-${Date.now()}-${randomInt(100, 999)}`;
    const item = {
      id,
      severity: tpl.severity,
      title: tpl.title,
      body: tpl.body,
      icon: tpl.icon,
      cta: tpl.cta,
      href: tpl.href,
      createdAt: new Date().toISOString(),
    };
    feedItems = [item, ...feedItems];
    renderAll(feedItems, { prependIds: [id] });
    if (item.severity === 'critical') {
      showToast(`Critical: ${item.title}`, { type: 'error', duration: 5500 });
    }
    updateRelativeTimes(container);
  }

  function scheduleSim() {
    if (options.enableSimulation === false || !isDemoMode()) return;
    const delay = randomInt(SIM_MS.min, SIM_MS.max);
    simTimer = window.setTimeout(() => {
      pushSimulatedAlert();
      scheduleSim();
    }, delay);
  }

  load()
    .catch(() => {
      showToast('Could not load alerts. Refresh to retry.', { duration: 5000, type: 'error' });
      container.innerHTML = '';
      toggleAlertsEmpty(true);
    });

  relativeTimer = window.setInterval(() => updateRelativeTimes(container), 30000);

  scheduleSim();

  return {
    stop() {
      if (relativeTimer) clearInterval(relativeTimer);
      if (simTimer) clearTimeout(simTimer);
      relativeTimer = null;
      simTimer = null;
    },
    reload: load,
    getDismissed: () => new Set(dismissed),
  };
}
