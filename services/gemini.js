/**
 * services/gemini.js
 * Scalable Wrapper for Google's Gemini AI generative API integration.
 * Refactored to utilize a secure backend endpoint instead of exposing API keys
 * directly inside the browser's localStorage.
 *
 * ==========================================
 * BACKEND DOCUMENTATION PLACEHOLDER
 * ==========================================
 * Required Environment Variable: process.env.GEMINI_API_KEY
 * 
 * Expected Backend Route:
 * POST /api/gemini
 * 
 * Expected Request Payload:
 * {
 *   "prompt": "Where is the shortest queue?"
 * }
 * 
 * Expected Response Payload:
 * {
 *   "reply": "The shortest food queue is at Stall B near Gate 3."
 * }
 * ==========================================
 */

/**
 * Checks if the secure backend endpoint for Gemini is reachable.
 * @returns {Promise<boolean>} True if the backend responds successfully.
 */
export async function hasGeminiBackend() {
    try {
        const res = await fetch('/api/status', { method: 'GET' });
        const data = await res.json();
        return data.gemini === true;
    } catch {
        return false;
    }
}

/**
 * askGemini
 * Transmits natural language requests securely to the Node/Express backend.
 * 
 * @param {string} prompt - The natural language request issued by the user.
 * @returns {Promise<string|null>} - Returning the AI contextual response gracefully if failed.
 */
export async function askGemini(prompt) {
    if (!prompt || !prompt.trim()) return null;

    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt: prompt.trim() })
        });

        if (!response.ok) {
            console.warn(`[Gemini] Backend returned HTTP ${response.status}. Falling back locally.`);
            return null;
        }

        const data = await response.json();
        return data.reply || null;
    } catch (error) {
        console.error("[Gemini] Fetch request to /api/gemini failed:", error);
        return null; // Signals the assistant to use local fallback logic
    }
}
