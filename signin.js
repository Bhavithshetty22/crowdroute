import { initPagePolish } from './polish.js';
import { initOnboarding } from './onboarding.js';

function showSigninPage() {
  document.getElementById('page-signin')?.classList.add('active');
  document.getElementById('page-onboarding')?.classList.remove('active');
  window.scrollTo(0, 0);
}

function showOnboardingPage() {
  document.getElementById('page-signin')?.classList.remove('active');
  document.getElementById('page-onboarding')?.classList.add('active');
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-signin-show-onboarding]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    showOnboardingPage();
  });
});

document.querySelectorAll('[data-signin-back]').forEach((el) => {
  el.addEventListener('click', () => showSigninPage());
});

document.querySelector('[data-signin-email-form]')?.addEventListener('submit', (e) => {
  e.preventDefault();
  showOnboardingPage();
});

initPagePolish({ mobileNav: false });
initOnboarding({
  container: '#onboarding-flow',
  progressFill: '#signin-onboard-progress-fill',
  dashboardHref: 'dashboard.html',
});
