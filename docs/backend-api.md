# Backend Node API

## Features
CrowdPilot AI ships with a highly lightweight Express node layer intended only to act as a secure proxy to Google Services (Vertex API / Gemini).

## Endpoints

### `GET /api/status`
Returns external configuration availability context instantly without contacting external servers.
**Response**:
```json
{
  "gemini": true,
  "firebase": false,
  "maps": false
}
```

### `POST /api/gemini`
Safely relays prompts to Gemini 1.5 Flash without exposing `GEMINI_API_KEY` on the client.
**Payload Body**:
```json
{
  "prompt": "Where is the shortest food line?"
}
```
**Response**:
```json
{
  "reply": "Based on live zones, Stall B currently offers the lowest wait."
}
```
**Local Fallback**:
If `GEMINI_API_KEY` is not present, this will return `HTTP 503`. The browser's native `assistant.js` gracefully handles this by parsing matching internal intents offline.
