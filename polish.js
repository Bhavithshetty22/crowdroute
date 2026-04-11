import { fadePageTransition, isDemoMode, showToast } from './shared.js';

const DEMO_TOAST_KEY = 'crowdpilot_demo_emergency_hint';

/**
 * @param {object} [opts]
 * @param {boolean} [opts.mobileNav] — clone desktop sidebar links into drawer (default true)
 * @param {boolean} [opts.linkFade] — fade out before navigating to sibling .html pages (default true)
 * @param {boolean} [opts.demoToast] — one delayed “demo” toast on non-emergency pages (default true)
 */
export function initPagePolish(opts = {}) {
  const mobileNav = opts.mobileNav !== false;
  const linkFade = opts.linkFade !== false;
  const demoToast = opts.demoToast !== false;

  document.body.classList.add('cp-preparing');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove('cp-preparing');
      document.body.classList.add('cp-page-ready');
      const loader = document.getElementById('cp-global-loader');
      if (loader) {
        loader.classList.add('cp-global-loader--hide');
        loader.setAttribute('aria-hidden', 'true');
      }
    });
  });

  if (mobileNav) initMobileDrawer();
  if (linkFade) initInternalLinkFade();
  if (demoToast && isDemoMode()) scheduleDemoHintToast();
  initServiceWorkerOptional();
  initDemoBrowserNotifications();
  initDemoNewsletterFooter();
}

function initDemoNewsletterFooter() {
  document.querySelectorAll('[data-demo-newsletter]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('Demo build: newsletter signup is not connected to a server.', { duration: 3600 });
    });
  });
}

function initServiceWorkerOptional() {
  if (!('serviceWorker' in navigator)) return;
  try {
    if (localStorage.getItem('crowdpilot_sw') === 'false') return;
  } catch {
    /* ignore */
  }
  const swUrl = new URL('./sw.js', import.meta.url);
  const scope = new URL('./', import.meta.url).href;
  navigator.serviceWorker.register(swUrl, { scope }).catch(() => {});
}

function initDemoBrowserNotifications() {
  if (!isDemoMode()) return;
  if (!('Notification' in window)) return;
  if (!/dashboard\.html/i.test(window.location.pathname)) return;

  const samples = [
    {
      title: 'CrowdPilot · Queues',
      body: 'Queue spike: north concessions trending +4 min wait.',
    },
    {
      title: 'CrowdPilot · Emergency',
      body: 'Demo alert: follow venue staff if an alarm sounds.',
    },
    {
      title: 'CrowdPilot · Parking',
      body: 'Lot C exit congestion elevated — consider staggering departure.',
    },
    {
      title: 'CrowdPilot · Routes',
      body: 'A faster walk to Gate 9 is available — open Routes.',
    },
  ];

  let idx = 0;
  function fire() {
    const s = samples[idx % samples.length];
    idx += 1;
    try {
      new Notification(s.title, { body: s.body, silent: false });
    } catch {
      /* ignore */
    }
    window.setTimeout(fire, 26000 + Math.random() * 14000);
  }

  window.setTimeout(() => {
    if (Notification.permission === 'granted') {
      window.setTimeout(fire, 4000);
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') window.setTimeout(fire, 4000);
      });
    }
  }, 6000);
}

function initMobileDrawer() {
  const drawer = document.getElementById('cp-mobile-drawer');
  const openBtn = document.getElementById('cp-menu-btn');
  const closeBtn = document.getElementById('cp-drawer-close');
  const navHost = document.getElementById('cp-drawer-nav');
  const aside = document.querySelector('aside.sidebar');

  if (!drawer || !openBtn || !navHost) return;

  const sourceNav = aside?.querySelector('nav');
  if (sourceNav && !navHost.dataset.cloned) {
    navHost.innerHTML = sourceNav.innerHTML;
    navHost.dataset.cloned = '1';
    navHost.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => closeDrawer());
    });
  }

  function openDrawer() {
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    openBtn.setAttribute('aria-expanded', 'true');
    const first = navHost.querySelector('a');
    window.setTimeout(() => first?.focus(), 200);
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.focus();
  }

  openBtn.addEventListener('click', () => {
    if (drawer.classList.contains('is-open')) closeDrawer();
    else openDrawer();
  });
  closeBtn?.addEventListener('click', closeDrawer);
  drawer.querySelector('.cp-mobile-drawer__backdrop')?.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
  });
}

function initInternalLinkFade() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    let url;
    try {
      url = new URL(a.href, window.location.href);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin) return;
    if (!/\.html?$/i.test(url.pathname) && !url.pathname.endsWith('/')) return;
    e.preventDefault();
    fadePageTransition(a.href, { ms: 220 });
  });
}

function scheduleDemoHintToast() {
  if (/emergency\.html/i.test(window.location.pathname)) return;
  try {
    if (sessionStorage.getItem(DEMO_TOAST_KEY)) return;
  } catch {
    return;
  }

  const id = window.setTimeout(() => {
    try {
      if (sessionStorage.getItem(DEMO_TOAST_KEY)) return;
      sessionStorage.setItem(DEMO_TOAST_KEY, '1');
    } catch {
      /* ignore */
    }
    showToast(
      'Demo mode: live simulations are on. Disable anytime under Profile → Demo mode.',
      { duration: 6500 },
    );
  }, 72000);

  window.addEventListener(
    'beforeunload',
    () => {
      clearTimeout(id);
    },
    { once: true },
  );
}
