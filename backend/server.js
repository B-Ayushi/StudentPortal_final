/**
 * server.js — Main Express Application
 * Hosted on: Render (Web Service)
 * Database:  Supabase PostgreSQL
 * Storage:   Supabase Storage
 *
 * Routes:
 *   POST /api/auth/register  → Register new user
 *   POST /api/auth/login     → Login, get JWT token
 *   POST /api/projects       → Submit project (auth required)
 *   GET  /api/projects       → Get my submissions (auth required)
 *   GET  /api/projects/:id   → Get single project (auth required)
 *   POST /api/files/upload   → Upload file to Supabase Storage
 *   GET  /api/files/:projectId → List files for project
 *   GET  /api/health         → Health check (for Render)
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');

const { initDB }       = require('./db/database');
const authRoutes       = require('./routes/auth');
const projectRoutes    = require('./routes/projects');
const fileRoutes       = require('./routes/files');

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── API Routes ──────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/files',    fileRoutes);

// ─── Health Check (for Render health probe) ──────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'student-portal-backend',
    environment: process.env.NODE_ENV || 'development',
    database: 'Supabase PostgreSQL',
    storage: 'Supabase Storage'
  });
});

// ─── Catch-all: serve frontend index.html ────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── Error handler ───────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// ─── Initialize DB then Start Server ─────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Student Portal running on http://localhost:${PORT}`);
      console.log(`   ENV     : ${process.env.NODE_ENV || 'development'}`);
      console.log(`   DATABASE: Supabase PostgreSQL`);
      console.log(`   STORAGE : Supabase Storage\n`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to connect to database:', err.message);
    process.exit(1);
  });

module.exports = app;

