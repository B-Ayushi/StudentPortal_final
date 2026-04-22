/**
 * routes/auth.js
 * POST /api/auth/register  — Create new account
 * POST /api/auth/login     — Login, return JWT
 * GET  /api/auth/me        — Get current user info
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_prod';

// ── Register ─────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email and password are required' });

    const db = getDB();
    const existing = await db.prepare('SELECT email FROM users WHERE email = ?').get(email);
    if (existing)
      return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 10);
    const user_id = uuidv4();

    await db.prepare(
      'INSERT INTO users (user_id, name, email, password_hash) VALUES (?, ?, ?, ?)'
    ).run(user_id, name, email, password_hash);

    const token = jwt.sign({ user_id, email, name }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { user_id, name, email }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Login ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email and password are required' });

    const db = getDB();
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user)
      return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { user_id: user.user_id, name: user.name, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get current user ──────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  const db   = getDB();
  const user = await db.prepare('SELECT user_id, name, email, created_at FROM users WHERE user_id = ?')
                  .get(req.user.user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

module.exports = router;
