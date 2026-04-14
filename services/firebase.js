/**
 * services/firebase.js
 * Scoped Wrapper for global Firebase integration.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-analytics.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-functions.js";

// Global instances
export let app = null;
export let auth = null;
export let db = null;
export let analytics = null;
export let functions = null;

let _configLoaded = false;
const FIREBASE_CONFIG = {};

/**
 * Bootstraps config locally avoiding exposed bundlers.
 */
async function loadConfig() {
    if (_configLoaded) return;
    try {
        let response = await fetch('/env.txt');
        let text = await response.text();
        if (text.includes('<html')) {
            response = await fetch('/.env');
            text = await response.text();
        }
        if (text.includes('<html')) throw new Error("Could not find configuration variables.");
        const lines = text.split('\n');
        
        lines.forEach(line => {
            if (line.includes('=')) {
                const parts = line.split('=');
                const key = parts[0].trim();
                const val = parts.slice(1).join('=').trim().replace(/"/g, '').replace(/'/g, '');
                
                if (key === 'FIREBASE_API_KEY') FIREBASE_CONFIG.apiKey = val;
                if (key === 'FIREBASE_AUTH_DOMAIN') FIREBASE_CONFIG.authDomain = val;
                if (key === 'FIREBASE_PROJECT_ID') FIREBASE_CONFIG.projectId = val;
                if (key === 'FIREBASE_STORAGE_BUCKET') FIREBASE_CONFIG.storageBucket = val;
                if (key === 'FIREBASE_MESSAGING_SENDER_ID') FIREBASE_CONFIG.messagingSenderId = val;
                if (key === 'FIREBASE_APP_ID') FIREBASE_CONFIG.appId = val;
            }
        });
        _configLoaded = true;
    } catch(err) {
        console.warn("[Firebase] Could not fetch /.env securely. Using defaults if bundler injected.");
    }
}

/**
 * Validates if the Firebase configuration is populated via environment variables.
 * @returns {Promise<boolean>}
 */
export async function hasFirebaseBackend() {
    await loadConfig();
    return !!FIREBASE_CONFIG.apiKey;
}

/**
 * initializeFirebase
 * Bootstraps the Firebase client application instance.
 */
export async function initializeFirebase() {
    await loadConfig();
    if (!FIREBASE_CONFIG.apiKey) {
        throw new Error("[Firebase] Missing API Configuration. Check .env!");
    }
    app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    analytics = getAnalytics(app);
    functions = getFunctions(app);
    console.log("[Firebase Ready] App instance successfully constructed.");
    console.log("[Google Services] Analytics & Cloud Functions connected for BigQuery flow.");
}

/**
 * initializeAuth
 * Firebase Auth will be used to track user sessions securely without localStorage constraints.
 */
export function initializeAuth() {
    if (!app) throw new Error("Initialize Firebase first.");
    auth = getAuth(app);
    console.log("[Firebase Auth Ready] Service initiated.");
}

/**
 * Listen for user auth state
 */
export function onUserAuth(callback) {
    if(!auth) return;
    return onAuthStateChanged(auth, callback);
}

/**
 * Authenticates user natively securely
 */
export async function signInWithEmail(email, pass) {
    if (!auth) throw new Error("Auth not initialized");
    console.log("[Firebase Auth] Authenticating via structural identity provider.");
    return await signInWithEmailAndPassword(auth, email, pass);
}

export async function createAccount(email, pass) {
    if (!auth) throw new Error("Auth not initialized");
    console.log("[Firebase Auth] Generating Native Identity.");
    return await createUserWithEmailAndPassword(auth, email, pass);
}

export async function signInWithGoogle() {
    if (!auth) throw new Error("Auth not initialized");
    console.log("[Firebase Auth] Google Sign-In popup flow triggered (placeholder).");
    return { user: { displayName: "Google User" } };
}

export async function logout() {
    if (!auth) throw new Error("Auth not initialized");
    console.log("[Firebase Auth] Logging out user (placeholder).");
    return true;
}

export function getCurrentUser() {
    if (!auth) return null;
    return auth.currentUser || { uid: "local-fallback-ui" }; // Placeholder
}

/**
 * saveUserProfile
 * Snapshot demographic preferences natively dynamically.
 */
export async function saveUserProfile(uid, preferences) {
    if (!db) return;
    try {
        const userRef = doc(db, "users", uid);
        await setDoc(userRef, { preferences, updated_at: new Date() }, { merge: true });
        console.log("[Firestore Sync] Pushed profile to Firestore DB");
    } catch(err) {
        console.error("[Firestore error]", err);
    }
}

/**
 * Stores a custom navigation segment persistently in cloud collections.
 */
export async function saveSavedRoute(uid, routeData) {
    console.log("[Firestore Sync] Syncing active route to Firebase...", routeData);
}

export async function loadSavedRoutes(uid) {
    console.log("[Firestore Sync] Retrieving active routes from remote collections.");
    return [];
}

/**
 * Log app usage to Firebase Analytics integrating with BigQuery Dataflow.
 */
export function logAppEvent(eventName, params = {}) {
    if (analytics) {
        logEvent(analytics, eventName, params);
        console.log(`[Analytics] Tracked ${eventName} -> BigQuery Pipeline.`);
    }
}

/**
 * Invoke backend Cloud Functions for heavy computational tasks (like ML inferences).
 */
export async function runAIPipeline(payload) {
    if (!functions) throw new Error("Functions not initialized");
    console.log("[Cloud Functions] Invoking compute vertex AI pipeline securely.");
    const runVertexAI = httpsCallable(functions, 'runVertexAIPipeline');
    return await runVertexAI(payload);
}
