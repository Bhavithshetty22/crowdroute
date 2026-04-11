import { saveToStorage, loadFromStorage, showToast, randomInt, isDemoMode } from './shared.js';

const DATA_URL = 'data/queue-data.json';
const STORAGE_FILTER = 'crowdpilotQueueFilter';
const STORAGE_SORT = 'crowdpilotQueueSort';

const SIM_MS = { min: 5000, max: 10000 };

const WAIT = { lowMax: 4, mediumMax: 11, highMax: 19 };
const SPIKE_DELTA = 8;
const SPIKE_TO_CRITICAL = 20;

function injectQueueStyles() {
  if (document.getElementById('crowdpilot-queue-js-styles')) return;
  const s = document.createElement('style');
  s.id = 'crowdpilot-queue-js-styles';
  s.textContent = `
    .queue-facility-card.queue-status-critical {
      box-shadow: 0 0 0 1px rgba(255, 180, 171, 0.35);
    }
    .thick-bar-fill[data-queue-fill] {
      transition: width 1.1s cubic-bezier(0.4, 0, 0.2, 1), background 0.45s ease;
    }
    .queue-chart-bar[data-queue-chart] {
      transition: height 0.85s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .queue-flow-bar-fill {
      transition: width 0.9s cubic-bezier(0.4, 0, 0.2, 1);
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

function waitTier(waitMinutes) {
  const w = Number(waitMinutes) || 0;
  if (w <= WAIT.lowMax) return 'low';
  if (w <= WAIT.mediumMax) return 'medium';
  if (w <= WAIT.highMax) return 'high';
  return 'critical';
}

function tierLabel(tier) {
  if (tier === 'low') return 'Fluid';
  if (tier === 'medium') return 'Moderate';
  if (tier === 'high') return 'Busy';
  return 'Congested';
}

function tierBadgeClass(tier) {
  if (tier === 'low') return 'badge-best';
  if (tier === 'medium') return 'badge-warning';
  if (tier === 'high') return 'badge-warning';
  return 'badge-critical';
}

function tierTextClass(tier) {
  if (tier === 'low') return 'text-tertiary';
  if (tier === 'medium') return 'text-secondary-container';
  if (tier === 'high') return 'text-primary-container';
  return 'text-error';
}

function trendIcon(trend) {
  if (trend === 'rising') return { name: 'trending_up', cls: 'text-error' };
  if (trend === 'falling') return { name: 'trending_down', cls: 'text-tertiary' };
  return { name: 'remove', cls: 'text-stone-500' };
}

function formatWaitLarge(m) {
  const w = Number(m) || 0;
  if (w <= 0) return '0m';
  return `${w}m`;
}

function categoryLabel(cat) {
  if (cat === 'washroom') return 'Washroom';
  if (cat === 'merchandise') return 'Merchandise';
  if (cat === 'parking') return 'Parking';
  return 'Food';
}

function filterList(list, filter) {
  if (filter === 'all') return [...list];
  const f = filter === 'washrooms' ? 'washroom' : filter;
  return list.filter((x) => x.category === f);
}

function sortList(list, sort) {
  const out = [...list];
  out.sort((a, b) => {
    const wa = Number(a.waitMinutes) || 0;
    const wb = Number(b.waitMinutes) || 0;
    return sort === 'longest' ? wb - wa : wa - wb;
  });
  return out;
}

function bestIdsByCategory(facilities) {
  const cats = ['food', 'washroom', 'merchandise', 'parking'];
  const best = new Set();
  for (const cat of cats) {
    const sub = facilities.filter((f) => f.category === cat);
    if (!sub.length) continue;
    let min = Infinity;
    let id = sub[0].id;
    for (const f of sub) {
      const w = Number(f.waitMinutes) || 0;
      if (w < min) {
        min = w;
        id = f.id;
      }
    }
    best.add(id);
  }
  return best;
}

function bestPerCategory(facilities) {
  const cats = ['food', 'washroom', 'merchandise', 'parking'];
  const map = {};
  for (const cat of cats) {
    const sub = facilities.filter((f) => f.category === cat);
    if (sub.length) {
      map[cat] = sub.reduce((a, b) =>
        (Number(a.waitMinutes) || 0) <= (Number(b.waitMinutes) || 0) ? a : b,
      );
    }
  }
  return map;
}

function borderForTier(tier) {
  if (tier === 'low') return 'rgba(83,225,111,0.2)';
  if (tier === 'medium') return 'rgba(254,183,0,0.15)';
  if (tier === 'high') return 'rgba(255,107,0,0.15)';
  return 'rgba(255,180,171,0.25)';
}

function barGradient(tier) {
  if (tier === 'low') return '#53e16f';
  if (tier === 'medium') return 'linear-gradient(90deg,#feb700,#ffdb9d)';
  if (tier === 'high') return '#ff6b00';
  return 'linear-gradient(90deg,#93000a,#ffb4ab)';
}

function renderBestCard(f) {
  if (!f) return '';
  const tier = waitTier(f.waitMinutes);
  const border = borderForTier(tier);
  const util = f.utilizationPct ?? Math.min(100, Math.round((Number(f.waitMinutes) || 0) * 3.4));
  const fill = barGradient(tier);
  const waitDisplay =
    f.category === 'washroom' && f.waitMinutes <= 0 ? 'Free' : formatWaitLarge(f.waitMinutes);
  const sub =
    f.category === 'parking'
      ? `${util}% occupancy`
      : f.category === 'washroom' && f.waitMinutes <= 0
        ? 'no queue'
        : 'wait time';

  return `
    <div class="facility-card" style="border-color:${border}">
      <div class="flex justify-between items-start mb-4">
        <div class="w-11 h-11 bg-surface-container-high rounded-xl flex items-center justify-center">
          <span class="material-symbols-outlined ${tierTextClass(tier)}" style="font-variation-settings:'FILL' 1;">${escapeHtml(f.icon)}</span>
        </div>
        <span class="badge-best">Best Option</span>
      </div>
      <h3 class="font-bold text-base mb-1">${escapeHtml(f.name)}</h3>
      <p class="text-[10px] text-stone-500 uppercase tracking-widest mb-4">${escapeHtml(f.zone)} · ${escapeHtml(categoryLabel(f.category))}</p>
      <div class="flex items-baseline gap-2 mb-4">
        <span class="text-3xl font-black ${tierTextClass(tier)} headline-font queue-best-wait">${escapeHtml(waitDisplay)}</span>
        <span class="text-xs text-stone-500">${escapeHtml(sub)}</span>
      </div>
      <div class="space-y-2">
        <div class="flex justify-between text-[10px] font-bold text-stone-500 uppercase">
          <span>Utilization</span><span class="${tierTextClass(tier)} queue-best-util">${util}%</span>
        </div>
        <div class="thick-bar"><div class="thick-bar-fill" data-queue-fill style="width:${util}%;background:${fill}"></div></div>
      </div>
    </div>
  `;
}

function renderFacilityCard(f, bestSet) {
  const tier = waitTier(f.waitMinutes);
  const tr = trendIcon(f.trend);
  const isBest = bestSet.has(f.id);
  const border = borderForTier(tier);
  const util = f.utilizationPct ?? Math.min(100, Math.round((Number(f.waitMinutes) || 0) * 3.4));
  const fill = barGradient(tier);
  const waitLabel = f.category === 'parking' ? 'Exit Delay' : 'Wait Time';
  const waitVal =
    f.category === 'washroom' && f.waitMinutes <= 0 ? '0m' : formatWaitLarge(f.waitMinutes);
  const statusHtml = isBest
    ? `<span class="badge-best">Best Option</span>`
    : `<span class="${tierBadgeClass(tier)} queue-tier-badge">${escapeHtml(tierLabel(tier))}</span>`;
  const iconPulse = tier === 'critical' ? ' animate-pulse' : '';

  return `
    <div class="facility-card queue-facility-card ${tier === 'critical' ? 'queue-status-critical' : ''}" data-queue-id="${escapeHtml(f.id)}" data-queue-category="${escapeHtml(f.category)}" style="border-color:${border}">
      <div class="flex justify-between items-start mb-5">
        <div class="flex gap-4 items-center">
          <div class="w-14 h-14 bg-surface-container-high rounded-2xl flex items-center justify-center">
            <span class="material-symbols-outlined text-2xl ${tierTextClass(tier)}${iconPulse}" data-queue-facility-icon style="font-variation-settings:'FILL' 1;">${escapeHtml(f.icon)}</span>
          </div>
          <div>
            <h4 class="font-bold text-base">${escapeHtml(f.name)}</h4>
            <p class="text-[10px] text-stone-500 uppercase tracking-widest">${escapeHtml(f.zone)}</p>
          </div>
        </div>
        <span class="material-symbols-outlined queue-trend-ic ${tr.cls}" data-queue-trend>${tr.name}</span>
      </div>
      <div class="flex items-end justify-between mb-4">
        <div>
          <p class="text-[10px] font-bold text-stone-500 uppercase mb-1">${escapeHtml(waitLabel)}</p>
          <span class="text-3xl font-black ${tierTextClass(tier)} headline-font queue-wait-value">${escapeHtml(waitVal)}</span>
        </div>
        ${statusHtml}
      </div>
      <div class="thick-bar mb-4"><div class="thick-bar-fill" data-queue-fill style="width:${util}%;background:${fill}"></div></div>
      <div class="flex justify-between text-[10px] font-bold text-stone-500 uppercase pt-3 border-t border-white/05">
        <span>${escapeHtml(f.throughput || '—')}</span><span>Peak: ${escapeHtml(f.peakTime || '—')}</span>
      </div>
    </div>
  `;
}

function snapshotWaits(facilities) {
  const m = {};
  facilities.forEach((f) => {
    m[f.id] = Number(f.waitMinutes) || 0;
  });
  return m;
}

function detectSpikes(prev, next, facilities) {
  if (!prev) return;
  for (const f of facilities) {
    const a = prev[f.id];
    const b = next[f.id];
    if (a == null || b == null) continue;
    if (b - a >= SPIKE_DELTA || (a < SPIKE_TO_CRITICAL && b >= SPIKE_TO_CRITICAL)) {
      const name = facilities.find((x) => x.id === f.id)?.name || 'Queue';
      showToast(`Major queue spike: ${name} now at ${b} min wait`, {
        type: 'error',
        duration: 5000,
      });
      break;
    }
  }
}

function simulateFacilities(facilities) {
  for (const f of facilities) {
    const delta = randomInt(-2, 3);
    let w = Math.max(0, (Number(f.waitMinutes) || 0) + delta);
    w = f.category === 'parking' ? Math.min(35, w) : Math.min(30, w);
    f.waitMinutes = w;
    f.utilizationPct = Math.min(
      98,
      Math.max(5, (Number(f.utilizationPct) || 30) + randomInt(-4, 5)),
    );
    const roll = randomInt(1, 100);
    if (roll <= 18) f.trend = 'rising';
    else if (roll <= 36) f.trend = 'falling';
    else f.trend = 'stable';
  }
}

function renderComparison(el, flow) {
  if (!el || !flow) return;
  const cur = Math.min(100, Math.max(0, flow.currentPct ?? 85));
  const avg = Math.min(100, Math.max(0, flow.avgPct ?? 55));
  el.innerHTML = `
    <div>
      <div class="flex justify-between text-xs font-bold mb-2"><span class="text-stone-300">Current Traffic</span><span class="text-primary-container">Live</span></div>
      <div class="h-9 bg-white/05 rounded-xl overflow-hidden flex items-center px-4 relative">
        <div class="queue-flow-bar-fill absolute inset-y-0 left-0 bg-primary-container/50 rounded-xl" style="width:${cur}%"></div>
        <span class="relative z-10 text-xs font-bold">${escapeHtml(flow.currentLabel || '')}</span>
      </div>
    </div>
    <div>
      <div class="flex justify-between text-xs font-bold mb-2"><span class="text-stone-500">Typical Flow</span><span class="text-stone-400">Avg</span></div>
      <div class="h-9 bg-white/05 rounded-xl overflow-hidden flex items-center px-4 relative">
        <div class="queue-flow-bar-fill absolute inset-y-0 left-0 bg-white/10 rounded-xl" style="width:${avg}%"></div>
        <span class="relative z-10 text-xs font-bold text-stone-400">${escapeHtml(flow.avgLabel || '')}</span>
      </div>
    </div>
    <p class="text-xs text-stone-400 leading-relaxed italic border-t border-white/05 pt-4">System is operating <span class="text-primary-container font-bold">${escapeHtml(flow.deltaNote || '')}</span>. Compare bars to spot surges early.</p>
  `;
}

function renderHourly(el, trendPct) {
  if (!el || !trendPct?.length) return;
  const labels = ['12pm', '1pm', '2pm', '3pm', '4pm', '5pm', 'Now', '7pm'];
  const bars = trendPct.map((h, i) => {
    const pct = Math.max(8, Math.min(100, h));
    const isNow = i === trendPct.length - 3;
    const bg = isNow
      ? 'bg-primary-container'
      : i >= trendPct.length - 2
        ? 'bg-primary-container/60 border border-dashed border-primary-container/40'
        : i >= 3
          ? 'bg-primary-container/50'
          : 'bg-stone-700/30';
    const lbl = labels[i] || `${i}`;
    const lblCls = isNow ? 'text-[9px] text-primary-container font-bold' : 'text-[9px] text-stone-600';
    return `<div class="flex-1 flex flex-col items-center gap-1">
      <div class="queue-chart-bar chart-bar w-full ${bg}" data-queue-chart data-idx="${i}" style="height:${pct}%"></div>
      <span class="${lblCls}">${escapeHtml(lbl)}</span>
    </div>`;
  });
  el.innerHTML = `<div class="flex items-end gap-2 h-36">${bars.join('')}</div>`;
}

function updateHourlyHeights(el, trendPct) {
  if (!el || !trendPct?.length) return;
  trendPct.forEach((h, i) => {
    const bar = el.querySelector(`[data-queue-chart][data-idx="${i}"]`);
    if (bar) bar.style.height = `${Math.max(8, Math.min(100, h))}%`;
  });
}

function updateComparisonWidths(el, flow) {
  if (!el || !flow) return;
  const fills = el.querySelectorAll('.queue-flow-bar-fill');
  if (fills[0])
    fills[0].style.width = `${Math.min(100, Math.max(0, flow.currentPct ?? 0))}%`;
  if (fills[1])
    fills[1].style.width = `${Math.min(100, Math.max(0, flow.avgPct ?? 0))}%`;
}

function patchStatusBadge(card, f, bestSet) {
  const row = card.querySelector('.flex.items-end.justify-between.mb-4');
  if (!row || row.children.length < 2) return;
  const tier = waitTier(f.waitMinutes);
  const isBest = bestSet.has(f.id);
  const next = document.createElement('div');
  next.innerHTML = isBest
    ? `<span class="badge-best">Best Option</span>`
    : `<span class="${tierBadgeClass(tier)} queue-tier-badge">${tierLabel(tier)}</span>`;
  const newBadge = next.firstElementChild;
  const old = row.children[1];
  if (old && newBadge) old.replaceWith(newBadge);
}

function updateFacilityDomSimple(card, f, bestSet) {
  const tier = waitTier(f.waitMinutes);
  const tr = trendIcon(f.trend);
  const util = f.utilizationPct ?? Math.min(100, Math.round((Number(f.waitMinutes) || 0) * 3.4));
  const waitVal =
    f.category === 'washroom' && f.waitMinutes <= 0 ? '0m' : formatWaitLarge(f.waitMinutes);

  card.style.borderColor = borderForTier(tier);
  card.classList.toggle('queue-status-critical', tier === 'critical');

  const wv = card.querySelector('.queue-wait-value');
  if (wv) {
    wv.textContent = waitVal;
    wv.className = `text-3xl font-black headline-font queue-wait-value ${tierTextClass(tier)}`;
  }

  const trendEl = card.querySelector('[data-queue-trend]');
  if (trendEl) {
    trendEl.textContent = tr.name;
    trendEl.className = `material-symbols-outlined queue-trend-ic ${tr.cls}`;
  }

  const fillEl = card.querySelector('[data-queue-fill]');
  if (fillEl) {
    fillEl.style.width = `${util}%`;
    fillEl.style.background = fill;
  }

  const iconBig = card.querySelector('[data-queue-facility-icon]');
  if (iconBig) {
    iconBig.className = `material-symbols-outlined text-2xl ${tierTextClass(tier)}${
      tier === 'critical' ? ' animate-pulse' : ''
    }`;
    iconBig.style.fontVariationSettings = "'FILL' 1";
  }

  patchStatusBadge(card, f, bestSet);
}

function updateBestRow(bestEl, bestMap) {
  if (!bestEl) return;
  const cats = ['food', 'washroom', 'merchandise', 'parking'];
  cats.forEach((c, idx) => {
    const mini = bestEl.children[idx];
    const bf = bestMap[c];
    if (!mini || !bf) return;
    const tier = waitTier(bf.waitMinutes);
    const util = bf.utilizationPct ?? Math.min(100, Math.round((Number(bf.waitMinutes) || 0) * 3.4));
    const fill = mini.querySelector('[data-queue-fill]');
    if (fill) {
      fill.style.width = `${util}%`;
      fill.style.background = barGradient(tier);
    }
    const wv = mini.querySelector('.queue-best-wait');
    if (wv) {
      const disp =
        bf.category === 'washroom' && bf.waitMinutes <= 0
          ? 'Free'
          : formatWaitLarge(bf.waitMinutes);
      wv.textContent = disp;
      wv.className = `text-3xl font-black headline-font queue-best-wait ${tierTextClass(tier)}`;
    }
    const utilLabel = mini.querySelector('.queue-best-util');
    if (utilLabel) {
      utilLabel.textContent = `${util}%`;
      utilLabel.className = `${tierTextClass(tier)} queue-best-util`;
    }
  });
}

/**
 * @param {object} [opts]
 * @param {string} [opts.dataUrl]
 * @param {string} [opts.bestRowSelector]
 * @param {string} [opts.gridSelector]
 * @param {string} [opts.filterTabsSelector]
 * @param {string} [opts.sortSelector]
 * @param {string} [opts.comparisonSelector]
 * @param {string} [opts.hourlySelector]
 * @param {boolean} [opts.enableSimulation]
 */
export function initQueueAnalytics(opts = {}) {
  injectQueueStyles();

  const dataUrl = opts.dataUrl ?? DATA_URL;
  const sel = {
    best: opts.bestRowSelector ?? '#queue-best-row',
    grid: opts.gridSelector ?? '#queue-facilities-grid',
    filters: opts.filterTabsSelector ?? '#queue-filter-tabs',
    sort: opts.sortSelector ?? '#queue-sort-select',
    comparison: opts.comparisonSelector ?? '#queue-comparison-bars',
    hourly: opts.hourlySelector ?? '#queue-hourly-chart',
  };

  const bestEl = document.querySelector(sel.best);
  const gridEl = document.querySelector(sel.grid);
  const filterRoot = document.querySelector(sel.filters);
  const sortEl = document.querySelector(sel.sort);
  const compEl = document.querySelector(sel.comparison);
  const hourlyEl = document.querySelector(sel.hourly);

  if (!gridEl) return null;

  gridEl.innerHTML = queueSkeletonHtml();
  if (bestEl) {
    bestEl.innerHTML = Array.from({ length: 4 }, () => '<div class="cp-skel rounded-2xl h-28" aria-hidden="true"></div>').join('');
  }

  let facilities = [];
  let flowComparison = {};
  let queueTrendPct = [];
  let activeFilter = loadFromStorage(STORAGE_FILTER, 'all') || 'all';
  let sortMode = loadFromStorage(STORAGE_SORT, 'shortest') || 'shortest';
  let simTimer = null;

  function persistPrefs() {
    saveToStorage(STORAGE_FILTER, activeFilter);
    saveToStorage(STORAGE_SORT, sortMode);
  }

  function setFilterTabUI() {
    filterRoot?.querySelectorAll('[data-queue-filter]').forEach((btn) => {
      const v = btn.dataset.queueFilter || 'all';
      btn.classList.toggle('active', v === activeFilter);
    });
  }

  function setSortUI() {
    if (sortEl && sortEl.tagName === 'SELECT') {
      sortEl.value = sortMode;
    }
  }

  function queueSkeletonHtml() {
    const card =
      '<div class="cp-skel rounded-[20px] border border-white/05" style="height:200px" aria-hidden="true"></div>';
    return Array.from({ length: 6 }, () => card).join('');
  }

  function renderFull() {
    const bestMap = bestPerCategory(facilities);
    const bestSet = bestIdsByCategory(facilities);
    const cats = ['food', 'washroom', 'merchandise', 'parking'];
    if (bestEl) {
      bestEl.innerHTML = cats.map((c) => renderBestCard(bestMap[c])).join('');
    }

    const filtered = sortList(filterList(facilities, activeFilter), sortMode);
    if (!filtered.length) {
      gridEl.innerHTML = `<div class="cp-empty-state lg:col-span-3 md:col-span-2 col-span-1 text-left md:text-center">
        <div class="cp-empty-icon" aria-hidden="true">📊</div>
        <h3 class="headline-font">No queue data for this filter</h3>
        <p>Try another category or check back after the feed refreshes.</p>
      </div>`;
    } else {
      gridEl.innerHTML = filtered.map((f) => renderFacilityCard(f, bestSet)).join('');
    }

    renderComparison(compEl, flowComparison);
    renderHourly(hourlyEl, queueTrendPct);
  }

  filterRoot?.querySelectorAll('[data-queue-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.queueFilter || 'all';
      persistPrefs();
      setFilterTabUI();
      renderFull();
    });
  });

  if (sortEl) {
    sortEl.addEventListener('change', () => {
      sortMode = sortEl.value === 'longest' ? 'longest' : 'shortest';
      persistPrefs();
      renderFull();
    });
  }

  async function load() {
    const res = await fetch(dataUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Queue data ${res.status}`);
    const data = await res.json();
    facilities = Array.isArray(data.facilities)
      ? data.facilities.map((f) => ({ ...f }))
      : [];
    flowComparison = { ...(data.flowComparison || {}) };
    queueTrendPct = Array.isArray(data.queueTrendPct) ? [...data.queueTrendPct] : [];
    setFilterTabUI();
    setSortUI();
    renderFull();
  }

  function tick() {
    const before = snapshotWaits(facilities);
    simulateFacilities(facilities);
    const after = snapshotWaits(facilities);
    detectSpikes(before, after, facilities);

    if (flowComparison && typeof flowComparison === 'object') {
      flowComparison.currentPct = Math.min(
        100,
        Math.max(20, (flowComparison.currentPct ?? 70) + randomInt(-4, 5)),
      );
      flowComparison.avgPct = Math.min(
        100,
        Math.max(15, (flowComparison.avgPct ?? 55) + randomInt(-1, 2)),
      );
    }
    queueTrendPct = queueTrendPct.map((v) =>
      Math.max(12, Math.min(100, v + randomInt(-6, 8))),
    );

    const bestSet = bestIdsByCategory(facilities);
    const bestMap = bestPerCategory(facilities);
    updateBestRow(bestEl, bestMap);

    const visibleIds = new Set(
      sortList(filterList(facilities, activeFilter), sortMode).map((f) => f.id),
    );
    gridEl.querySelectorAll('[data-queue-id]').forEach((card) => {
      const id = card.dataset.queueId;
      if (!visibleIds.has(id)) return;
      const f = facilities.find((x) => x.id === id);
      if (f) updateFacilityDomSimple(card, f, bestSet);
    });

    updateComparisonWidths(compEl, flowComparison);
    updateHourlyHeights(hourlyEl, queueTrendPct);
  }

  function scheduleSim() {
    if (opts.enableSimulation === false || !isDemoMode()) return;
    const delay = randomInt(SIM_MS.min, SIM_MS.max);
    simTimer = window.setTimeout(() => {
      tick();
      scheduleSim();
    }, delay);
  }

  load()
    .then(() => {
      scheduleSim();
    })
    .catch(() => {
      showToast('Could not load queue data. Refresh to retry.', { duration: 5000, type: 'error' });
    });

  return {
    stop() {
      if (simTimer) clearTimeout(simTimer);
      simTimer = null;
    },
    reload: load,
  };
}
