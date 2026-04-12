import { initPagePolish } from './polish.js';
import { initOnboarding } from './onboarding.js';
import { initializeFirebase, initializeAuth, createAccount, signInWithEmail } from './services/firebase.js';
import { showToast } from './shared.js';

let firebaseReady = false;
async function bootFirebase() {
  try {
     await initializeFirebase();
     initializeAuth();
     firebaseReady = true;
  } catch (err) {
     console.error("Firebase Boot Failed: ", err);
  }
}
bootFirebase();

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

document.getElementById('btn-email-signin')?.addEventListener('click', async (e) => {
  e.preventDefault();
  if(!firebaseReady) return showToast("Authenticational servers unreachable.", {type: 'error'});
  
  const email = document.getElementById('email-input').value;
  const pass = document.getElementById('password-input').value;
  
  try {
     const cred = await signInWithEmail(email, pass);
     showToast("Welcome back!", {type: 'success'});
     window.localStorage.setItem('crowdpilot_uid', cred.user.uid);
     showOnboardingPage();
  } catch(err) {
     showToast("Invalid credentials or user not found.", {type: 'error'});
  }
});

document.getElementById('btn-create-account')?.addEventListener('click', async (e) => {
  e.preventDefault();
  if(!firebaseReady) return showToast("Authenticational servers unreachable.", {type: 'error'});
  
  const email = document.getElementById('email-input').value;
  const pass = document.getElementById('password-input').value;
  
  if(!email || pass.length < 6) return showToast("Please enter a valid email and 6+ character password.", {type: 'error'});
  
  try {
     const cred = await createAccount(email, pass);
     showToast("Account Created! You can now configure your preferences.", {type: 'success'});
     window.localStorage.setItem('crowdpilot_uid', cred.user.uid);
     showOnboardingPage();
  } catch(err) {
     showToast(err.message || "Failed to create account.", {type: 'error'});
  }
});

initPagePolish({ mobileNav: false });
initOnboarding({
  container: '#page-onboarding',
  progressFill: '#progress-fill',
  dashboardHref: 'dashboard.html',
});
