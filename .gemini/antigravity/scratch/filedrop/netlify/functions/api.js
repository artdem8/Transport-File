const Busboy = require('busboy');
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

// Fallback memory store when running without Netlify Blobs
const memoryTransfers = new Map();

function getTransferStore() {
  try {
    return getStore('transfers');
  } catch (_) {
    return null;
  }
}

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return resolve([]);
    }

    const bb = Busboy({ headers: { 'content-type': contentType } });
    const files = [];

    bb.on('file', (fieldname, file, info) => {
      const filename = info.filename || info.name || 'file';
      const mimeType = info.mimeType || info.mimetype || 'application/octet-stream';
      const chunks = [];
      
      file.on('data', (data) => chunks.push(data));
      file.on('end', () => {
        const buffer = Buffer.concat(chunks);
        files.push({
          fieldname,
          originalname: filename,
          mimetype: mimeType,
          buffer,
          size: buffer.length
        });
      });
    });

    bb.on('finish', () => resolve(files));
    bb.on('error', (err) => reject(err));

    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf8');

    bb.end(bodyBuffer);
  });
}

exports.handler = async (event, context) => {
  const path = event.path || '';
  const httpMethod = event.httpMethod || 'GET';

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Route: POST /api/upload (or /.netlify/functions/api/upload)
  if (httpMethod === 'POST' && (path.endsWith('/upload') || path.includes('/upload'))) {
    try {
      const files = await parseMultipart(event);
      if (!files || files.length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'No files received' })
        };
      }

      const code = generateCode();
      const store = getTransferStore();

      const fileMeta = [];
      const filesToStore = [];

      files.forEach((f, idx) => {
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

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          code: code,
          fileCount: fileMeta.length,
          downloadUrl: `/?code=${code}`
        })
      };
    } catch (err) {
      console.error('Upload handler error:', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Serverless upload processing failed: ' + err.message })
      };
    }
  }

  // Route: GET /api/info/:code
  if (httpMethod === 'GET' && path.includes('/info/')) {
    try {
      const parts = path.split('/info/');
      const code = (parts[1] || '').split('/')[0].toUpperCase();

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
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Transfer not found or expired' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          fileCount: transfer.files.length,
          files: transfer.files.map(f => ({
            id: f.id,
            name: f.name,
            size: f.size
          }))
        })
      };
    } catch (err) {
      console.error('Info fetch error:', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to fetch transfer info' })
      };
    }
  }

  // Route: GET /api/download/:code/:index
  if (httpMethod === 'GET' && path.includes('/download/')) {
    try {
      const parts = path.split('/download/')[1].split('/');
      const code = (parts[0] || '').toUpperCase();
      const index = parseInt(parts[1] || '0', 10);

      const store = getTransferStore();
      let record = null;

      if (store) {
        record = await store.get(code, { type: 'json' });
      } else {
        record = memoryTransfers.get(code);
      }

      if (!record || !record.fileBuffers) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Transfer not found or expired' })
        };
      }

      const file = record.fileBuffers.find(f => f.index === index) || record.fileBuffers[0];
      if (!file) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'File not found' })
        };
      }

      const fileHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name)}"`
      };

      return {
        statusCode: 200,
        headers: fileHeaders,
        isBase64Encoded: true,
        body: file.dataBase64
      };
    } catch (err) {
      console.error('Download error:', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Download failed' })
      };
    }
  }

  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ error: 'API route not found' })
  };
};
