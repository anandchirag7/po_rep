import express from 'express';
import cors from 'cors';
import db from './db.js';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// --- SESSIONS ---
app.get('/api/sessions/:userId', (req, res) => {
  const { userId } = req.params;
  try {
    const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

app.post('/api/sessions', (req, res) => {
  const { id, title, user_id, cost_center } = req.body;
  try {
    db.prepare('INSERT INTO sessions (id, title, user_id, cost_center) VALUES (?, ?, ?, ?)')
      .run(id, title, user_id, cost_center);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.delete('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  try {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

app.patch('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { title } = req.body;
  try {
    db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, sessionId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// --- MESSAGES ---
app.get('/api/messages/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  try {
    const messages = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/messages', (req, res) => {
  const { id, session_id, role, content } = req.body;
  try {
    db.prepare(`
      INSERT INTO messages (id, session_id, role, content) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET content=excluded.content
    `).run(id, session_id, role, content);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// --- FEEDBACK ---
app.post('/api/feedback', (req, res) => {
  const { message_id, is_positive, comment } = req.body;
  try {
    db.prepare('INSERT INTO feedback (message_id, is_positive, comment) VALUES (?, ?, ?)')
      .run(message_id, is_positive ? 1 : 0, comment || null);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

// --- LOGGING ---
app.post('/api/logs', (req, res) => {
  const { user_id, action, details } = req.body;
  try {
    db.prepare('INSERT INTO usage_logs (user_id, action, details) VALUES (?, ?, ?)')
      .run(user_id, action, JSON.stringify(details));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log usage' });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
