import {
  saveToStorage,
  loadFromStorage,
  showToast,
  fadePageTransition,
} from './shared.js';

const STORAGE_KEYS = {
  seatSection: 'seatSection',
  favoriteCategories: 'favoriteCategories',
  routePreference: 'routePreference',
  accessibilityPreference: 'accessibilityPreference',
  complete: 'crowdpilotOnboardingComplete',
};

const STEP_ORDER = ['seat', 'categories', 'route', 'accessibility', 'summary'];

const DEFAULTS = {
  container: '#onboarding-flow',
  progressFill: '#onboarding-progress-fill',
  stepSelector: '[data-onboard-step]',
  transitionMs: 320,
  dashboardHref: 'dashboard.html',
};

function injectStepStyles() {
  if (document.getElementById('crowdpilot-onboarding-styles')) return;
  const el = document.createElement('style');
  el.id = 'crowdpilot-onboarding-styles';
  el.textContent = `
    [data-onboard-steps-viewport] {
      position: relative;
      overflow: hidden;
      min-height: 22rem;
    }
    [data-onboard-step] {
      position: absolute;
      inset: 0;
      opacity: 0;
      pointer-events: none;
      transform: translateX(18px);
      transition: opacity var(--onboard-t, 320ms) ease,
        transform var(--onboard-t, 320ms) ease;
    }
    [data-onboard-step].onboard-step-active {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(0);
    }
    [data-onboard-step].onboard-step-exit-left {
      opacity: 0;
      transform: translateX(-18px);
    }
    [data-onboard-step].onboard-step-exit-right {
      opacity: 0;
      transform: translateX(18px);
    }
    [data-onboard-step].onboard-step-enter-from-right {
      transform: translateX(18px);
      opacity: 0;
    }
    [data-onboard-step].onboard-step-enter-from-left {
      transform: translateX(-18px);
      opacity: 0;
    }
  `;
  document.head.appendChild(el);
}

function stepType(el) {
  return el?.dataset?.onboardStep || '';
}

function validateStep(stepEl) {
  const type = stepType(stepEl);
  if (type === 'summary') return { ok: true };

  const selected = stepEl.querySelectorAll('.pref-card.selected');
  const single = stepEl.querySelector('.pref-card.selected');

  if (type === 'seat') {
    return single
      ? { ok: true }
      : { ok: false, message: 'Choose your seat section to continue.' };
  }
  if (type === 'categories') {
    return selected.length > 0
      ? { ok: true }
      : { ok: false, message: 'Pick at least one favorite category.' };
  }
  if (type === 'route' || type === 'accessibility') {
    if (!single) return { ok: false, message: 'Select an option to continue.' };
    const v = readSingleValue(stepEl);
    return v
      ? { ok: true }
      : { ok: false, message: 'Select an option to continue.' };
  }
  return { ok: true };
}

function readSeatSection(stepEl) {
  const card = stepEl.querySelector('.pref-card.selected');
  if (!card) return null;
  const detailInput = stepEl.querySelector('[data-onboard-seat-detail]');
  const code =
    card.dataset.value ||
    card.dataset.code ||
    card.querySelector('.text-2xl')?.textContent?.trim() ||
    '';
  const label =
    card.dataset.label || card.querySelector('.text-xs')?.textContent?.trim() || '';
  return {
    code,
    label,
    seatDetail: detailInput?.value?.trim() || '',
  };
}

function readCategories(stepEl) {
  return [...stepEl.querySelectorAll('.pref-card.selected')].map((card) => {
    const id =
      card.dataset.value ||
      card.dataset.category ||
      card.querySelector('.font-medium')?.textContent?.trim() ||
      card.textContent.trim();
    const label = card.dataset.label || id;
    return { id, label };
  });
}

function readSingleValue(stepEl) {
  const card = stepEl.querySelector('.pref-card.selected');
  if (!card) return null;
  return (
    card.dataset.value ||
    card.dataset.preference ||
    card.querySelector('.font-bold')?.textContent?.trim() ||
    ''
  );
}

function collectFromDom(stepEl, state) {
  const type = stepType(stepEl);
  if (type === 'seat') state.seatSection = readSeatSection(stepEl);
  if (type === 'categories') {
    state.favoriteCategories = readCategories(stepEl).map((c) => c.id || c.label);
  }
  if (type === 'route') state.routePreference = readSingleValue(stepEl);
  if (type === 'accessibility') {
    state.accessibilityPreference = readSingleValue(stepEl);
  }
}

function applyStateToDom(steps, state) {
  for (const el of steps) {
    const type = stepType(el);
    if (type === 'seat' && state.seatSection?.code) {
      const code = state.seatSection.code;
      el.querySelectorAll('.pref-card').forEach((c) => c.classList.remove('selected'));
      const match =
        el.querySelector(
          `.pref-card[data-value="${cssEscape(code)}"], .pref-card[data-code="${cssEscape(code)}"]`,
        ) ||
        [...el.querySelectorAll('.pref-card')].find(
          (c) =>
            c.dataset.value === code ||
            c.dataset.code === code ||
            c.querySelector('.text-2xl')?.textContent?.trim() === code,
        );
      match?.classList.add('selected');
      const input = el.querySelector('[data-onboard-seat-detail]');
      if (input && state.seatSection.seatDetail) input.value = state.seatSection.seatDetail;
    }
    if (type === 'categories' && state.favoriteCategories?.length) {
      el.querySelectorAll('.pref-card').forEach((card) => {
        const v =
          card.dataset.value ||
          card.dataset.category ||
          card.querySelector('.font-medium')?.textContent?.trim();
        if (v && state.favoriteCategories.includes(v)) card.classList.add('selected');
        else card.classList.remove('selected');
      });
    }
    if (type === 'route' && state.routePreference) {
      el.querySelectorAll('.pref-card').forEach((c) => c.classList.remove('selected'));
      const exp = state.routePreference;
      const m =
        el.querySelector(
          `.pref-card[data-value="${cssEscape(exp)}"], .pref-card[data-preference="${cssEscape(exp)}"]`,
        ) ||
        [...el.querySelectorAll('.pref-card')].find(
          (c) =>
            c.dataset.value === exp ||
            c.dataset.preference === exp ||
            c.querySelector('.font-bold')?.textContent?.trim() === exp,
        );
      m?.classList.add('selected');
    }
    if (type === 'accessibility' && state.accessibilityPreference) {
      el.querySelectorAll('.pref-card').forEach((c) => c.classList.remove('selected'));
      const exp = state.accessibilityPreference;
      const m =
        el.querySelector(
          `.pref-card[data-value="${cssEscape(exp)}"]`,
        ) ||
        [...el.querySelectorAll('.pref-card')].find(
          (c) =>
            c.dataset.value === exp ||
            c.querySelector('.font-bold')?.textContent?.trim() === exp,
        );
      m?.classList.add('selected');
    }
  }
}

function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, '\\$&');
}

function formatList(arr) {
  if (!arr?.length) return '—';
  return arr.join(', ');
}

function renderSummary(summaryEl, state) {
  summaryEl.querySelectorAll('[data-summary]').forEach((node) => {
    const key = node.dataset.summary;
    if (key === 'seatSection') {
      const s = state.seatSection;
      node.textContent = s?.code
        ? `${s.code}${s.label ? ` — ${s.label}` : ''}${s.seatDetail ? ` · ${s.seatDetail}` : ''}`
        : '—';
    } else if (key === 'favoriteCategories') {
      node.textContent = formatList(state.favoriteCategories);
    } else if (key === 'routePreference') {
      node.textContent = state.routePreference || '—';
    } else if (key === 'accessibilityPreference') {
      node.textContent = state.accessibilityPreference || '—';
    }
  });
}

function persistAll(state) {
  saveToStorage(STORAGE_KEYS.seatSection, state.seatSection);
  saveToStorage(STORAGE_KEYS.favoriteCategories, state.favoriteCategories);
  saveToStorage(STORAGE_KEYS.routePreference, state.routePreference);
  saveToStorage(STORAGE_KEYS.accessibilityPreference, state.accessibilityPreference);
  saveToStorage(STORAGE_KEYS.complete, true);
}

function loadState() {
  return {
    seatSection: loadFromStorage(STORAGE_KEYS.seatSection, null),
    favoriteCategories: loadFromStorage(STORAGE_KEYS.favoriteCategories, []) || [],
    routePreference: loadFromStorage(STORAGE_KEYS.routePreference, null),
    accessibilityPreference: loadFromStorage(STORAGE_KEYS.accessibilityPreference, null),
  };
}

function updateProgress(progressFillEl, stepIndex, total) {
  if (!progressFillEl) return;
  const pct = Math.round(((stepIndex + 1) / total) * 100);
  progressFillEl.style.width = `${pct}%`;
}

function bindCardGroups(root) {
  root.querySelectorAll('[data-onboard-step]').forEach((step) => {
    const type = stepType(step);
    const multi = type === 'categories';
    step.querySelectorAll('.pref-card').forEach((card) => {
      card.addEventListener('click', () => {
        if (multi) {
          card.classList.toggle('selected');
          return;
        }
        const group = card.parentElement;
        group?.querySelectorAll('.pref-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });
  });
}

function animateToStep(steps, fromIndex, toIndex, opts) {
  const { transitionMs } = opts;
  const forward = toIndex > fromIndex;
  const fromEl = steps[fromIndex];
  const toEl = steps[toIndex];
  if (!toEl) return;

  const t = `${transitionMs}ms`;
  fromEl?.style.setProperty('--onboard-t', t);
  toEl.style.setProperty('--onboard-t', t);

  fromEl?.classList.remove('onboard-step-active');
  fromEl?.classList.add(forward ? 'onboard-step-exit-left' : 'onboard-step-exit-right');

  toEl.classList.remove(
    'onboard-step-exit-left',
    'onboard-step-exit-right',
    'onboard-step-enter-from-right',
    'onboard-step-enter-from-left',
  );
  toEl.classList.add(forward ? 'onboard-step-enter-from-right' : 'onboard-step-enter-from-left');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toEl.classList.add('onboard-step-active');
      toEl.classList.remove('onboard-step-enter-from-right', 'onboard-step-enter-from-left');
    });
  });

  window.setTimeout(() => {
    fromEl?.classList.remove('onboard-step-exit-left', 'onboard-step-exit-right');
  }, transitionMs);
}

/**
 * Wire multi-step onboarding inside a container.
 * @param {Partial<typeof DEFAULTS>} options
 */
export function initOnboarding(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const container = document.querySelector(cfg.container);
  if (!container) return null;

  injectStepStyles();
  const viewport =
    container.querySelector('[data-onboard-steps-viewport]') || container;
  const steps = [...viewport.querySelectorAll(cfg.stepSelector)];

  const ordered = STEP_ORDER.map((name) => steps.find((s) => stepType(s) === name)).filter(
    Boolean,
  );
  if (!ordered.length) return null;

  const progressFill = document.querySelector(cfg.progressFill);
  const state = loadState();
  applyStateToDom(ordered, state);
  bindCardGroups(container);

  let index = 0;

  const refreshSummary = () => {
    const summaryEl = ordered.find((s) => stepType(s) === 'summary');
    if (summaryEl) {
      ordered.forEach((el) => collectFromDom(el, state));
      renderSummary(summaryEl, state);
    }
  };

  const go = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= ordered.length) return;
    animateToStep(ordered, index, nextIndex, { transitionMs: cfg.transitionMs });
    index = nextIndex;
    updateProgress(progressFill, index, ordered.length);
    if (stepType(ordered[index]) === 'summary') refreshSummary();
  };

  ordered.forEach((el, i) => {
    el.classList.toggle('onboard-step-active', i === 0);
  });
  updateProgress(progressFill, 0, ordered.length);

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-onboard-action]');
    if (!btn) return;
    const action = btn.dataset.onboardAction;
    const current = ordered[index];

    if (action === 'back') {
      go(index - 1);
      return;
    }

    if (action === 'next') {
      const v = validateStep(current);
      if (!v.ok) {
        showToast(v.message, { type: 'error' });
        return;
      }
      collectFromDom(current, state);
      if (index < ordered.length - 1) go(index + 1);
      return;
    }

    if (action === 'complete') {
      ordered.forEach((el) => collectFromDom(el, state));
      const checks = ordered.filter((el) => stepType(el) !== 'summary');
      for (const el of checks) {
        const v = validateStep(el);
        if (!v.ok) {
          showToast(v.message, { type: 'error' });
          return;
        }
      }
      persistAll(state);
      showToast('Onboarding complete. Welcome to CrowdPilot AI!');
      window.setTimeout(() => {
        fadePageTransition(cfg.dashboardHref, { ms: 280 });
      }, 450);
    }
  });

  return {
    getState: () => ({ ...state }),
    goToStep: (i) => go(i),
    getStepIndex: () => index,
  };
}
