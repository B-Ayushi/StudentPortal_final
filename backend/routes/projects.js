/**
 * routes/projects.js — All async for Supabase/PostgreSQL
 */

const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// ── Submit project ────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { title, description, tech_stack } = req.body;
    if (!title)
      return res.status(400).json({ error: 'Project title is required' });

    const db = getDB();
    const project_id = uuidv4();

    await db.prepare(`
      INSERT INTO projects (project_id, user_id, title, description, tech_stack)
      VALUES (?, ?, ?, ?, ?)
    `).run(project_id, req.user.user_id, title, description || '', tech_stack || '');

    const project = await db.prepare('SELECT * FROM projects WHERE project_id = ?').get(project_id);
    res.status(201).json({ message: 'Project submitted successfully', project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── List my projects ──────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const projects = await db.prepare(`
      SELECT p.*, COUNT(f.file_id) AS file_count
      FROM   projects p
      LEFT JOIN files f ON p.project_id = f.project_id
      WHERE  p.user_id = ?
      GROUP  BY p.project_id, p.user_id, p.title, p.description,
                p.tech_stack, p.status, p.created_at
      ORDER  BY p.created_at DESC
    `).all(req.user.user_id);

    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get single project ────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const db = getDB();
    const project = await db.prepare('SELECT * FROM projects WHERE project_id = ? AND user_id = ?')
                       .get(req.params.id, req.user.user_id);
    if (!project)
      return res.status(404).json({ error: 'Project not found' });

    const files = await db.prepare('SELECT * FROM files WHERE project_id = ? ORDER BY uploaded_at DESC')
                     .all(project.project_id);

    res.json({ project, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update project ────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { title, description, tech_stack } = req.body;
    const db = getDB();

    const project = await db.prepare('SELECT * FROM projects WHERE project_id = ? AND user_id = ?')
                       .get(req.params.id, req.user.user_id);
    if (!project)
      return res.status(404).json({ error: 'Project not found' });

    await db.prepare(`
      UPDATE projects SET title = ?, description = ?, tech_stack = ?
      WHERE project_id = ?
    `).run(
      title       || project.title,
      description !== undefined ? description : project.description,
      tech_stack  !== undefined ? tech_stack  : project.tech_stack,
      req.params.id
    );

    const updated = await db.prepare('SELECT * FROM projects WHERE project_id = ?').get(req.params.id);
    res.json({ message: 'Project updated', project: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete project ────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const db = getDB();
    const project = await db.prepare('SELECT * FROM projects WHERE project_id = ? AND user_id = ?')
                       .get(req.params.id, req.user.user_id);
    if (!project)
      return res.status(404).json({ error: 'Project not found' });

    await db.prepare('DELETE FROM projects WHERE project_id = ?').run(req.params.id);
    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
