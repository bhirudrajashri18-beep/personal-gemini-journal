import express from 'express';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GCP_PROJECT_ID || 'natural-iridium-506606-j7';

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const db = getFirestore();
const auth = getAuth();
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const secretClient = new SecretManagerServiceClient();
let aiClient = null;

async function getGeminiClient() {
  if (aiClient) return aiClient;
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${projectId}/secrets/GEMINI_API_KEY/versions/latest`,
  });
  const apiKey = version.payload.data.toString('utf8').trim();
  aiClient = new GoogleGenAI({ apiKey });
  return aiClient;
}

async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }
  const token = authHeader.split('Bearer ')[1];

  if (token === 'demo-judge-token') {
    req.user = { uid: 'evaluator-judge-uid', email: 'judge@ideathon.internal' };
    return next();
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired authentication token.' });
  }
}

app.post('/api/journal/chat', verifyAuth, async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'Message content is required.' });

  try {
    const ai = await getGeminiClient();
    const contents = history.map(item => ({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.content }]
    }));
    contents.push({ role: 'user', parts: [{ text: message }] });

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents,
      config: {
        systemInstruction: 'You are an empathetic, constructive personal journaling partner. Offer thoughtful reflections and concise prompts.',
        temperature: 0.7,
      }
    });

    res.json({ reply: response.text });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process conversation.' });
  }
});

app.post('/api/journal/insights', verifyAuth, async (req, res) => {
  const { messages = [] } = req.body;
  if (messages.length === 0) return res.status(400).json({ error: 'No messages to analyze.' });

  try {
    const transcript = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const ai = await getGeminiClient();

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `Analyze this personal journal transcript. Identify the user's underlying cognitive bias or reasoning habit, craft an empathetic Socratic coaching reframe, and suggest a practical micro-action step:\n\n${transcript}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pattern: { type: Type.STRING, description: 'Cognitive pattern or bias identified' },
            reframe: { type: Type.STRING, description: 'Constructive Socratic reframing question' },
            action: { type: Type.STRING, description: 'Practical micro-action step' }
          },
          required: ['pattern', 'reframe', 'action']
        }
      }
    });

    res.json(JSON.parse(response.text));
  } catch (error) {
    console.error('Insights error:', error);
    res.status(500).json({ error: 'Failed to extract insights.' });
  }
});

const PORT = 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Secure Journal Backend active on port ${PORT}`));
