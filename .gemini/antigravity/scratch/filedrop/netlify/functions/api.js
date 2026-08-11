const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

// Always create a fresh store handle per invocation — do NOT cache across invocations
function getTransferStore() {
  try {
    return getStore({
      name: 'transfers',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN
    });
  } catch (err) {
    console.error('[BLOBS] getStore failed:', err.message);
    return null;
  }
}

function getChunkStore() {
  try {
    return getStore({
      name: 'chunks',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN
    });
  } catch (err) {
    console.error('[BLOBS] getStore(chunks) failed:', err.message);
    return null;
  }
}

// Extract the route segment after /api/ from the full path
// Netlify rewrites /api/* -> /.netlify/functions/api/*
// event.path might be "/api/info/ABC123" or "/.netlify/functions/api/info/ABC123"
function getRoute(event) {
  const path = event.path || '';
  const apiMatch = path.match(/\/api\/(.+)/);
  if (apiMatch) return apiMatch[1];
  const rawUrl = event.rawUrl || '';
  const urlMatch = rawUrl.match(/\/api\/(.+)/);
  if (urlMatch) return urlMatch[1];
  return '';
}

exports.handler = async (event) => {
  connectLambda(event);

  const httpMethod = event.httpMethod || 'GET';
  const route = getRoute(event);

  console.log(`[API] ${httpMethod} route="${route}" path="${event.path}"`);

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // ========================================
  // POST /api/upload-chunk
  // ========================================
  if (httpMethod === 'POST' && route.startsWith('upload-chunk')) {
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

      const fileIndex = typeof bodyData.fileIndex === 'number' ? bodyData.fileIndex : 0;
      const fileName = bodyData.fileName || 'file';
      const fileSize = bodyData.fileSize || 0;
      const mimeType = bodyData.mimeType || 'application/octet-stream';
      const chunkIndex = typeof bodyData.chunkIndex === 'number' ? bodyData.chunkIndex : 0;
      const totalChunks = bodyData.totalChunks || 1;
      const chunkDataBase64 = bodyData.chunkData || '';

      if (!chunkDataBase64) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing chunkData' }) };
      }

      const metaStore = getTransferStore();
      const chunkStore = getChunkStore();

      if (!metaStore || !chunkStore) {
        console.error('[BLOBS] Store not available! metaStore:', !!metaStore, 'chunkStore:', !!chunkStore);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Storage unavailable. Netlify Blobs could not be initialized.' })
        };
      }

      const chunkKey = `${code}_f${fileIndex}_c${chunkIndex}`;
      await chunkStore.set(chunkKey, chunkDataBase64);
      console.log(`[UPLOAD] Stored chunk: ${chunkKey} (${chunkDataBase64.length} chars)`);

      let metaRecord = null;
      try {
        metaRecord = await metaStore.get(code, { type: 'json' });
      } catch (e) {
        console.log(`[UPLOAD] No existing meta for code ${code}, creating new`);
      }

      if (!metaRecord) {
        metaRecord = {
          code,
          files: [],
          totalFilesExpected: bodyData.totalFiles || 1,
          createdAt: Date.now()
        };
      }

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

      await metaStore.setJSON(code, metaRecord);
      console.log(`[UPLOAD] Updated meta for ${code}: ${JSON.stringify(metaRecord.files.map(f => f.name))}`);

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
      console.error('[UPLOAD] Chunk upload error:', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Chunk processing failed: ' + err.message })
      };
    }
  }

  // ========================================
  // GET /api/info/:code
  // ========================================
  if (httpMethod === 'GET' && route.startsWith('info/')) {
    try {
      const code = route.replace('info/', '').split('/')[0].split('?')[0].toUpperCase();
      console.log(`[INFO] Looking up code: "${code}"`);

      if (!code || code.length !== 6) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid transfer code. Must be 6 characters.' })
        };
      }

      const metaStore = getTransferStore();
      if (!metaStore) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Storage unavailable' }) };
      }

      let transfer = null;
      try {
        transfer = await metaStore.get(code, { type: 'json' });
      } catch (e) {
        console.error(`[INFO] Blobs get error for "${code}":`, e.message);
      }

      console.log(`[INFO] Result for "${code}":`, transfer ? `found ${transfer.files?.length} files` : 'NOT FOUND');

      if (!transfer || !transfer.files) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            error: 'Transfer not found or expired',
            code: code,
            hint: 'The transfer code may have expired or was never uploaded successfully.'
          })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          code: transfer.code,
          fileCount: transfer.files.length,
          files: transfer.files.map(f => ({ id: f.id, name: f.name, size: f.size }))
        })
      };
    } catch (err) {
      console.error('[INFO] Error:', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to fetch transfer info: ' + err.message })
      };
    }
  }

  // ========================================
  // GET /api/download/:code/:index
  // ========================================
  if (httpMethod === 'GET' && route.startsWith('download/')) {
    try {
      const parts = route.replace('download/', '').split('/');
      const code = (parts[0] || '').split('?')[0].toUpperCase();
      const index = parseInt(parts[1] || '0', 10);

      console.log(`[DOWNLOAD] code="${code}" index=${index}`);

      const metaStore = getTransferStore();
      const chunkStore = getChunkStore();

      if (!metaStore || !chunkStore) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Storage unavailable' }) };
      }

      let record = null;
      try {
        record = await metaStore.get(code, { type: 'json' });
      } catch (e) {
        console.error(`[DOWNLOAD] Meta fetch error:`, e.message);
      }

      if (!record || !record.files) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Transfer not found or expired' }) };
      }

      const file = record.files.find(f => f.id === index) || record.files[0];
      if (!file) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'File not found in transfer' }) };
      }

      const chunks = [];
      const totalChunks = file.totalChunks || 1;

      for (let c = 0; c < totalChunks; c++) {
        const chunkKey = `${code}_f${file.id}_c${c}`;
        let b64 = null;
        try {
          b64 = await chunkStore.get(chunkKey);
        } catch (e) {
          console.error(`[DOWNLOAD] Chunk fetch error for ${chunkKey}:`, e.message);
        }
        if (b64) {
          chunks.push(Buffer.from(b64, 'base64'));
        }
      }

      if (chunks.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'File data missing or expired' }) };
      }

      const fileBuffer = Buffer.concat(chunks);
      console.log(`[DOWNLOAD] Assembled ${file.name}: ${chunks.length} chunks, ${fileBuffer.length} bytes`);

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': file.mimeType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name)}"`,
          'Content-Length': String(fileBuffer.length)
        },
        isBase64Encoded: true,
        body: fileBuffer.toString('base64')
      };
    } catch (err) {
      console.error('[DOWNLOAD] Error:', err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Download failed: ' + err.message }) };
    }
  }

  // ========================================
  // Debug route: GET /api/debug
  // ========================================
  if (httpMethod === 'GET' && route.startsWith('debug')) {
    try {
      const metaStore = getTransferStore();
      const chunkStore = getChunkStore();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'API is running',
          metaStoreAvailable: !!metaStore,
          chunkStoreAvailable: !!chunkStore,
          path: event.path,
          rawUrl: event.rawUrl,
          route: route,
          httpMethod: httpMethod,
          timestamp: new Date().toISOString()
        })
      };
    } catch (err) {
      return { statusCode: 200, headers, body: JSON.stringify({ message: 'API running but stores failed', error: err.message }) };
    }
  }

  console.log(`[API] No route matched for: ${httpMethod} "${route}" (path: "${event.path}")`);
  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ error: 'API route not found', route: route, path: event.path, method: httpMethod })
  };
};