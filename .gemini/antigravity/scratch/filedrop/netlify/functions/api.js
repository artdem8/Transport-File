const express = require('express');
const serverless = require('serverless-http');
const multer = require('multer');
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const app = express();
const router = express.Router();

// Fallback memory store when running without Netlify Blobs
const memoryTransfers = new Map();

// Helper: Get Blobs store safely
function getTransferStore() {
  try {
    return getStore('transfers');
  } catch (_) {
    return null;
  }
}

// Generate 6-char code
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

// Multer memory storage (up to Netlify limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for Netlify Function uploads
  }
});

// Enable CORS
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// POST /api/upload
router.post('/upload', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const code = generateCode();
    const store = getTransferStore();

    const fileMeta = [];
    const filesToStore = [];

    req.files.forEach((f, idx) => {
      fileMeta.push({
        id: idx,
        name: f.originalname,
        size: f.size,
        mimeType: f.mimetype
      });
      filesToStore.push({
        index: idx,
        name: f.originalname,
        dataBase64: f.buffer.toString('base64'),
        mimeType: f.mimetype
      });
    });

    const transferData = {
      code,
      files: fileMeta,
      createdAt: Date.now()
    };

    if (store) {
      await store.setJSON(code, {
        meta: transferData,
        fileBuffers: filesToStore
      });
    } else {
      memoryTransfers.set(code, {
        meta: transferData,
        fileBuffers: filesToStore
      });
    }

    res.json({
      code: code,
      fileCount: fileMeta.length,
      downloadUrl: `/?code=${code}`
    });
  } catch (err) {
    console.error('Netlify upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// GET /api/info/:code
router.get('/info/:code', async (req, res) => {
  try {
    const code = (req.params.code || '').toUpperCase();
    const store = getTransferStore();
    let transfer = null;

    if (store) {
      const data = await store.get(code, { type: 'json' });
      if (data && data.meta) transfer = data.meta;
    } else {
      const mem = memoryTransfers.get(code);
      if (mem && mem.meta) transfer = mem.meta;
    }

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found or expired' });
    }

    res.json({
      fileCount: transfer.files.length,
      files: transfer.files.map(f => ({
        id: f.id,
        name: f.name,
        size: f.size
      }))
    });
  } catch (err) {
    console.error('Info fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch transfer info' });
  }
});

// GET /api/download/:code/:index
router.get('/download/:code/:index?', async (req, res) => {
  try {
    const code = (req.params.code || '').toUpperCase();
    const index = parseInt(req.params.index || '0', 10);
    const store = getTransferStore();

    let record = null;
    if (store) {
      record = await store.get(code, { type: 'json' });
    } else {
      record = memoryTransfers.get(code);
    }

    if (!record || !record.fileBuffers) {
      return res.status(404).json({ error: 'Transfer not found or expired' });
    }

    const file = record.fileBuffers.find(f => f.index === index) || record.fileBuffers[0];
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const buf = Buffer.from(file.dataBase64, 'base64');
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

app.use('/api', router);
app.use('/.netlify/functions/api', router);

module.exports.handler = serverless(app);
