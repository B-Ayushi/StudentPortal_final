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
    console.log('\n\n════════════════════════════════════════');
    console.log('🗑  DELETING FILE FROM SUPABASE STORAGE');
    console.log('════════════════════════════════════════');
    console.log('file_id:', req.params.fileId);
    console.log('bucket_name:', bucket);
    console.log('object_name from DB:', file.object_name);
    console.log('file_url from DB:', file.file_url);

    let deleteResult = null;
    let deletedPath = null;
    let storageDeleteFailed = false;

    // ─ Try deleting with object_name ─
    console.log('\n→ Attempting deletion with object_name...');
    const { data: deleteData, error: deleteError } = await supabase.storage
      .from(bucket)
      .remove([file.object_name]);

    console.log('Response from Supabase storage.remove():', {
      data: deleteData,
      error: deleteError ? deleteError.message : null,
      success: !deleteError && deleteData && deleteData.length > 0
    });

    if (deleteError) {
      console.error('❌ ERROR during storage deletion:', deleteError.message);
      storageDeleteFailed = true;
    } else if (deleteData && deleteData.length > 0) {
      deleteResult = deleteData;
      deletedPath = file.object_name;
      console.log('✅ Successfully deleted using object_name');
    } else {
      // ─ Fallback: extract path from file_url ─
      console.log('\n→ object_name deletion returned empty array, trying fallback...');
      
      let extractedPath = null;
      if (file.file_url) {
        const urlPattern = /\/object\/public\/[^/]+\/(.+)$/;
        const match = file.file_url.match(urlPattern);
        if (match) {
          extractedPath = match[1];
          console.log('Extracted path from URL:', extractedPath);

          console.log('→ Attempting deletion with extracted path...');
          const { data: fallbackData, error: fallbackError } = await supabase.storage
            .from(bucket)
            .remove([extractedPath]);

          console.log('Response from Supabase storage.remove() [fallback]:', {
            data: fallbackData,
            error: fallbackError ? fallbackError.message : null,
            success: !fallbackError && fallbackData && fallbackData.length > 0
          });

          if (fallbackError) {
            console.error('❌ ERROR during fallback deletion:', fallbackError.message);
            storageDeleteFailed = true;
          } else if (fallbackData && fallbackData.length > 0) {
            deleteResult = fallbackData;
            deletedPath = extractedPath;
            console.log('✅ Successfully deleted using extracted path');
          } else {
            console.log('⚠️  Fallback deletion also returned empty array');
          }
        } else {
          console.log('⚠️  Could not extract path from URL pattern');
        }
      } else {
        console.log('⚠️  file_url is empty, cannot extract fallback path');
      }
    }

    // Check final result
    if (storageDeleteFailed) {
      console.error('\n❌ STORAGE DELETE FAILED - NOT deleting DB row');
      console.log('════════════════════════════════════════\n\n');
      return res.status(500).json({
        error: 'Supabase Storage deletion failed. Database row NOT deleted.',
        details: 'Please check server logs for details.'
      });
    }

    if (!deleteResult || deleteResult.length === 0) {
      console.error('\n❌ PATH MISMATCH - No object was deleted from Supabase Storage');
      console.log('════════════════════════════════════════\n\n');
      return res.status(500).json({
        error: 'Storage path mismatch: Could not delete file from Supabase Storage.',
        tried_object_name: file.object_name,
        debug: 'Check server logs for details'
      });
    }

    console.log('\n✅ Supabase Storage deletion successful!');
    console.log('Deleted path:', deletedPath);
    console.log('Result:', deleteResult);

    // Only delete database row after successful Supabase deletion
    console.log('\n→ Now deleting database row...');
    await db.prepare('DELETE FROM files WHERE file_id = ?').run(req.params.fileId);
    console.log('✅ Database row deleted');
    console.log('════════════════════════════════════════\n\n');

    res.json({
      message: 'File deleted from Supabase Storage and database',
      deleted_path: deletedPath,
      result: deleteResult
    });
  } catch (err) {
    console.error('\n❌ EXCEPTION in delete route:', err);
    console.log('════════════════════════════════════════\n\n');
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;