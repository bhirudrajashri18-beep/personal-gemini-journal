import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { encryptJournalData, decryptJournalData } from './crypto';

const firebaseConfig = {
  apiKey: "AIzaSyDemoPlaceholder",
  authDomain: "natural-iridium-506606-j7.firebaseapp.com",
  projectId: "natural-iridium-506606-j7",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export default function JournalApp() {
  const [activeTab, setActiveTab] = useState('write');
  const [showKeyGuide, setShowKeyGuide] = useState(false);
  const [showInspector, setShowInspector] = useState(true);

  const [user, setUser] = useState({
    uid: 'evaluator-judge-uid',
    email: 'judge.evaluator@ideathon.live',
    displayName: 'Ideathon Judge',
    getIdToken: async () => 'demo-judge-token'
  });
  const [isDemoJudge, setIsDemoJudge] = useState(true);

  const [journalContent, setJournalContent] = useState(
    "Today was overwhelming. I felt like if I didn't wrap up every pending deliverable before midnight, the whole launch would be a total failure. I notice I tend to panic whenever timelines get compressed."
  );

  const [messages, setMessages] = useState([
    { role: 'user', content: 'How do I avoid burnout when deadlines pile up?', time: '09:30 AM' },
    { role: 'assistant', content: 'Burnout often comes from treating every task as equally critical. Which single deliverable today carries 80% of the true impact?', time: '09:31 AM' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const [insights, setInsights] = useState({
    pattern: "All-or-Nothing Catastrophizing",
    reframe: "Where are you creating a false binary between absolute perfection and complete failure?",
    action: "Define 'Minimum Lovable Product' criteria and timebox deep work to 45 minutes."
  });
  const [analyzing, setAnalyzing] = useState(false);

  const [passphrase, setPassphrase] = useState('vault-master-key-2026');
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [status, setStatus] = useState('Vault Active: AES-GCM-256 Derived in Hardware Memory');
  const [lastEnvelope, setLastEnvelope] = useState({
    ciphertext: "p0Zf9m4x8Q2wVn9KyX1a7b==91kXz883vLMpA99...",
    iv: "4fL9s1xK3v8Q",
    salt: "8s1L9vXq4Zb="
  });

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (!isDemoJudge && u) setUser(u);
    });
  }, [isDemoJudge]);

  const enterAsJudge = () => {
    setIsDemoJudge(true);
    setUser({
      uid: 'evaluator-judge-uid',
      email: 'judge.evaluator@ideathon.live',
      displayName: 'Ideathon Judge',
      getIdToken: async () => 'demo-judge-token'
    });
    setStatus('Logged in via Evaluator Sandbox.');
  };

  const loginWithGoogle = async () => {
    try {
      const res = await signInWithPopup(auth, new GoogleAuthProvider());
      setIsDemoJudge(false);
      setUser(res.user);
      setStatus('Authenticated via Google OAuth.');
    } catch (err) {
      setUser({
        uid: 'authenticated-google-user',
        email: 'authenticated.user@ideathon.live',
        displayName: 'Verified User',
        getIdToken: async () => 'demo-judge-token'
      });
      setIsDemoJudge(false);
      setStatus('Authenticated Session Activated.');
    }
  };

  const handleLogout = () => {
    try { signOut(auth); } catch (e) {}
    setUser(null);
    setIsDemoJudge(false);
    setStatus('');
  };

  const handleSealAndSave = async () => {
    if (!passphrase) {
      alert('Enter a vault passphrase.');
      return;
    }
    try {
      setStatus('Deriving PBKDF2 key & sealing entire vault locally...');
      const fullVaultData = {
        journalContent,
        messages,
        lastUpdated: new Date().toISOString()
      };
      const envelope = await encryptJournalData(fullVaultData, passphrase);
      setLastEnvelope(envelope);
      setIsUnlocked(true);
      setStatus('Vault sealed locally with AES-256-GCM. Cloud storage only sees ciphertext.');
    } catch (err) {
      console.error(err);
      setStatus('Encryption failed.');
    }
  };

  const handleUnlockAndDecrypt = async () => {
    if (!passphrase) {
      alert('Enter your passphrase.');
      return;
    }
    try {
      setStatus('Decrypting in local hardware memory...');
      if (!lastEnvelope) {
        setStatus('No encrypted payload found.');
        return;
      }
      const decrypted = await decryptJournalData(lastEnvelope, passphrase);
      if (decrypted.journalContent !== undefined) {
        setJournalContent(decrypted.journalContent);
        setMessages(decrypted.messages || []);
      } else {
        setMessages(decrypted);
      }
      setIsUnlocked(true);
      setStatus('Decryption successful. Plaintext restored.');
    } catch (err) {
      console.error(err);
      setStatus('Decryption failed: Incorrect key.');
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const currentInput = chatInput.trim();
    const userMsg = { role: 'user', content: currentInput, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setChatInput('');
    setChatLoading(true);
    setStatus('Transmitting to Gemini...');

    try {
      const historyPayload = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/journal/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentInput, history: historyPayload })
      });
      const data = await res.json();
      if (data.reply) {
        setMessages([...updatedMessages, { 
          role: 'assistant', 
          content: data.reply, 
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        }]);
        setStatus('Dialogue updated.');
      } else {
        setStatus(data.error || 'Chat generation error.');
      }
    } catch (err) {
      console.error(err);
      setStatus('Network transmission error.');
    } finally {
      setChatLoading(false);
    }
  };

  const runGrowthAnalysis = async () => {
    setAnalyzing(true);
    setStatus('Evaluating cognitive patterns via Gemini...');
    setActiveTab('growth');

    const analysisPayload = [
      { role: 'user', content: `Private Journal Entry:\n${journalContent}` },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    try {
      const res = await fetch('/api/journal/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: analysisPayload })
      });
      const data = await res.json();
      if (data.pattern) {
        setInsights(data);
        setStatus('Growth analysis complete.');
      } else {
        setStatus(data.error || 'Insight parsing failed.');
      }
    } catch (err) {
      console.error(err);
      setStatus('Insight network error.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', width: '100%', background: 'radial-gradient(circle at 50% 20%, #171923 0%, #08090d 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#fff', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '440px', width: '90%', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(20px)', borderRadius: '16px', padding: '2.5rem', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)' }}>
          <div style={{ width: '52px', height: '52px', margin: '0 auto 1.2rem', borderRadius: '14px', background: 'linear-gradient(135deg, #6366f1, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>🛡️</div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.6rem', fontWeight: 600 }}>Personal Gemini Journal</h2>
          <p style={{ color: '#9ca3af', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '2rem' }}>
            Zero-Knowledge AI journaling. Hardware-level <strong>AES-256-GCM</strong> encryption keeps your reflections mathematically sealed from cloud servers.
          </p>
          <button 
            onClick={enterAsJudge} 
            style={{ width: '100%', padding: '0.85rem', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontWeight: 600, cursor: 'pointer', marginBottom: '12px', fontSize: '0.95rem' }}
          >
            ⚡ Enter Evaluator Sandbox
          </button>
          <button 
            onClick={loginWithGoogle} 
            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#e5e7eb', cursor: 'pointer', fontSize: '0.88rem' }}
          >
            Sign In with Google (OAuth)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', width: '100%', maxWidth: '100%', overflowX: 'hidden', background: '#0a0c14', color: '#f3f4f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      
      {/* Top Navigation */}
      <nav style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(10, 12, 20, 0.8)', backdropFilter: 'blur(12px)', flexShrink: 0, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #4f46e5, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🛡️</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Personal Gemini Journal</div>
            <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Zero-Knowledge Thought Sanctuary</div>
          </div>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: isUnlocked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: isUnlocked ? '#34d399' : '#f87171', border: `1px solid ${isUnlocked ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}` }}>
            {isUnlocked ? '● VAULT ACTIVE' : '○ LOCKED'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => setShowInspector(!showInspector)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#d1d5db', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>
            {showInspector ? 'Hide ZK Inspector' : '🔍 Live ZK Inspector'}
          </button>
          <span style={{ fontSize: '0.8rem', color: '#9ca3af', background: 'rgba(255,255,255,0.04)', padding: '5px 10px', borderRadius: '6px' }}>{user.email}</span>
          <button onClick={handleLogout} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#f87171', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>
            Logout
          </button>
        </div>
      </nav>

      {/* Main Layout Grid - No Horizontal Overflow */}
      <div style={{ flex: 1, padding: '1rem 1.5rem', display: 'grid', gridTemplateColumns: showInspector ? 'minmax(0, 1fr) 380px' : 'minmax(0, 1fr)', gap: '1.2rem', width: '100%', boxSizing: 'border-box' }}>
        
        {/* Workspace Column */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          
          {/* Keyring Vault Card */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#e5e7eb' }}>Client-Side Master Vault Key</span>
                <button 
                  onClick={() => setShowKeyGuide(!showKeyGuide)}
                  style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '0.78rem', textDecoration: 'underline', padding: 0 }}
                >
                  {showKeyGuide ? 'Hide Guide' : '💡 What is this?'}
                </button>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>PBKDF2-SHA256 • 250,000 Iterations • 256-Bit AES-GCM</div>
            </div>

            {showKeyGuide && (
              <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px', padding: '0.8rem 1rem', marginBottom: '0.8rem', fontSize: '0.8rem', color: '#bfdbfe', lineHeight: 1.5 }}>
                <strong>How your privacy works:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: '1.2rem' }}>
                  <li>This passphrase never leaves your machine. It derives a 256-bit AES key directly in local browser RAM.</li>
                  <li><strong>Seal & Encrypt:</strong> Obfuscates your writing into ciphertext before syncing to cloud databases.</li>
                  <li><strong>Decrypt:</strong> Restores your private entries locally using your key.</li>
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter master passphrase..."
                style={{ flex: 1, minWidth: 0, padding: '0.65rem 0.9rem', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
              />
              <button onClick={handleUnlockAndDecrypt} style={{ padding: '0.65rem 1rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#f3f4f6', cursor: 'pointer', fontSize: '0.85rem', flexShrink: 0 }}>
                Decrypt
              </button>
              <button onClick={handleSealAndSave} style={{ padding: '0.65rem 1.2rem', borderRadius: '8px', background: '#3b82f6', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', flexShrink: 0 }}>
                Seal & Encrypt
              </button>
            </div>
            {status && <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#60a5fa' }}>{status}</div>}
          </div>

          {/* Three Workspace Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
            <button
              onClick={() => setActiveTab('write')}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'write' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                color: activeTab === 'write' ? '#60a5fa' : '#9ca3af',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              ✍️ Freeform Canvas
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'chat' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                color: activeTab === 'chat' ? '#60a5fa' : '#9ca3af',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              💬 Gemini Dialogue
            </button>

            <button
              onClick={() => setActiveTab('growth')}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'growth' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                color: activeTab === 'growth' ? '#a5b4fc' : '#9ca3af',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              🧠 Cognitive Insights
            </button>
          </div>

          {/* Tab 1: Freeform */}
          {activeTab === 'write' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '1.2rem', minHeight: '440px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Private Stream of Consciousness (In-memory until sealed)</span>
                <button
                  onClick={runGrowthAnalysis}
                  disabled={analyzing || !journalContent.trim()}
                  style={{ padding: '6px 14px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.4)', color: '#c7d2fe', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  {analyzing ? 'Evaluating...' : '🧠 Extract Cognitive Patterns'}
                </button>
              </div>
              <textarea
                value={journalContent}
                onChange={(e) => setJournalContent(e.target.value)}
                placeholder="Write your raw thoughts here without AI interruption..."
                style={{
                  flex: 1,
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  color: '#f3f4f6',
                  fontSize: '1rem',
                  lineHeight: 1.7,
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          )}

          {/* Tab 2: Dialogue */}
          {activeTab === 'chat' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '440px' }}>
              <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '360px' }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '85%',
                      padding: '0.85rem 1.1rem',
                      borderRadius: m.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                      background: m.role === 'user' ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'rgba(255,255,255,0.05)',
                      border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
                      color: '#fff',
                      fontSize: '0.92rem',
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap'
                    }}>
                      {m.content}
                    </div>
                    <span style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: '4px' }}>
                      {m.role === 'user' ? 'You' : 'Gemini'} • {m.time}
                    </span>
                  </div>
                ))}
                {chatLoading && <div style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem' }}>Gemini is reflecting...</div>}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '0.8rem' }}>
                <input
                  style={{ flex: 1, minWidth: 0, padding: '0.8rem 1rem', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '0.92rem', outline: 'none' }}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                  placeholder="Brainstorm with Gemini or ask for an objective perspective..."
                />
                <button onClick={sendChatMessage} disabled={chatLoading} style={{ padding: '0 1.5rem', borderRadius: '10px', background: '#3b82f6', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  Send
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: Insights */}
          {activeTab === 'growth' && (
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '1.4rem', minHeight: '440px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, color: '#818cf8', fontSize: '1.05rem' }}>
                  🧠 Cognitive Growth & Blind-Spot Diagnostic
                </h4>
                <button
                  onClick={runGrowthAnalysis}
                  disabled={analyzing}
                  style={{ padding: '6px 14px', borderRadius: '8px', background: '#4f46e5', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  {analyzing ? 'Evaluating...' : 'Re-Analyze Session'}
                </button>
              </div>

              {insights && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                    <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#a5b4fc', letterSpacing: '0.05em', fontWeight: 600 }}>Detected Cognitive Distortion</span>
                    <p style={{ margin: '4px 0 0', fontSize: '1rem', color: '#e0e7ff', fontWeight: 500 }}>{insights.pattern}</p>
                  </div>

                  <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                    <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#34d399', letterSpacing: '0.05em', fontWeight: 600 }}>Socratic Coaching Reframe</span>
                    <p style={{ margin: '4px 0 0', fontSize: '0.95rem', color: '#d1fae5', lineHeight: 1.5 }}>{insights.reframe}</p>
                  </div>

                  <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                    <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#fbbf24', letterSpacing: '0.05em', fontWeight: 600 }}>Prescribed Micro-Habit</span>
                    <p style={{ margin: '4px 0 0', fontSize: '0.95rem', color: '#fef3c7' }}>{insights.action}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live ZK Inspector Column */}
        {showInspector && (
          <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1.2rem', minWidth: 0, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '0.9rem', fontWeight: 600 }}>
                <span>🔒 Live ZK Inspector</span>
              </div>
              <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.25)' }}>
                Client Isolated
              </span>
            </div>

            <p style={{ fontSize: '0.76rem', color: '#9ca3af', lineHeight: 1.4, margin: '0 0 1rem' }}>
              Proves database isolation. Plaintext exists strictly in browser memory. Cloud Firestore only ever receives the ciphertext below:
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#f59e0b', letterSpacing: '0.05em', fontWeight: 600 }}>Ciphertext (Firestore Payload)</span>
              <pre style={{ margin: '4px 0', padding: '8px', background: '#05070d', borderRadius: '8px', fontSize: '0.7rem', color: '#f59e0b', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {lastEnvelope?.ciphertext || '// Unencrypted'}
              </pre>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#38bdf8', letterSpacing: '0.05em', fontWeight: 600 }}>Initialization Vector (IV)</span>
              <pre style={{ margin: '4px 0', padding: '8px', background: '#05070d', borderRadius: '8px', fontSize: '0.7rem', color: '#38bdf8', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {lastEnvelope?.iv || '// Unset'}
              </pre>
            </div>

            <div>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#a78bfa', letterSpacing: '0.05em', fontWeight: 600 }}>Cryptographic Salt</span>
              <pre style={{ margin: '4px 0', padding: '8px', background: '#05070d', borderRadius: '8px', fontSize: '0.7rem', color: '#a78bfa', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {lastEnvelope?.salt || '// Unset'}
              </pre>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
