import express from 'express';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import admin from 'firebase-admin';

// Initialize Firebase Admin using Application Default Credentials
admin.initializeApp({
  projectId: process.env.GCP_PROJECT_ID,
});
const db = admin.firestore();
const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

const secretClient = new SecretManagerServiceClient();
let aiClient = null;

// Fetch Gemini API key securely from Secret Manager
async function getGeminiClient() {
  if (aiClient) return aiClient;
  const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${projectId}/secrets/GEMINI_API_KEY/versions/latest`,
  });
  const apiKey = version.payload.data.toString('utf8').trim();
  aiClient = new GoogleGenAI({ apiKey });
  return aiClient;
}

// Authentication Middleware: Enforces verified Firebase ID tokens
async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired authentication token.' });
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Multi-turn Journaling Chat Endpoint
app.post('/api/journal/chat', verifyAuth, async (req, res) => {
  const { message, history = [], journalId } = req.body;
  const uid = req.user.uid;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message content is required.' });
  }

  try {
    const ai = await getGeminiClient();
    
    const formattedContents = history.map(item => ({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.content }]
    }));
    formattedContents.push({ role: 'user', parts: [{ text: message }] });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: formattedContents,
      config: {
        systemInstruction: 'You are an empathetic, constructive personal journaling assistant and thought partner. Help the user explore their ideas, emotions, and decisions.',
        temperature: 0.7,
      }
    });

    const reply = response.text;

    // Persist conversation update under the isolated path
    const journalRef = db.collection('users').doc(uid).collection('journals').doc(journalId);
    await journalRef.set({
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      messages: admin.firestore.FieldValue.arrayUnion(
        { role: 'user', content: message, timestamp: new Date().toISOString() },
        { role: 'assistant', content: reply, timestamp: new Date().toISOString() }
      )
    }, { merge: true });

    res.json({ reply });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process journal conversation.' });
  }
});

// Auto-Summary & Action Items Endpoint
app.post('/api/journal/summarize', verifyAuth, async (req, res) => {
  const { journalId } = req.body;
  const uid = req.user.uid;

  try {
    const journalRef = db.collection('users').doc(uid).collection('journals').doc(journalId);
    const doc = await journalRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Journal entry not found.' });
    }

    const messages = doc.data().messages || [];
    const conversationTranscript = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    const ai = await getGeminiClient();
    const summaryResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Summarize the following journal session into:
1. A concise 2-sentence summary.
2. 3 actionable bullet takeaways.
3. Dominant emotional tone.

Transcript:
${conversationTranscript}`,
    });

    const summaryText = summaryResponse.text;

    await journalRef.update({
      summary: summaryText,
      summarizedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ summary: summaryText });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ error: 'Failed to generate summary.' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Secure Journal Backend active on port ${PORT}`));
