/**
 * routes/projects.js — All async for Supabase/PostgreSQL
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const { getDB } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BUCKET_NAME = 'studentsubmission';

// ── Submit project ────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { title, description, tech_stack } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Project title is required' });
    }

    const db = getDB();
    const project_id = uuidv4();

    await db.prepare(`
      INSERT INTO projects (project_id, user_id, title, description, tech_stack)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      project_id,
      req.user.user_id,
      title,
      description || '',
      tech_stack || ''
    );

    const project = await db.prepare(`
      SELECT * FROM projects WHERE project_id = ?
    `).get(project_id);

    return res.status(201).json({
      message: 'Project submitted successfully',
      project
    });
  } catch (err) {
    console.error('Create project error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── List my projects ──────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = getDB();

    const projects = await db.prepare(`
      SELECT p.*, COUNT(f.file_id) AS file_count
      FROM projects p
      LEFT JOIN files f ON p.project_id = f.project_id
      WHERE p.user_id = ?
      GROUP BY p.project_id, p.user_id, p.title, p.description,
               p.tech_stack, p.status, p.created_at
      ORDER BY p.created_at DESC
    `).all(req.user.user_id);

    return res.json({ projects });
  } catch (err) {
    console.error('List projects error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Get single project + only valid files ─────────────
router.get('/:id', async (req, res) => {
  try {
    const db = getDB();

    const project = await db.prepare(`
      SELECT * FROM projects
      WHERE project_id = ? AND user_id = ?
    `).get(req.params.id, req.user.user_id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const rawFiles = await db.prepare(`
      SELECT *
      FROM files
      WHERE project_id = ?
      ORDER BY uploaded_at DESC
    `).all(project.project_id);

    const validFiles = [];

    for (const file of rawFiles) {
      if (!file.object_name) {
        await db.prepare('DELETE FROM files WHERE file_id = ?').run(file.file_id);
        continue;
      }

      const folder = file.object_name.split('/')[0];
      const fileName = file.object_name.split('/').slice(1).join('/');

      const { data, error } = await supabase.storage
        .from(file.bucket_name || BUCKET_NAME)
        .list(folder, { search: fileName });

      if (error) {
        console.warn('Storage check failed:', error.message);
        validFiles.push(file);
        continue;
      }

      const exists = data && data.some(item => item.name === fileName);

      if (exists) {
        validFiles.push(file);
      } else {
        console.log('⚠️ Removing ghost file from DB:', file.file_id);
        await db.prepare('DELETE FROM files WHERE file_id = ?').run(file.file_id);
      }
    }

    return res.json({
      project,
      files: validFiles
    });
  } catch (err) {
    console.error('Get project error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Update project ────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { title, description, tech_stack } = req.body;
    const db = getDB();

    const project = await db.prepare(`
      SELECT * FROM projects
      WHERE project_id = ? AND user_id = ?
    `).get(req.params.id, req.user.user_id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await db.prepare(`
      UPDATE projects
      SET title = ?, description = ?, tech_stack = ?
      WHERE project_id = ?
    `).run(
      title || project.title,
      description !== undefined ? description : project.description,
      tech_stack !== undefined ? tech_stack : project.tech_stack,
      req.params.id
    );

    const updated = await db.prepare(`
      SELECT * FROM projects WHERE project_id = ?
    `).get(req.params.id);

    return res.json({
      message: 'Project updated',
      project: updated
    });
  } catch (err) {
    console.error('Update project error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Delete project + storage files ────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const db = getDB();

    const project = await db.prepare(`
      SELECT * FROM projects
      WHERE project_id = ? AND user_id = ?
    `).get(req.params.id, req.user.user_id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const files = await db.prepare(`
      SELECT object_name, bucket_name
      FROM files
      WHERE project_id = ?
    `).all(req.params.id);

    for (const file of files) {
      if (!file.object_name) continue;

      const { error } = await supabase.storage
        .from(file.bucket_name || BUCKET_NAME)
        .remove([file.object_name]);

      if (error) {
        console.warn('Storage delete warning:', error.message);
      }
    }

    await db.prepare(`
      DELETE FROM projects WHERE project_id = ?
    `).run(req.params.id);

    return res.json({
      message: 'Project and related files deleted successfully'
    });
  } catch (err) {
    console.error('Delete project error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;