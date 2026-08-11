const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// In-memory store for transfer metadata
// Map structure: code -> { files: [{name, size, path}], createdAt: timestamp }
const transfers = new Map();

// Helper to generate a random 6-character uppercase alphanumeric code
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!req.uploadCode) {
      let code = generateCode();
      while (transfers.has(code)) {
        code = generateCode();
      }
      req.uploadCode = code;
      req.uploadDir = path.join(uploadsDir, code);
      fs.mkdirSync(req.uploadDir, { recursive: true });
    }
    cb(null, req.uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate a unique filename to prevent clashes within the same directory
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB per file/upload
  }
});

// CORS middleware for cross-origin hosting (e.g. Netlify frontend -> Render backend)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Upload endpoint
app.post('/api/upload', upload.array('files'), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const code = req.uploadCode;
    const fileData = req.files.map(f => ({
      name: f.originalname,
      size: f.size,
      path: f.path
    }));

    transfers.set(code, {
      files: fileData,
      createdAt: Date.now()
    });

    res.json({
      code: code,
      fileCount: fileData.length,
      downloadUrl: `/api/download/${code}`
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Internal server error during upload' });
  }
});

// Info endpoint
app.get('/api/info/:code', (req, res) => {
  const code = req.params.code;
  const transfer = transfers.get(code);

  if (!transfer) {
    return res.status(404).json({ error: 'Transfer not found or expired' });
  }

  res.json({
    fileCount: transfer.files.length,
    files: transfer.files.map(f => ({
      name: f.name,
      size: f.size
    }))
  });
});

// Download endpoint
app.get('/api/download/:code/:index', (req, res) => {
  const code = req.params.code;
  const index = parseInt(req.params.index, 10);
  const transfer = transfers.get(code);

  if (!transfer || isNaN(index) || index < 0 || index >= transfer.files.length) {
    return res.status(404).json({ error: 'File not found' });
  }

  const file = transfer.files[index];
  res.download(file.path, file.name, (err) => {
    if (err) {
      console.error('Download error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Cleanup interval (check every 30 minutes for transfers older than 24 hours)
const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

setInterval(() => {
  const now = Date.now();
  for (const [code, transfer] of transfers.entries()) {
    if (now - transfer.createdAt > MAX_AGE) {
      const dir = path.join(uploadsDir, code);
      fs.rm(dir, { recursive: true, force: true }, (err) => {
        if (err) {
          console.error(`Failed to delete directory ${dir} during cleanup:`, err);
        } else {
          console.log(`Cleaned up expired transfer: ${code}`);
        }
      });
      transfers.delete(code);
    }
  }
}, CLEANUP_INTERVAL);

// Graceful shutdown handling (SIGINT/SIGTERM)
// The prompt specifies NOT to delete uploaded files mid-transfer on shutdown.
// We just exit normally without purging the uploads folder or Map, so existing files stay on disk.
function handleShutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  process.exit(0);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

app.listen(PORT, () => {
  console.log(`FileDrop server listening on port ${PORT}`);
});
