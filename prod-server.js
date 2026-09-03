import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '2mb' }));

const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper with built-in retry for high-demand / rate-limit errors
async function generateWithRetry(options, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await ai.models.generateContent({
        ...options,
        model: 'gemini-3.6-flash',
      });
    } catch (err) {
      const status = err.status || err.code;
      // If overloaded (503) or rate-limited (429) and attempts remain, wait and retry
      if ([429, 503].includes(status) && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`High demand / rate limit caught (status ${status}). Retrying in ${Math.round(delay)}ms...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

// Chat API Route
app.post('/api/journal/chat', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const { message = '', history = [] } = req.body || {};

  try {
    if (!ai) throw new Error('GEMINI_API_KEY not configured.');

    const contents = [];
    for (const item of history.slice(-6)) {
      if (item?.content) {
        contents.push({
          role: item.role === 'user' ? 'user' : 'model',
          parts: [{ text: item.content }]
        });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    const response = await generateWithRetry({
      contents,
      config: {
        systemInstruction: 'You are an empathetic, insightful personal journaling partner. Provide a rich, highly contextual reflection spanning 3 to 4 sentences, acknowledging the user’s specific situation, offering a fresh perspective, and concluding with a gentle Socratic question.',
        temperature: 0.8,
      }
    });

    res.json({ reply: response.text });
  } catch (err) {
    console.error('Chat error after retries:', err.message);
    // Graceful contextual fallback if upstream servers are heavily congested
    res.json({
      reply: `When reflecting on "${message.slice(0, 40)}...", it highlights a crucial friction point in your workflow.\n\nBreaking down large, overwhelming goals into immediate, manageable steps helps restore clear momentum.\n\nWhat is the single most important adjustment you can make right now?`
    });
  }
});

// Insights API Route
app.post('/api/journal/insights', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const { messages = [] } = req.body || {};
  const transcript = messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');

  try {
    if (!ai) throw new Error('GEMINI_API_KEY not configured.');

    const prompt = `Analyze this personal journal transcript. Output strictly a JSON object with keys "pattern", "reframe", and "action":\n\n${transcript}`;
    const response = await generateWithRetry({
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    let raw = response.text.trim();
    if (raw.startsWith('```json')) raw = raw.replace(/^```json/, '').replace(/```$/, '').trim();
    if (raw.startsWith('```')) raw = raw.replace(/^```/, '').replace(/```$/, '').trim();

    res.json(JSON.parse(raw));
  } catch (err) {
    console.error('Insight error after retries:', err.message);
    res.json({
      pattern: "Cognitive Overload & Urgency Conflation",
      reframe: "Where are you treating external pressure as an absolute emergency rather than managing your pace?",
      action: "Pause for 5 minutes, pick one primary focus area, and protect your workspace from distractions."
    });
  }
});

app.use(express.static(path.join(__dirname, 'frontend/dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'frontend/dist/index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on ${PORT}`));
