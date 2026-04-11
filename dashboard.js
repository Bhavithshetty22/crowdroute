import { showToast, randomInt, isDemoMode } from './shared.js';

function hideDashboardSkeleton() {
  document.getElementById('cp-dashboard-skeleton')?.classList.add('cp-skeleton-layer--hide');
  document.getElementById('dashboard-scroll-content')?.classList.add('cp-stagger-in');
}

const PATHS = {
  crowd: 'data/crowd-data.json',
  queue: 'data/queue-data.json',
  alerts: 'data/alerts-data.json',
};

const THRESHOLDS = {
  foodWaitCritical: 12,
  foodWaitSpikeDelta: 4,
  foodWaitSpikeAbsolute: 16,
  washroomCriticalMin: 8,
  parkingCritical: 82,
  zoneCritical: 78,
  hazardCritical: 88,
};

const SIM_MS = { min: 5000, max: 10000 };

const BADGE_LEVEL_CLASS = {
  low: 'px-3 py-1.5 rounded-lg bg-tertiary/10 border border-tertiary/20 text-tertiary text-xs font-bold',
  medium:
    'px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold',
  high: 'px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold',
};

const ZONE_VALUE_CLASS = {
  ok: 'text-tertiary font-bold',
  warn: 'text-secondary-container font-bold',
  crit: 'text-error font-bold',
};

function injectDashboardStyles() {
  if (document.getElementById('dashboard-js-styles')) return;
  const s = document.createElement('style');
  s.id = 'dashboard-js-styles';
  s.textContent = `
    .dashboard-metric {
      transition: color 0.45s ease, transform 0.35s ease;
    }
    .dashboard-metric.dashboard-value-bump {
      transform: scale(1.04);
    }
    .queue-fill[data-dashboard-fill] {
      transition: width 0.85s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease, opacity 0.5s ease;
    }
    .dashboard-card-critical {
      box-shadow: 0 0 0 1px rgba(255, 180, 171, 0.45), 0 0 24px rgba(147, 0, 10, 0.25);
    }
    .dashboard-zone-row-critical {
      background: rgba(147, 0, 10, 0.14);
      border-radius: 10px;
      padding: 8px;
      margin: -4px 0;
    }
    .mini-chart-bar[data-chart-index] {
      transition: height 0.7s cubic-bezier(0.4, 0, 0.2, 1), background 0.45s ease;
    }
  `;
  document.head.appendChild(s);
}

function $(sel, root = document) {
  return root.querySelector(sel);
}

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

function zoneSeverity(pct) {
  if (pct >= THRESHOLDS.zoneCritical) return 'crit';
  if (pct >= 52) return 'warn';
  return 'ok';
}

function barColorForFood(minutes) {
  if (minutes >= THRESHOLDS.foodWaitCritical) {
    return 'linear-gradient(90deg,#93000a,#ffb4ab)';
  }
  return '';
}

function barColorForWashroom(minutes) {
  if (minutes >= THRESHOLDS.washroomCriticalMin) {
    return 'linear-gradient(90deg,#d97706,#fbbf24)';
  }
  return '#53e16f';
}

function barColorForParking(pct) {
  if (pct >= THRESHOLDS.parkingCritical) {
    return 'linear-gradient(90deg,#93000a,#ffb4ab)';
  }
  if (pct >= 55) return 'linear-gradient(90deg,#d97706,#fbbf24)';
  return 'linear-gradient(90deg,#2563eb,#60a5fa)';
}

function bumpMetric(el) {
  if (!el) return;
  el.classList.add('dashboard-metric', 'dashboard-value-bump');
  window.setTimeout(() => el.classList.remove('dashboard-value-bump'), 380);
}

function setText(el, text, { animate = true } = {}) {
  if (!el) return;
  const next = String(text);
  if (el.textContent === next) return;
  el.textContent = next;
  const parentBtn = el.closest('div')?.querySelector('button');
  if (parentBtn) {
    parentBtn.setAttribute('aria-label', `Notifications, ${next} unread alert${next === 1 ? '' : 's'}`);
  }
  if (animate) bumpMetric(el);
}

function setBar(el, pct, { background = null } = {}) {
  if (!el) return;
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  el.dataset.dashboardFill = '1';
  el.style.width = `${p}%`;
  if (background) el.style.background = background;
}

function setCardCritical(card, on) {
  if (!card) return;
  card.classList.toggle('dashboard-card-critical', Boolean(on));
}

function setZoneRowCritical(row, on) {
  if (!row) return;
  row.classList.toggle('dashboard-zone-row-critical', Boolean(on));
}

function formatFoodWait(m) {
  return `${m}m`;
}

function formatWashroom(m) {
  return m <= 0 ? 'Free' : `${m}m`;
}

function buildMerged(crowd, queue, alerts) {
  return { crowd, queue, alerts };
}

function applyRegionalBadges(container, badges, { animate = true } = {}) {
  if (!container || !badges?.length) return;
  const chips = [...container.querySelectorAll('[data-density-chip]')];
  badges.forEach((b, i) => {
    const el = chips[i];
    if (!el) return;
    setText(el, b.text, { animate });
    el.className = BADGE_LEVEL_CLASS[b.level] || BADGE_LEVEL_CLASS.medium;
  });
}

function applyZones(root, zones) {
  if (!root || !zones) return;
  for (const z of zones) {
    const row = root.querySelector(`[data-dashboard-zone="${z.id}"]`);
    if (!row) continue;
    const labelEl = row.querySelector('[data-zone-label]');
    const valueEl = row.querySelector('[data-zone-value]');
    const bar = row.querySelector('[data-zone-bar]');
    if (labelEl) labelEl.textContent = z.label;
    const sev = zoneSeverity(z.densityPct);
    const valueStr = `${z.densityPct}% — ${z.status}`;
    if (valueEl) {
      setText(valueEl, valueStr);
      valueEl.className = `text-xs mb-1.5 ${ZONE_VALUE_CLASS[sev]}`;
    }
    let bg = '#53e16f';
    if (sev === 'warn') bg = '#feb700';
    if (sev === 'crit') bg = 'linear-gradient(90deg,#ff6b00,#ffb4ab)';
    setBar(bar, z.densityPct, { background: bg });
    setZoneRowCritical(row, sev === 'crit');
  }
}

function applyQueueTrend(container, pctArray) {
  if (!container || !pctArray) return;
  pctArray.forEach((h, i) => {
    const bar = container.querySelector(`[data-chart-index="${i}"]`);
    if (!bar) return;
    bar.style.height = `${Math.max(8, Math.min(100, h))}%`;
    const active = h >= 75;
    bar.classList.toggle('active', active);
  });
}

export function applyDashboardState(state, { initial = false } = {}) {
  const { crowd, queue, alerts } = state;
  const anim = !initial;

  const aiEl = $('#dashboard-ai-prediction');
  if (aiEl) setText(aiEl, crowd.aiPrediction, { animate: anim });

  applyRegionalBadges($('#dashboard-density-badges'), crowd.regionalBadges, { animate: anim });
  applyZones($('#dashboard-zone-density'), crowd.zones);

  const q = queue;
  const foodValEl = $('#dashboard-food-value');
  setText(foodValEl, formatFoodWait(q.food.waitMinutes), { animate: anim });
  if (foodValEl) {
    const fcrit = q.food.waitMinutes >= THRESHOLDS.foodWaitCritical;
    foodValEl.classList.toggle('text-primary-container', !fcrit);
    foodValEl.classList.toggle('text-error', fcrit);
  }
  setText($('#dashboard-food-detail'), q.food.location, { animate: anim });
  const foodBar = $('#dashboard-food-bar');
  const foodCrit = barColorForFood(q.food.waitMinutes);
  if (foodCrit) {
    foodBar.classList.remove('bg-primary-container');
    setBar(foodBar, q.food.barPct, { background: foodCrit });
  } else {
    foodBar.style.background = '';
    foodBar.classList.add('bg-primary-container');
    setBar(foodBar, q.food.barPct);
  }
  const foodCard = $('#dashboard-card-food');
  setCardCritical(foodCard, q.food.waitMinutes >= THRESHOLDS.foodWaitCritical);

  const wcValEl = $('#dashboard-wc-value');
  setText(wcValEl, formatWashroom(q.washroom.waitMinutes), { animate: anim });
  if (wcValEl) {
    const wcr = q.washroom.waitMinutes >= THRESHOLDS.washroomCriticalMin;
    wcValEl.classList.toggle('text-tertiary', !wcr);
    wcValEl.classList.toggle('text-error', wcr);
  }
  setText($('#dashboard-wc-detail'), q.washroom.location, { animate: anim });
  const wcBar = $('#dashboard-wc-bar');
  setBar(wcBar, q.washroom.barPct, { background: barColorForWashroom(q.washroom.waitMinutes) });
  setCardCritical(
    $('#dashboard-card-wc'),
    q.washroom.waitMinutes >= THRESHOLDS.washroomCriticalMin,
  );

  const exitSub = `${q.exit.walkMinutes} min walk · ${q.exit.conditions}`;
  setText($('#dashboard-exit-value'), q.exit.gate, { animate: anim });
  setText($('#dashboard-exit-detail'), exitSub, { animate: anim });
  setBar($('#dashboard-exit-bar'), q.exit.barPct);

  const parkPct = q.parking.congestionPct;
  const parkValEl = $('#dashboard-parking-value');
  setText(parkValEl, q.parking.lot, { animate: anim });
  if (parkValEl) {
    const pcrit = parkPct >= THRESHOLDS.parkingCritical;
    parkValEl.classList.toggle('text-white', !pcrit);
    parkValEl.classList.toggle('text-error', pcrit);
  }
  setText($('#dashboard-parking-status'), q.parking.statusLabel, { animate: anim });
  setBar($('#dashboard-parking-bar'), q.parking.barPct, { background: barColorForParking(parkPct) });
  const parkCrit = parkPct >= THRESHOLDS.parkingCritical;
  setCardCritical($('#dashboard-card-parking'), parkCrit);
  const ps = $('#dashboard-parking-status');
  if (ps) {
    ps.classList.toggle('text-error', parkCrit);
    ps.classList.toggle('text-amber-400', !parkCrit);
    ps.classList.toggle('font-bold', parkCrit);
  }

  setText($('#dashboard-recgate-value'), q.recommendedGate.gate, { animate: anim });
  setText($('#dashboard-recgate-detail'), q.recommendedGate.hint, { animate: anim });
  setBar($('#dashboard-recgate-bar'), q.recommendedGate.barPct);

  const h = alerts.hazardGate;
  setText($('#dashboard-hazard-title'), h.label, { animate: anim });
  setText($('#dashboard-hazard-pct'), `${h.congestionPct}%`, { animate: anim });
  setText($('#dashboard-hazard-msg'), h.headline, { animate: anim });
  setBar($('#dashboard-hazard-bar'), h.congestionPct, {
    background:
      h.congestionPct >= THRESHOLDS.hazardCritical
        ? 'linear-gradient(90deg,#93000a,#ffb4ab)'
        : 'linear-gradient(90deg,#ff6b00,#fbbf24)',
  });
  setCardCritical($('#dashboard-card-hazard'), h.congestionPct >= THRESHOLDS.hazardCritical);

  const ht = q.halftime;
  const halftimeText = `Leave in ${ht.leaveMinutes} mins to avoid the halftime crowd at ${ht.avoidGate}.`;
  setText($('#dashboard-halftime-warning'), halftimeText, { animate: anim });

  setText($('#dashboard-suggest-food'), formatFoodWait(q.food.waitMinutes), { animate: anim });
  const wcSide = q.washroom.waitMinutes <= 0 ? 'No wait' : `${q.washroom.waitMinutes}m`;
  setText($('#dashboard-suggest-wc'), wcSide, { animate: anim });
  setText($('#dashboard-suggest-exit'), q.exit.gate, { animate: anim });

  setText($('#dashboard-live-updated'), q.liveUpdated, { animate: false });

  const peakEl = $('#dashboard-halftime-peak');
  if (peakEl) {
    setText(peakEl, ht.peakLabel, { animate: anim });
  }

  applyQueueTrend($('#dashboard-queue-chart'), q.queueTrendPct);
}

function randomDelta() {
  return randomInt(-3, 4);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function simulateRealtimeStep(state) {
  const q = state.queue;
  const c = state.crowd;
  const a = state.alerts;

  q.food.waitMinutes = clamp(q.food.waitMinutes + randomInt(-1, 2), 0, 28);
  q.food.barPct = clamp(q.food.barPct + randomDelta(), 5, 98);

  q.washroom.waitMinutes = clamp(q.washroom.waitMinutes + randomInt(-1, 2), 0, 22);
  q.washroom.barPct = clamp(q.washroom.barPct + randomInt(-2, 3), 4, 95);

  q.exit.walkMinutes = clamp(q.exit.walkMinutes + randomInt(-1, 1), 3, 18);
  q.exit.barPct = clamp(q.exit.barPct + randomInt(-4, 5), 10, 90);

  q.parking.congestionPct = clamp(q.parking.congestionPct + randomInt(-5, 6), 35, 98);
  q.parking.barPct = q.parking.congestionPct;
  if (q.parking.congestionPct >= THRESHOLDS.parkingCritical) {
    q.parking.statusLabel = 'Severe delay';
  } else if (q.parking.congestionPct >= 70) {
    q.parking.statusLabel = 'Heavy traffic';
  } else if (q.parking.congestionPct >= 55) {
    q.parking.statusLabel = 'Moderate delay';
  } else {
    q.parking.statusLabel = 'Moving well';
  }

  q.recommendedGate.barPct = clamp(q.recommendedGate.barPct + randomInt(-6, 6), 12, 88);

  q.halftime.leaveMinutes = clamp(q.halftime.leaveMinutes + randomInt(-1, 1), 5, 22);

  c.zones = c.zones.map((z) => {
    const delta = randomInt(-4, 5);
    const densityPct = clamp(z.densityPct + delta, 8, 98);
    let status = z.status;
    if (densityPct < 35) status = 'Clear';
    else if (densityPct < 68) status = 'Moderate';
    else if (densityPct < 85) status = 'Busy';
    else status = 'Congested';
    return { ...z, densityPct, status };
  });

  a.hazardGate.congestionPct = clamp(a.hazardGate.congestionPct + randomInt(-6, 7), 55, 99);
  if (a.hazardGate.congestionPct >= 90) a.hazardGate.headline = 'AVOID NOW';
  else if (a.hazardGate.congestionPct >= 80) a.hazardGate.headline = 'Heavy wait';
  else a.hazardGate.headline = 'Caution';

  q.queueTrendPct = q.queueTrendPct.map((v) => clamp(v + randomInt(-8, 10), 15, 100));

  const sec = randomInt(1, 9);
  q.liveUpdated = `${sec}s ago`;

  if (randomInt(1, 100) <= 3) {
    a.emergencyReroute.active = true;
  } else if (a.emergencyReroute.active && randomInt(1, 100) <= 35) {
    a.emergencyReroute.active = false;
  }

  if (randomInt(1, 100) <= 8) {
    a.congestionBroadcast.active = true;
  } else {
    a.congestionBroadcast.active = false;
  }

  const south = c.zones.find((z) => z.id === 'south');
  if (south) {
    c.aiPrediction = `South Concourse is ${south.densityPct}% full. North Entrance recommended for the fastest snack run right now.`;
  }

  function tierFromPct(p) {
    if (p >= 78) return 'High';
    if (p >= 42) return 'Med';
    return 'Low';
  }
  function badgeLevelFromPct(p) {
    if (p >= 78) return 'high';
    if (p >= 42) return 'medium';
    return 'low';
  }
  const north = c.zones.find((z) => z.id === 'north');
  const east = c.zones.find((z) => z.id === 'east');
  if (north && east && south) {
    c.regionalBadges = [
      { text: `${tierFromPct(north.densityPct)} — North`, level: badgeLevelFromPct(north.densityPct) },
      { text: `${tierFromPct(south.densityPct)} — South`, level: badgeLevelFromPct(south.densityPct) },
      { text: `${tierFromPct(east.densityPct)} — East`, level: badgeLevelFromPct(east.densityPct) },
    ];
  }
}

function snapshotForAlerts(state) {
  return {
    foodWait: state.queue.food.waitMinutes,
    southPct: state.crowd.zones.find((z) => z.id === 'south')?.densityPct ?? 0,
    parkingPct: state.queue.parking.congestionPct,
    hazardPct: state.alerts.hazardGate.congestionPct,
    reroute: state.alerts.emergencyReroute.active,
    congestionBroadcast: state.alerts.congestionBroadcast.active,
  };
}

function runAlertDiffs(prev, next, state) {
  if (!prev) return;

  const foodJump = next.foodWait - prev.foodWait;
  const foodCrossedHigh =
    prev.foodWait < THRESHOLDS.foodWaitSpikeAbsolute &&
    next.foodWait >= THRESHOLDS.foodWaitSpikeAbsolute;
  if (foodJump >= THRESHOLDS.foodWaitSpikeDelta || foodCrossedHigh) {
    showToast(`Food queue spike: waits near ${next.foodWait} min — try another stand.`, {
      type: 'error',
      duration: 4500,
    });
  }

  if (!prev.reroute && next.reroute) {
    showToast(state.alerts.emergencyReroute.message, { type: 'error', duration: 6000 });
  }

  if (
    next.southPct >= THRESHOLDS.zoneCritical &&
    prev.southPct < THRESHOLDS.zoneCritical - 3
  ) {
    showToast('Congestion warning: South concourse is critically full.', {
      type: 'error',
      duration: 5000,
    });
  }

  if (
    next.parkingPct >= THRESHOLDS.parkingCritical &&
    prev.parkingPct < THRESHOLDS.parkingCritical - 5
  ) {
    showToast('Parking congestion: expect long exits from your lot.', {
      type: 'error',
      duration: 4500,
    });
  }

  if (!prev.congestionBroadcast && next.congestionBroadcast) {
    showToast(state.alerts.congestionBroadcast.message, { duration: 4000 });
  }
}

let timerId = null;

export function stopDashboardLive() {
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }
}

/**
 * @param {{ crowdUrl?: string, queueUrl?: string, alertsUrl?: string, enableSimulation?: boolean }} opts
 */
export async function initDashboard(opts = {}) {
  injectDashboardStyles();

  const urls = {
    crowd: opts.crowdUrl ?? PATHS.crowd,
    queue: opts.queueUrl ?? PATHS.queue,
    alerts: opts.alertsUrl ?? PATHS.alerts,
  };

  let state;
  try {
    const [crowd, queue, alerts] = await Promise.all([
      fetchJson(urls.crowd),
      fetchJson(urls.queue),
      fetchJson(urls.alerts),
    ]);
    state = buildMerged(crowd, queue, alerts);
  } catch {
    hideDashboardSkeleton();
    showToast('Could not load dashboard data. Check your connection and refresh.', {
      duration: 5500,
      type: 'error',
    });
    return { state: null, stop: stopDashboardLive };
  }
  applyDashboardState(state, { initial: true });
  hideDashboardSkeleton();

  const simOn = opts.enableSimulation !== false && isDemoMode();
  if (!simOn) {
    return { state, stop: stopDashboardLive };
  }

  let prevSnap = snapshotForAlerts(state);

  const schedule = () => {
    const delay = randomInt(SIM_MS.min, SIM_MS.max);
    timerId = window.setTimeout(tick, delay);
  };

  const tick = () => {
    simulateRealtimeStep(state);
    const nextSnap = snapshotForAlerts(state);
    runAlertDiffs(prevSnap, nextSnap, state);
    prevSnap = nextSnap;
    applyDashboardState(state, { initial: false });
    schedule();
  };

  schedule();

  return { state, stop: stopDashboardLive };
}
