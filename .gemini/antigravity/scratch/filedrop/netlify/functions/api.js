const Busboy = require('busboy');
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

// Fallback memory store when running locally
const memoryTransfers = new Map();
const memoryChunks = new Map();

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

  // Route: POST /api/upload-chunk (Chunked upload for large files on Netlify)
  if (httpMethod === 'POST' && (path.endsWith('/upload-chunk') || path.includes('/upload-chunk'))) {
    try {
      let bodyData = {};
      try {
        bodyData = JSON.parse(event.body || '{}');
      } catch (_) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON payload' }) };
      }

      let code = (bodyData.code || '').toUpperCase();
      if (!code) {
        code = generateCode();
      }

      const fileIndex = bodyData.fileIndex || 0;
      const fileName = bodyData.fileName || 'file';
      const fileSize = bodyData.fileSize || 0;
      const mimeType = bodyData.mimeType || 'application/octet-stream';
      const chunkIndex = bodyData.chunkIndex || 0;
      const totalChunks = bodyData.totalChunks || 1;
      const chunkDataBase64 = bodyData.chunkData || '';

      if (!chunkDataBase64) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing chunkData' }) };
      }

      const store = getTransferStore();
      const chunkKey = `${code}_f${fileIndex}_c${chunkIndex}`;

      if (store) {
        await store.set(chunkKey, chunkDataBase64);
      } else {
        memoryChunks.set(chunkKey, chunkDataBase64);
      }

      // Update transfer metadata
      let metaRecord = null;
      if (store) {
        metaRecord = await store.get(code, { type: 'json' });
      } else {
        metaRecord = memoryTransfers.get(code);
      }

      if (!metaRecord) {
        metaRecord = {
          code,
          files: [],
          totalFilesExpected: bodyData.totalFiles || 1,
          createdAt: Date.now()
        };
      }

      // Find or add file entry in metaRecord
      let fEntry = metaRecord.files.find(f => f.id === fileIndex);
      if (!fEntry) {
        fEntry = {
          id: fileIndex,
          name: fileName,
          size: fileSize,
          mimeType: mimeType,
          totalChunks: totalChunks,
          receivedChunks: 0
        };
        metaRecord.files.push(fEntry);
      }
      fEntry.receivedChunks = (fEntry.receivedChunks || 0) + 1;

      if (store) {
        await store.setJSON(code, metaRecord);
      } else {
        memoryTransfers.set(code, metaRecord);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          code,
          fileIndex,
          chunkIndex,
          totalChunks,
          receivedChunks: fEntry.receivedChunks
        })
      };
    } catch (err) {
      console.error('Chunk upload error:', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Chunk processing failed: ' + err.message })
      };
    }
  }

  // Route: POST /api/upload (Fallback direct upload for small batch)
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
          mimeType: f.mimetype,
          totalChunks: 1
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
        fileBuffers: filesToStore,
        createdAt: Date.now()
      };

      if (store) {
        await store.setJSON(code, transferData);
      } else {
        memoryTransfers.set(code, transferData);
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
        transfer = await store.get(code, { type: 'json' });
      } else {
        transfer = memoryTransfers.get(code);
      }

      if (!transfer || !transfer.files) {
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
          code: transfer.code,
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

      if (!record || !record.files) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Transfer not found or expired' })
        };
      }

      const file = record.files.find(f => f.id === index) || record.files[0];
      if (!file) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'File not found' })
        };
      }

      let fileBuffer = null;

      // Check if file stored in legacy fileBuffers array
      if (record.fileBuffers && record.fileBuffers.length > 0) {
        const legacy = record.fileBuffers.find(f => f.index === index) || record.fileBuffers[0];
        if (legacy && legacy.dataBase64) {
          fileBuffer = Buffer.from(legacy.dataBase64, 'base64');
        }
      }

      // Otherwise reassemble from chunks
      if (!fileBuffer) {
        const chunks = [];
        const totalChunks = file.totalChunks || 1;

        for (let c = 0; c < totalChunks; c++) {
          const chunkKey = `${code}_f${file.id}_c${c}`;
          let b64 = null;
          if (store) {
            b64 = await store.get(chunkKey);
          } else {
            b64 = memoryChunks.get(chunkKey);
          }
          if (b64) {
            chunks.push(Buffer.from(b64, 'base64'));
          }
        }

        if (chunks.length > 0) {
          fileBuffer = Buffer.concat(chunks);
        }
      }

      if (!fileBuffer) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'File chunks missing or expired' })
        };
      }

      const fileHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name)}"`,
        'Content-Length': fileBuffer.length
      };

      return {
        statusCode: 200,
        headers: fileHeaders,
        isBase64Encoded: true,
        body: fileBuffer.toString('base64')
      };
    } catch (err) {
      console.error('Download error:', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Download failed: ' + err.message })
      };
    }
  }

  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ error: 'API route not found' })
  };
};
