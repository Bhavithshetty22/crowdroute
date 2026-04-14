/**
 * API Status Utilities
 * Dynamically queries the Node layer to assess backend injection state.
 */

export async function checkGeminiStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    return data.gemini ? 'connected' : 'disconnected';
  } catch {
    return 'disconnected';
  }
}

export async function checkFirebaseStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    return data.firebase ? 'connected' : 'disconnected';
  } catch {
    return 'disconnected';
  }
}

export async function checkGoogleMapsStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    return data.maps ? 'connected' : 'disconnected';
  } catch {
    return 'disconnected';
  }
}
