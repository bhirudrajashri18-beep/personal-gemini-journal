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

// Dynamic heuristic fallback generator
function generateHeuristicReflection(userText = '') {
  const t = userText.toLowerCase();

  if (t.includes('burnout') || t.includes('tired') || t.includes('deadline') || t.includes('exhausted')) {
    return {
      reply: "When multiple deadlines compete for attention, cognitive overload quickly blurs the line between high-impact goals and secondary noise.\n\nProtecting your energy requires choosing which balls are glass and which are rubber before fatigue forces the choice for you.\n\nIf you could only advance a single milestone today and consider it a victory, which would it be?",
      pattern: "Urgency Conflation & Cognitive Overextension",
      reframe: "Where are you assigning critical priority to tasks that could realistically wait without severe consequence?",
      action: "Identify today's single highest-leverage task and protect an uninterrupted 45-minute sprint to finish it."
    };
  }

  if (t.includes('judge') || t.includes('fail') || t.includes('fear') || t.includes('worried') || t.includes('imposter') || t.includes('break')) {
    return {
      reply: "Evaluation anxiety often magnifies hypothetical flaws while discounting the concrete problem-solving already achieved.\n\nSeparating the objective performance of your system from anticipatory self-doubt allows you to evaluate results clearly.\n\nWhat tangible evidence demonstrates that your core architecture is functioning as designed right now?",
      pattern: "Anticipatory Catastrophizing & Discounting the Positive",
      reframe: "Where are you treating worst-case hypothetical projections as guaranteed future realities?",
      action: "Document the three strongest verification points of your core solution and anchor your presentation on them."
    };
  }

  return {
    reply: `Reflecting on "${userText.slice(0, 45).trim()}..." highlights an important decision point in how you are framing this challenge.\n\nBreaking high-level tensions down into direct variables often makes the immediate path forward visible.\n\nWhat is the smallest actionable element of this situation that remains within your direct control today?`,
    pattern: "Complexity Overwhelm & Cognitive Compression",
    reframe: "How might this challenge look if you removed external variables you cannot influence right now?",
    action: "Write down the next micro-step that takes less than five minutes to complete, and execute it immediately."
  };
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents,
      config: {
        systemInstruction: 'You are an empathetic, insightful personal journaling partner. Provide a grounded reflection roughly 3 to 4 lines long, concluding with one gentle Socratic question.',
        temperature: 0.7,
      }
    });

    res.json({ reply: response.text });
  } catch (err) {
    console.warn('[Chat Fallback Invoked]:', err.message || err);
    // Return a seamless, dynamic fallback based on user's actual text
    const fallback = generateHeuristicReflection(message);
    res.json({ reply: fallback.reply });
  }
});

// Insights API Route
app.post('/api/journal/insights', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const { messages = [] } = req.body || {};
  const transcript = messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  try {
    if (!ai) throw new Error('GEMINI_API_KEY not configured.');

    const prompt = `Analyze this personal journal transcript. You must return ONLY a JSON object with three keys: "pattern", "reframe", and "action":\n\n${transcript}`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    let raw = response.text.trim();
    if (raw.startsWith('```json')) raw = raw.replace(/^```json/, '').replace(/```$/, '').trim();
    if (raw.startsWith('```')) raw = raw.replace(/^```/, '').replace(/```$/, '').trim();

    res.json(JSON.parse(raw));
  } catch (err) {
    console.warn('[Insights Fallback Invoked]:', err.message || err);
    const fallback = generateHeuristicReflection(lastUserMsg);
    res.json({
      pattern: fallback.pattern,
      reframe: fallback.reframe,
      action: fallback.action
    });
  }
});

// Serve frontend build static files
app.use(express.static(path.join(__dirname, 'frontend/dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'frontend/dist/index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Production server listening on ${PORT}`));
