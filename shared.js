/** localStorage key for optional Google AI Studio / Gemini API key (Assistant). */
export const LS_GEMINI_API_KEY = 'crowdpilot_gemini_api_key';

export function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadFromStorage(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

export function showToast(message, options = {}) {
  const { duration = 3000, type = 'info' } = options;
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.textContent = message;
  const bg = type === 'error' ? '#b91c1c' : '#1f2937';
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '1.25rem',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    background: bg,
    color: '#fff',
    font: '14px/1.4 system-ui, sans-serif',
    zIndex: '9999',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    opacity: '0',
    transition: 'opacity 0.2s ease',
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
  });
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, duration);
}

/** Pass a URL string for full navigation, or a function for SPA-style routing. */
export function fadePageTransition(hrefOrFn, options = {}) {
  const { ms = 200 } = options;
  const body = document.body;
  const prevTransition = body.style.transition;
  body.style.transition = `opacity ${ms}ms ease`;
  body.style.opacity = '0';
  setTimeout(() => {
    if (typeof hrefOrFn === 'string') {
      window.location.href = hrefOrFn;
    } else {
      hrefOrFn();
      body.style.opacity = '1';
      body.style.transition = prevTransition;
    }
  }, ms);
}

/** Random integer in [min, max], inclusive. */
export function randomInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

const DEMO_STORAGE_KEY = 'crowdpilot_demo';

/** Live simulations & demo toasts are on unless user disables (Profile or `localStorage.crowdpilot_demo = 'false'`). */
export function isDemoMode() {
  try {
    return localStorage.getItem(DEMO_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setDemoMode(enabled) {
  try {
    if (enabled) localStorage.removeItem(DEMO_STORAGE_KEY);
    else localStorage.setItem(DEMO_STORAGE_KEY, 'false');
  } catch {
    /* ignore */
  }
}
