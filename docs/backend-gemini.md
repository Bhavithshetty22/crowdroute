# Securing the Gemini Integration Using a Backend

CrowdPilot AI is built to natively consume Google's powerful Gemini 1.5 generative models. However, exposing restricted API keys explicitly in an exposed public client represents a catastrophic security vulnerability in production applications.

## Why Frontend-Only AI is Insecure
If a `<script>` or `localStorage` implementation contains the `AIza...` key, any user with browser Developer Tools (F12) can simply extract the key and run their own unregulated prompts natively, exhausting project quotas and opening the Google Cloud ecosystem to billing attacks.

## Recommended Backend Flow
API keys should never be stored in `localStorage`. 

The secure protocol routes prompts anonymously from the CrowdPilot Javascript frontend to its own Node.js/Express backend server, where the `process.env.GEMINI_API_KEY` credential is mathematically injected securely behind closed doors.

### System Configuration
Using the `dotenv` package:
```env
# .env file on the root server
GEMINI_API_KEY=AIzaSy...your...key...here
```

### Express.js Example Integration
```javascript
// server.js
require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

// Status endpoint checking if backend is alive
app.get('/api/gemini/status', (req, res) => {
    if(process.env.GEMINI_API_KEY) {
        res.status(200).json({ status: 'Connected' });
    } else {
        res.status(503).json({ status: 'Not Configured' });
    }
});

// Secure interaction route
app.post('/api/gemini', async (req, res) => {
    const { prompt } = req.body;
    
    try {
        // Build payload and fetch from Google APIs
        const response = await fetch(`https://generativelanguage.googleapis.com/...key=${process.env.GEMINI_API_KEY}`, {
             method: 'POST',
             body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const data = await response.json();
        
        // Return only the text back to the browser gracefully
        res.json({ reply: data.candidates[0].content.parts[0].text });
    } catch(err) {
        res.status(500).json({ error: "Upstream failure." });
    }
});

app.listen(3000, () => console.log('Secure AI Backend running on port 3000'));
```

### Request & Response Architecture
**Browser Request:**
```json
{
  "prompt": "Where is the shortest food queue from Section B12?"
}
```

**Secure API Response:**
```json
{
  "reply": "The shortest food queue is at the North Wing BBQ (Section A side) — roughly a 2 minute wait."
}
```
