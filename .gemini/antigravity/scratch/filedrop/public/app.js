/* ============================================
   FileDrop — Application Logic
   Upload, download, code input, QR, drag & drop
   ============================================ */

(function () {
  'use strict';

  // --- DOM References ---
  const navBtns = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.view');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const fileListContainer = document.getElementById('fileListContainer');
  const fileList = document.getElementById('fileList');
  const clearFilesBtn = document.getElementById('clearFilesBtn');
  const uploadBtn = document.getElementById('uploadBtn');
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressPercent = document.getElementById('progressPercent');
  const progressLabel = document.getElementById('progressLabel');
  const progressSpeed = document.getElementById('progressSpeed');
  const resultContainer = document.getElementById('resultContainer');
  const codeText = document.getElementById('codeText');
  const codeCopyBtn = document.getElementById('codeCopyBtn');
  const qrImage = document.getElementById('qrImage');
  const metaFiles = document.getElementById('metaFiles');
  const metaExpiry = document.getElementById('metaExpiry');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const newUploadBtn = document.getElementById('newUploadBtn');
  const codeInputs = document.querySelectorAll('.code-input');
  const fetchBtn = document.getElementById('fetchBtn');
  const downloadResult = document.getElementById('downloadResult');
  const downloadFileList = document.getElementById('downloadFileList');
  const downloadAllBtn = document.getElementById('downloadAllBtn');
  const errorContainer = document.getElementById('errorContainer');
  const errorText = document.getElementById('errorText');
  const retryBtn = document.getElementById('retryBtn');
  const uploadErrorContainer = document.getElementById('uploadErrorContainer');
  const uploadErrorText = document.getElementById('uploadErrorText');
  const uploadRetryBtn = document.getElementById('uploadRetryBtn');
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toastText');

  const API_BASE = (window.API_BASE_URL || '').replace(/\/$/, '');

  let selectedFiles = [];
  let currentCode = '';
  let currentDownloadCode = '';

  // --- Initialize ---
  init();

  function init() {
    createParticles();
    bindNavigation();
    bindDragDrop();
    bindFileInput();
    bindCodeInputs();
    bindButtons();
    checkURLForCode();
  }

  // --- Background Particles ---
  function createParticles() {
    const container = document.getElementById('bgParticles');
    if (!container) return;
    const count = window.innerWidth < 640 ? 15 : 30;
    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDuration = (8 + Math.random() * 12) + 's';
      particle.style.animationDelay = (Math.random() * 10) + 's';
      particle.style.width = (1 + Math.random() * 2) + 'px';
      particle.style.height = particle.style.width;
      particle.style.opacity = 0.1 + Math.random() * 0.3;
      container.appendChild(particle);
    }
  }

  // --- Navigation ---
  function bindNavigation() {
    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.dataset.view;
        navBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        views.forEach(v => v.classList.remove('active'));
        document.getElementById(targetView + 'View').classList.add('active');
      });
    });
  }

  function switchToView(viewName) {
    navBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewName);
    });
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(viewName + 'View').classList.add('active');
  }

  // --- Drag & Drop ---
  function bindDragDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    dropZone.addEventListener('dragenter', () => dropZone.classList.add('drag-over'));
    dropZone.addEventListener('dragover', () => dropZone.classList.add('drag-over'));
    dropZone.addEventListener('dragleave', (e) => {
      if (!dropZone.contains(e.relatedTarget)) {
        dropZone.classList.remove('drag-over');
      }
    });
    dropZone.addEventListener('drop', (e) => {
      dropZone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        addFiles(files);
      }
    });

    dropZone.addEventListener('click', () => fileInput.click());
  }

  // --- File Input ---
  function bindFileInput() {
    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files);
      if (files.length > 0) {
        addFiles(files);
      }
      fileInput.value = '';
    });
  }

  function addFiles(newFiles) {
    selectedFiles = [...selectedFiles, ...newFiles];
    renderFileList();
    fileListContainer.classList.remove('hidden');
    if (uploadErrorContainer) uploadErrorContainer.classList.add('hidden');
  }

  function renderFileList() {
    fileList.innerHTML = '';
    selectedFiles.forEach((file, index) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.style.animationDelay = (index * 0.05) + 's';

      const iconType = getFileIconType(file.type);
      const ext = getFileExtension(file.name);

      li.innerHTML = `
        <div class="file-item-icon ${iconType}">${ext}</div>
        <div class="file-item-info">
          <div class="file-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
          <div class="file-item-size">${formatSize(file.size)}</div>
        </div>
        <button class="file-item-remove" data-index="${index}" title="Remove file">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      `;

      const removeBtn = li.querySelector('.file-item-remove');
      removeBtn.addEventListener('click', () => {
        selectedFiles.splice(index, 1);
        if (selectedFiles.length === 0) {
          fileListContainer.classList.add('hidden');
        }
        renderFileList();
      });

      fileList.appendChild(li);
    });
  }

  // --- Code Input (Download) ---
  function bindCodeInputs() {
    codeInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        e.target.value = val;

        if (val) {
          e.target.classList.add('filled');
          if (index < codeInputs.length - 1) {
            codeInputs[index + 1].focus();
          }
        } else {
          e.target.classList.remove('filled');
        }
        updateFetchButton();
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          codeInputs[index - 1].focus();
          codeInputs[index - 1].value = '';
          codeInputs[index - 1].classList.remove('filled');
          updateFetchButton();
        }
        if (e.key === 'Enter') {
          const code = getCodeFromInputs();
          if (code.length === 6) {
            fetchFiles(code);
          }
        }
      });

      // Handle paste
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData.getData('text') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        for (let i = 0; i < Math.min(pasted.length, 6); i++) {
          const targetIndex = index + i;
          if (targetIndex < codeInputs.length) {
            codeInputs[targetIndex].value = pasted[i];
            codeInputs[targetIndex].classList.add('filled');
          }
        }
        const lastFilled = Math.min(index + pasted.length, codeInputs.length) - 1;
        if (lastFilled >= 0) codeInputs[lastFilled].focus();
        updateFetchButton();
      });
    });
  }

  function getCodeFromInputs() {
    return Array.from(codeInputs).map(i => i.value).join('');
  }

  function updateFetchButton() {
    const code = getCodeFromInputs();
    fetchBtn.disabled = code.length !== 6;
  }

  // --- Buttons ---
  function bindButtons() {
    clearFilesBtn.addEventListener('click', () => {
      selectedFiles = [];
      fileListContainer.classList.add('hidden');
      if (uploadErrorContainer) uploadErrorContainer.classList.add('hidden');
      dropZone.classList.remove('hidden');
      renderFileList();
    });

    uploadBtn.addEventListener('click', () => uploadFiles());

    codeCopyBtn.addEventListener('click', () => {
      copyToClipboard(currentCode);
      showToast('Code copied!');
    });

    copyLinkBtn.addEventListener('click', () => {
      const url = `${window.location.origin}/?code=${currentCode}`;
      copyToClipboard(url);
      showToast('Link copied!');
    });

    newUploadBtn.addEventListener('click', () => resetUpload());

    fetchBtn.addEventListener('click', () => {
      const code = getCodeFromInputs();
      if (code.length === 6) {
        fetchFiles(code);
      }
    });

    retryBtn.addEventListener('click', () => {
      errorContainer.classList.add('hidden');
      codeInputs.forEach(i => {
        i.value = '';
        i.classList.remove('filled');
      });
      codeInputs[0].focus();
      updateFetchButton();
    });

    if (uploadRetryBtn) {
      uploadRetryBtn.addEventListener('click', () => {
        uploadErrorContainer.classList.add('hidden');
        restoreUploadUI();
      });
    }

    downloadAllBtn.addEventListener('click', () => downloadAll());
  }

  // --- Upload ---
  function restoreUploadUI() {
    progressContainer.classList.add('hidden');
    resultContainer.classList.add('hidden');
    dropZone.classList.remove('hidden');
    if (selectedFiles.length > 0) {
      fileListContainer.classList.remove('hidden');
    }
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressLabel.textContent = 'Uploading...';
    progressSpeed.textContent = '';
  }

  function showUploadError(humanMessage, techDetails) {
    progressContainer.classList.add('hidden');
    resultContainer.classList.add('hidden');
    dropZone.classList.add('hidden');
    fileListContainer.classList.add('hidden');

    if (uploadErrorContainer && uploadErrorText) {
      uploadErrorText.innerHTML = `<strong style="font-size:1rem;color:#fbbf24;">${escapeHtml(humanMessage)}</strong>\n\n<span style="color:#94a3b8;font-size:0.8rem;">Technical details:</span>\n${escapeHtml(techDetails)}`;
      uploadErrorContainer.classList.remove('hidden');
    } else {
      alert(humanMessage);
      restoreUploadUI();
    }
    showToast('Upload failed!');
  }

  const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB chunks to bypass Netlify's 6MB payload limit

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result || '';
        const base64 = dataUrl.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function uploadFiles() {
    if (selectedFiles.length === 0) return;

    dropZone.classList.add('hidden');
    fileListContainer.classList.add('hidden');
    if (uploadErrorContainer) uploadErrorContainer.classList.add('hidden');
    progressContainer.classList.remove('hidden');
    resultContainer.classList.add('hidden');

    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressLabel.textContent = 'Uploading...';
    progressSpeed.textContent = '';

    let code = '';
    const totalFiles = selectedFiles.length;
    const totalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    let bytesUploadedOverall = 0;
    const startTime = Date.now();

    try {
      for (let fIdx = 0; fIdx < totalFiles; fIdx++) {
        const file = selectedFiles[fIdx];
        const fileSize = file.size;
        const totalChunks = Math.ceil(fileSize / CHUNK_SIZE) || 1;

        for (let cIdx = 0; cIdx < totalChunks; cIdx++) {
          const start = cIdx * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, fileSize);
          const chunkBlob = file.slice(start, end);

          const base64Chunk = await blobToBase64(chunkBlob);

          const payload = {
            code,
            fileIndex: fIdx,
            totalFiles,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
            chunkIndex: cIdx,
            totalChunks,
            chunkData: base64Chunk
          };

          const res = await fetch(`${API_BASE}/api/upload-chunk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            let errTextStr = '';
            try {
              const errObj = await res.json();
              errTextStr = errObj.error || '';
            } catch (_) {
              errTextStr = (await res.text()).slice(0, 200);
            }
            const err = new Error(`HTTP ${res.status} ${res.statusText}`);
            err.status = res.status;
            err.statusText = res.statusText;
            err.serverMsg = errTextStr;
            throw err;
          }

          const data = await res.json();
          if (data.code) {
            code = data.code;
          }

          bytesUploadedOverall += (end - start);
          const percent = Math.min(100, Math.round((bytesUploadedOverall / Math.max(1, totalBytes)) * 100));
          progressFill.style.width = percent + '%';
          progressPercent.textContent = percent + '%';

          const elapsed = (Date.now() - startTime) / 1000;
          if (elapsed > 0.5) {
            const speed = bytesUploadedOverall / elapsed;
            progressSpeed.textContent = `${formatSize(Math.round(speed))}/s (${fIdx + 1}/${totalFiles} files)`;
          }
        }
      }

      showResult({
        code,
        fileCount: totalFiles,
        downloadUrl: `${window.location.origin}/?code=${code}`
      });
    } catch (err) {
      let humanMsg = 'Something went wrong while uploading your files. Please try again.';
      let tech = `Error: ${err.message || 'Unknown'}\nURL: ${API_BASE || window.location.origin}/api/upload-chunk`;
      if (err.status === 413) {
        humanMsg = 'Your files are too large for this server. Try smaller files or fewer at once.';
        tech += `\nHTTP 413 Payload Too Large`;
      } else if (err.status === 500) {
        humanMsg = 'The server had an internal error. Please wait a moment and try again.';
        tech += `\nHTTP ${err.status} ${err.statusText}`;
      } else if (err.status) {
        humanMsg = `The server rejected the upload (error ${err.status}). Please try again.`;
        tech += `\nHTTP ${err.status} ${err.statusText}`;
      } else {
        humanMsg = 'Could not connect to the server. Check your internet connection and try again.';
        tech += `\nNetwork error or server unreachable`;
      }
      if (err.serverMsg) {
        tech += `\nServer: ${err.serverMsg}`;
      }
      showUploadError(humanMsg, tech);
    }
  }

  function showResult(data) {
    currentCode = data.code;

    progressContainer.classList.add('hidden');
    resultContainer.classList.remove('hidden');

    codeText.textContent = data.code.slice(0, 3) + ' ' + data.code.slice(3);
    metaFiles.textContent = `${data.fileCount} file${data.fileCount > 1 ? 's' : ''}`;
    metaExpiry.textContent = 'Expires in 24 hours';

    // Build absolute download URL for QR code
    const downloadUrl = `${window.location.origin}/?code=${data.code}`;
    
    const qrLink = document.getElementById('qrLink');
    const directLink = document.getElementById('directLink');
    if (qrLink) qrLink.href = downloadUrl;
    if (directLink) {
      directLink.href = downloadUrl;
      directLink.textContent = downloadUrl;
    }

    document.getElementById('qrContainer').classList.remove('hidden');

    // Generate QR code image
    try {
      if (typeof QRCode !== 'undefined') {
        // The CDN qrcode library supports both toDataURL and toCanvas
        if (typeof QRCode.toDataURL === 'function') {
          QRCode.toDataURL(downloadUrl, {
            width: 280,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
            errorCorrectionLevel: 'M'
          }, function(err, url) {
            if (err) {
              console.error('QR toDataURL error:', err);
              // Fallback: try toCanvas
              generateQRFallback(downloadUrl);
            } else {
              qrImage.src = url;
            }
          });
        } else if (typeof QRCode.toCanvas === 'function') {
          generateQRFallback(downloadUrl);
        } else {
          console.warn('QRCode loaded but no toDataURL or toCanvas method found. Methods:', Object.keys(QRCode));
          document.getElementById('qrContainer').classList.add('hidden');
        }
      } else {
        console.warn('QRCode library not loaded');
        document.getElementById('qrContainer').classList.add('hidden');
      }
    } catch (qrErr) {
      console.error('QR generation failed:', qrErr);
      document.getElementById('qrContainer').classList.add('hidden');
    }
  }

  function generateQRFallback(url) {
    try {
      const canvas = document.createElement('canvas');
      QRCode.toCanvas(canvas, url, { width: 280, margin: 2 }, function(err) {
        if (err) {
          console.error('QR toCanvas error:', err);
          document.getElementById('qrContainer').classList.add('hidden');
        } else {
          qrImage.src = canvas.toDataURL();
        }
      });
    } catch (e) {
      console.error('QR fallback error:', e);
      document.getElementById('qrContainer').classList.add('hidden');
    }
  }

  function resetUpload() {
    selectedFiles = [];
    fileList.innerHTML = '';
    fileListContainer.classList.add('hidden');
    progressContainer.classList.add('hidden');
    if (uploadErrorContainer) uploadErrorContainer.classList.add('hidden');
    resultContainer.classList.add('hidden');
    dropZone.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressLabel.textContent = 'Uploading...';
    progressSpeed.textContent = '';
    currentCode = '';
  }

  // --- Download ---
  function fetchFiles(code) {
    fetchBtn.disabled = true;
    fetchBtn.innerHTML = `
      <svg class="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 11-6.219-8.56"/>
      </svg>
      Searching...
    `;

    fetch(`/api/info/${code}`)
      .then(async r => {
        if (!r.ok) {
          let errTextStr = '';
          try {
            const errData = await r.json();
            errTextStr = errData.error || '';
          } catch (_) {
            errTextStr = (await r.text()).slice(0, 200);
          }
          const err = new Error(`HTTP ${r.status} ${r.statusText}`);
          err.status = r.status;
          err.statusText = r.statusText;
          err.serverMsg = errTextStr;
          throw err;
        }
        return r.json();
      })
      .then(data => {
        currentDownloadCode = code;
        showDownloadResult(data);
      })
      .catch(err => {
        downloadResult.classList.add('hidden');
        errorContainer.classList.remove('hidden');
        
        let humanMsg = 'Something went wrong. Please try again.';
        let tech = `Error: ${err.message || 'Unknown'}\nCode: ${code}\nURL: ${window.location.origin}/api/info/${code}`;
        if (err.status === 404) {
          humanMsg = `Transfer code "${code}" was not found. It may have expired or doesn't exist. Double-check the code and try again.`;
          tech += `\nHTTP 404 Not Found`;
        } else if (err.status === 500) {
          humanMsg = 'The server had an internal error. Please wait a moment and try again.';
          tech += `\nHTTP ${err.status} ${err.statusText}`;
        } else if (err.status) {
          humanMsg = `Server error (${err.status}). Please try again.`;
          tech += `\nHTTP ${err.status} ${err.statusText}`;
        } else {
          humanMsg = 'Could not connect to the server. Check your internet and try again.';
          tech += `\nNetwork error or server unreachable`;
        }
        if (err.serverMsg && !err.serverMsg.toLowerCase().includes('<!doctype html')) {
          tech += `\nServer: ${err.serverMsg}`;
        }
        errorText.innerHTML = `<strong style="font-size:1rem;color:#fbbf24;">${escapeHtml(humanMsg)}</strong>\n\n<span style="color:#94a3b8;font-size:0.8rem;">Technical details:</span>\n${escapeHtml(tech)}`;
      })
      .finally(() => {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          Find Files
        `;
      });
  }

  function showDownloadResult(data) {
    document.getElementById('codeInputContainer').classList.add('hidden');
    downloadResult.classList.remove('hidden');
    
    downloadFileList.innerHTML = '';
    
    const files = data.files || [];
    files.forEach((file, index) => {
      const li = document.createElement('li');
      li.className = 'download-file-item';
      
      const fileId = (file.id !== undefined && file.id !== null) ? file.id : index;
      
      li.innerHTML = `
        <div class="download-file-info">
          <div class="download-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
          <div class="download-file-size">${formatSize(file.size)}</div>
        </div>
        <a href="/api/download/${currentDownloadCode}/${fileId}" class="download-file-btn" download="${escapeHtml(file.name)}" target="_blank">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Save
        </a>
      `;
      downloadFileList.appendChild(li);
    });
  }

  function downloadAll() {
    const links = downloadFileList.querySelectorAll('.download-file-btn');
    if (links.length === 0) return;

    links.forEach((link, idx) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = link.href;
        a.download = link.getAttribute('download') || '';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, idx * 800);
    });
  }

  // --- Utilities ---
  function checkURLForCode() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && code.length === 6) {
      switchToView('download');
      code.toUpperCase().split('').forEach((char, i) => {
        if (codeInputs[i]) {
          codeInputs[i].value = char;
          codeInputs[i].classList.add('filled');
        }
      });
      updateFetchButton();
      fetchFiles(code);
      window.history.replaceState({}, document.title, '/');
    }
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getFileIconType(mimeType) {
    if (!mimeType) return 'other';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
    return 'other';
  }

  function getFileExtension(filename) {
    if (!filename) return 'FILE';
    const parts = filename.split('.');
    if (parts.length > 1) {
      return parts.pop().substring(0, 4).toUpperCase();
    }
    return 'FILE';
  }

  function escapeHtml(unsafe) {
    return (unsafe || '')
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(err => console.error('Copy failed', err));
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Copy failed', err);
      }
      document.body.removeChild(textarea);
    }
  }

  function showToast(message) {
    toastText.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('show');
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.classList.add('hidden');
      }, 300);
    }, 3000);
  }

})();
