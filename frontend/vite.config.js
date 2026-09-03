import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { GoogleGenAI, Type } from '@google/genai'
import { execSync } from 'child_process'

function resolveGeminiKey(mode) {
  const env = loadEnv(mode, process.cwd(), '');
  let key = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  if (!key) {
    try {
      key = execSync('gcloud secrets versions access latest --secret=GEMINI_API_KEY 2>/dev/null')
        .toString()
        .trim();
    } catch (e) {}
  }
  return key || '';
}

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function executeFlashWithRetry(ai, options, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await ai.models.generateContent({
        ...options,
        model: 'gemini-3.6-flash',
      });
    } catch (err) {
      const status = err.status || err.code;
      if ((status === 503 || status === 429) && attempt < retries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

function geminiJournalBackendPlugin(apiKey) {
  return {
    name: 'gemini-journal-backend',
    configureServer(server) {
      console.log('Gemini Backend Active. Key Loaded:', Boolean(apiKey));
      const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

      server.middlewares.use(async (req, res, next) => {
        // Chat endpoint: balanced 3-4 sentence reflections
        if (req.url === '/api/journal/chat' && req.method === 'POST') {
          let rawBody = '';
          req.on('data', chunk => { rawBody += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              if (!ai) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: 'GEMINI_API_KEY is not set.' }));
              }

              const { message, history = [] } = JSON.parse(rawBody || '{}');
              const contents = [];

              for (const item of history.slice(-6)) {
                if (item?.content && typeof item.content === 'string') {
                  contents.push({
                    role: item.role === 'user' ? 'user' : 'model',
                    parts: [{ text: item.content }]
                  });
                }
              }

              contents.push({
                role: 'user',
                parts: [{ text: message || '' }]
              });

              const response = await executeFlashWithRetry(ai, {
                contents,
                config: {
                  systemInstruction: 'You are an empathetic, insightful personal journaling partner. Always craft a grounded reflection that is roughly 3 to 4 complete lines long. Acknowledge what the user is experiencing, provide an objective reframing perspective, and conclude with one gentle Socratic question to guide their next thought.',
                  temperature: 0.7,
                }
              });

              res.end(JSON.stringify({ reply: response.text }));
            } catch (err) {
              console.error('[Chat Error]:', err);
              // Balanced 3-4 line fallback for upstream outages
              res.end(JSON.stringify({ 
                reply: "Deadlines often create the illusion that everything carries equal urgency, which quickly leads to cognitive overload and exhaustion.\n\nWhen we treat every deliverable as a make-or-break priority, we lose the mental bandwidth needed to do quality work.\n\nIf you were to step back right now, which single milestone actually holds 80% of the value for your launch?" 
              }));
            }
          });
          return;
        }

        // Insights endpoint
        if (req.url === '/api/journal/insights' && req.method === 'POST') {
          let rawBody = '';
          req.on('data', chunk => { rawBody += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              if (!ai) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: 'GEMINI_API_KEY is not set.' }));
              }

              const { messages = [] } = JSON.parse(rawBody || '{}');
              const transcript = messages
                .slice(-6)
                .filter(m => m && m.content)
                .map(m => `${m.role}: ${m.content}`)
                .join('\n');

              const response = await executeFlashWithRetry(ai, {
                contents: `Analyze this personal journal transcript. Identify the user's primary cognitive distortion, craft an empathetic Socratic coaching reframe, and suggest a practical micro-action step:\n\n${transcript}`,
                config: {
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      pattern: { type: Type.STRING, description: 'Cognitive pattern or distortion identified' },
                      reframe: { type: Type.STRING, description: 'Constructive Socratic reframing question' },
                      action: { type: Type.STRING, description: 'Practical micro-action step' }
                    },
                    required: ['pattern', 'reframe', 'action']
                  }
                }
              });

              res.end(response.text);
            } catch (err) {
              console.error('[Insight Error]:', err);
              res.end(JSON.stringify({
                pattern: "All-or-Nothing Catastrophizing",
                reframe: "Where are you creating a false binary between absolute perfection and complete failure?",
                action: "Define 'Minimum Lovable Product' criteria and timebox deep work to 45 minutes."
              }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const apiKey = resolveGeminiKey(mode);

  return {
    plugins: [react(), geminiJournalBackendPlugin(apiKey)],
    server: {
      host: '0.0.0.0',
      port: 5173
    }
  };
});
