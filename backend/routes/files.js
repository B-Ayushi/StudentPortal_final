/**
 * routes/files.js
 * POST /api/files/upload/:projectId  — Upload file to Supabase Storage
 * GET  /api/files/:projectId         — List files for a project
 * DELETE /api/files/:fileId          — Delete a file
 *
 * Uses Supabase Storage for file hosting (replaces OCI Object Storage).
 * Files are uploaded to the 'project-files' bucket in Supabase.
 */

const express = require('express');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const { createClient } = require('@supabase/supabase-js');
const { getDB } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// ── Supabase Storage Client ───────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // Use SERVICE key for server-side uploads
);
const BUCKET_NAME = 'studentsubmission';

// ── Multer (memory storage — we'll pass buffer to Supabase) ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },   // 20 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'image/png', 'image/jpeg', 'image/gif',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed. Upload PDF, ZIP, image, or document files.'));
  }
});

// ── Upload file to Supabase Storage ──────────────────
router.post('/upload/:projectId', upload.single('file'), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: 'No file provided' });

    const db = getDB();

    // Verify project belongs to user
    const project = await db.prepare('SELECT * FROM projects WHERE project_id = ? AND user_id = ?')
                       .get(req.params.projectId, req.user.user_id);
    if (!project)
      return res.status(404).json({ error: 'Project not found or access denied' });

    // Generate a unique filename
    const ext         = path.extname(req.file.originalname);
    const object_name = `${req.params.projectId}/${uuidv4()}${ext}`;

    // Upload to Supabase Storage bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(object_name, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) throw new Error(`Supabase upload failed: ${uploadError.message}`);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(object_name);

    const file_url = urlData.publicUrl;
    const file_id  = uuidv4();

    // Save file record to database
    await db.prepare(`
      INSERT INTO files (file_id, project_id, original_name, object_name, bucket_name, file_url, file_size, mime_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      file_id,
      req.params.projectId,
      req.file.originalname,
      object_name,
      BUCKET_NAME,
      file_url,
      req.file.size,
      req.file.mimetype
    );

    const fileRecord = await db.prepare('SELECT * FROM files WHERE file_id = ?').get(file_id);
    res.status(201).json({
      message: 'File uploaded successfully to Supabase Storage',
      file: fileRecord,
      url: file_url
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── List files for project ────────────────────────────
router.get('/:projectId', async (req, res) => {
  try {
    const db = getDB();
    const project = await db.prepare('SELECT * FROM projects WHERE project_id = ? AND user_id = ?')
                       .get(req.params.projectId, req.user.user_id);
    if (!project)
      return res.status(404).json({ error: 'Project not found' });

    const files = await db.prepare('SELECT * FROM files WHERE project_id = ? ORDER BY uploaded_at DESC')
                     .all(req.params.projectId);

    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete file ────────────────────────────────────────
router.delete('/:fileId', async (req, res) => {
  try {
    const db = getDB();

    const file = await db.prepare(`
      SELECT f.* FROM files f
      JOIN projects p ON f.project_id = p.project_id
      WHERE f.file_id = ? AND p.user_id = ?
    `).get(req.params.fileId, req.user.user_id);

    if (!file) return res.status(404).json({ error: 'File not found' });

    const bucket = file.bucket_name || 'studentsubmission';
    console.log('=== Starting Supabase Storage deletion ===');
    console.log('file_id:', req.params.fileId);
    console.log('bucket_name:', bucket);
    console.log('object_name:', file.object_name);
    console.log('file_url:', file.file_url);

    let deleteResult = null;
    let deletedPath = null;

    // ─ Try deleting with object_name ─
    const { data: deleteData, error: deleteError } = await supabase.storage
      .from(bucket)
      .remove([file.object_name]);

    console.log('First delete attempt (object_name):', { data: deleteData, error: deleteError });

    if (deleteError) {
      console.error('Error during first deletion:', deleteError.message);
      return res.status(500).json({
        error: `Supabase storage delete failed: ${deleteError.message}`
      });
    }

    // Check if deletion succeeded
    if (deleteData && deleteData.length > 0) {
      deleteResult = deleteData;
      deletedPath = file.object_name;
      console.log('Successfully deleted using object_name');
    } else {
      // ─ Fallback: extract path from file_url ─
      console.log('object_name deletion returned empty, attempting fallback from file_url...');
      
      let extractedPath = null;
      if (file.file_url) {
        // Extract path after '/object/public/studentsubmission/'
        const urlPattern = /\/object\/public\/[^/]+\/(.+)$/;
        const match = file.file_url.match(urlPattern);
        if (match) {
          extractedPath = match[1];
          console.log('extracted_path_from_url:', extractedPath);

          const { data: fallbackData, error: fallbackError } = await supabase.storage
            .from(bucket)
            .remove([extractedPath]);

          console.log('Second delete attempt (extracted path):', { data: fallbackData, error: fallbackError });

          if (fallbackError) {
            console.error('Error during fallback deletion:', fallbackError.message);
            return res.status(500).json({
              error: `Supabase storage delete failed during fallback: ${fallbackError.message}`
            });
          }

          if (fallbackData && fallbackData.length > 0) {
            deleteResult = fallbackData;
            deletedPath = extractedPath;
            console.log('Successfully deleted using extracted path from URL');
          }
        }
      }

      // If still nothing deleted, return error
      if (!deleteResult || deleteResult.length === 0) {
        console.error('Path mismatch: No object was deleted from Supabase Storage');
        return res.status(500).json({
          error: 'Storage path mismatch: Could not delete file from Supabase Storage. Tried both object_name and extracted path from URL.',
          tried_object_name: file.object_name,
          tried_extracted_path: extractedPath || 'could not extract from URL'
        });
      }
    }

    console.log('Supabase Storage deletion successful');
    console.log('deleted_path:', deletedPath);

    // Only delete database row after successful Supabase deletion
    await db.prepare('DELETE FROM files WHERE file_id = ?').run(req.params.fileId);

    res.json({
      message: 'File deleted from Supabase Storage and database',
      deleted_path: deletedPath,
      result: deleteResult
    });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;