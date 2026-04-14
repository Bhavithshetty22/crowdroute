const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Status Endpoint
app.get('/api/status', (req, res) => {
  res.json({
    gemini: !!process.env.GEMINI_API_KEY,
    firebase: !!process.env.FIREBASE_API_KEY,
    maps: !!process.env.GOOGLE_MAPS_API_KEY
  });
});

// Gemini Endpoint
app.post('/api/gemini', async (req, res) => {
  const { prompt } = req.body;
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Gemini not configured' });
  }
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error('API Error');
    
    // Parse Google Gemini response format
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received";
    res.json({ reply });
  } catch (error) {
    console.error('Gemini error:', error);
    res.status(500).json({ error: 'Failed to contact Gemini' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
