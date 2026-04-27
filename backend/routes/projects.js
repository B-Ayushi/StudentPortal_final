/**
 * routes/projects.js — All async for Supabase/PostgreSQL
 */
// ── Delete project ────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

 const rawFiles = await db.prepare(`
  SELECT * FROM files WHERE project_id = ? ORDER BY uploaded_at DESC
`).all(project.project_id);

const validFiles = [];

for (const f of rawFiles) {
  const path = f.object_name;

  const { data } = await supabase.storage
    .from(f.bucket_name || 'studentsubmission')
    .list(path.split('/')[0], { search: path.split('/')[1] });

  const exists = data && data.length > 0;

  if (exists) {
    validFiles.push(f);
  } else {
    console.log('⚠️ Removing ghost file from DB:', f.file_id);

    // optional auto-clean
    await db.prepare('DELETE FROM files WHERE file_id = ?').run(f.file_id);
  }
}

res.json({ project, files: validFiles });

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

    // 1. Get project
    const project = await db.prepare(
      'SELECT * FROM projects WHERE project_id = ? AND user_id = ?'
    ).get(req.params.id, req.user.user_id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // 2. Get ALL files for this project
    const files = await db.prepare(
      'SELECT object_name FROM files WHERE project_id = ?'
    ).all(req.params.id);

    // 3. Delete files from Supabase bucket
    const filePaths = files.map(f => f.object_name);

    if (filePaths.length > 0) {
      const { error } = await supabase.storage
        .from('project-files')
        .remove(filePaths);

      if (error) {
        console.warn('Storage delete error:', error.message);
      }
    }

    // 4. Delete project (this will delete DB file records via CASCADE)
    await db.prepare(
      'DELETE FROM projects WHERE project_id = ?'
    ).run(req.params.id);

    res.json({ message: 'Project and files deleted successfully' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
