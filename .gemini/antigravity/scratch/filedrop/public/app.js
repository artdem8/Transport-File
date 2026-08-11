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

  function showUploadError(diagnosticMessage) {
    progressContainer.classList.add('hidden');
    resultContainer.classList.add('hidden');
    dropZone.classList.add('hidden');
    fileListContainer.classList.add('hidden');

    if (uploadErrorContainer && uploadErrorText) {
      uploadErrorText.textContent = diagnosticMessage;
      uploadErrorContainer.classList.remove('hidden');
    } else {
      alert(diagnosticMessage);
      restoreUploadUI();
    }
    showToast('Upload failed! Check error details below.');
  }

  function uploadFiles() {
    if (selectedFiles.length === 0) return;

    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('files', file));

    dropZone.classList.add('hidden');
    fileListContainer.classList.add('hidden');
    if (uploadErrorContainer) uploadErrorContainer.classList.add('hidden');
    progressContainer.classList.remove('hidden');
    resultContainer.classList.add('hidden');

    const xhr = new XMLHttpRequest();
    let startTime = Date.now();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = percent + '%';
        progressPercent.textContent = percent + '%';

        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > 0.5) {
          const speed = e.loaded / elapsed;
          progressSpeed.textContent = `${formatSize(Math.round(speed))}/s`;
        }

        if (percent === 100) {
          progressLabel.textContent = 'Processing...';
        }
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          showResult(data);
        } catch (parseError) {
          let diag = `[Upload Error: Invalid JSON Response]\n`;
          diag += `HTTP Status: ${xhr.status} ${xhr.statusText}\n`;
          if (xhr.responseText && xhr.responseText.toLowerCase().includes('<!doctype html')) {
            diag += `\nNETLIFY DIAGNOSIS:\nServer returned an HTML page instead of JSON API response.\nWhen published on Netlify static hosting, API route '${API_BASE}/api/upload' returns Netlify's default 404 HTML page because Node.js 'server.js' is NOT running on Netlify.\n`;
          } else {
            diag += `\nResponse Body Snippet:\n${(xhr.responseText || '').slice(0, 300)}\n`;
          }
          showUploadError(diag);
        }
      } else {
        let diag = `[Upload Failed: HTTP ${xhr.status} ${xhr.statusText || 'Error'}]\nURL: ${API_BASE || window.location.origin}/api/upload\n`;
        if (xhr.status === 404) {
          diag += `\nNETLIFY / HOST DIAGNOSIS:\nHTTP 404 Not Found!\nNetlify only hosts static files and does NOT run Node.js 'server.js'. The backend API endpoint '/api/upload' does not exist on Netlify.\n\nHOW TO FIX:\n1. Host the backend on Render.com, Railway.app, or Fly.io\n2. Set window.API_BASE_URL to your live backend URL.\n`;
        } else if (xhr.status === 413) {
          diag += `\nNETLIFY LIMIT DIAGNOSIS:\nHTTP 413 Payload Too Large!\nNetlify enforces a hard ~6MB upload body limit on all incoming requests to Netlify domain names.\n\nTO UPLOAD LARGE FILES:\nDeploy server.js to a Node server host like Render.com, Railway.app, or Fly.io (which support up to 500MB+ uploads), then set window.API_BASE_URL to your live server URL.\n`;
        } else if (xhr.status === 500) {
          diag += `\nDIAGNOSIS: Internal Server Error (500).\nThe backend server encountered an exception while receiving uploads.\n`;
        }
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData && errData.error) {
            diag += `\nServer Error Message: ${errData.error}\n`;
          }
        } catch (_) {
          const snippet = (xhr.responseText || '').trim().slice(0, 300);
          if (snippet && !snippet.toLowerCase().includes('<!doctype html')) {
            diag += `\nResponse details:\n${snippet}\n`;
          }
        }
        showUploadError(diag);
      }
    });

    xhr.addEventListener('error', () => {
      let diag = `[Network Error / Connection Refused]\nTarget: ${API_BASE || window.location.origin}/api/upload\n`;
      diag += `\nNETLIFY / HOST DIAGNOSIS:\nFailed to reach the upload backend.\nIf published on Netlify, Netlify only hosts static HTML/CSS/JS files and cannot execute server.js.\n\nTo use this app online:\n- Deploy server.js to a Node server host like Render, Railway, or Fly.io.\n- Set window.API_BASE_URL to your live server URL.\n`;
      showUploadError(diag);
    });

    xhr.open('POST', `${API_BASE}/api/upload`);
    xhr.send(formData);
  }

  function showResult(data) {
    currentCode = data.code;

    progressContainer.classList.add('hidden');
    resultContainer.classList.remove('hidden');

    codeText.textContent = data.code.slice(0, 3) + ' ' + data.code.slice(3);
    metaFiles.textContent = `${data.fileCount} file${data.fileCount > 1 ? 's' : ''}`;
    metaExpiry.textContent = 'Expires in 24 hours';

    // Generate QR code
    const downloadUrl = data.downloadUrl || `${window.location.origin}/?code=${data.code}`;
    try {
      if (typeof QRCode !== 'undefined' && QRCode.toDataURL) {
        const result = QRCode.toDataURL(downloadUrl, {
          width: 280,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' },
          errorCorrectionLevel: 'M'
        });
        
        if (result && typeof result.then === 'function') {
          result.then(url => { qrImage.src = url; })
                .catch(err => {
                  console.error('QR Error:', err);
                  document.getElementById('qrContainer').classList.add('hidden');
                });
        } else if (typeof result === 'string') {
          qrImage.src = result;
        } else {
          QRCode.toDataURL(downloadUrl, {
            width: 280,
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' },
            errorCorrectionLevel: 'M'
          }, (err, url) => {
            if (err) {
              console.error('QR Error:', err);
              document.getElementById('qrContainer').classList.add('hidden');
            } else {
              qrImage.src = url;
            }
          });
        }
      } else {
        document.getElementById('qrContainer').classList.add('hidden');
      }
    } catch (qrErr) {
      console.error('QR generation failed:', qrErr);
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
        
        let diag = `[Transfer Fetch Failed: ${err.message || 'Error'}]\nCode: ${code}\nURL: ${window.location.origin}/api/info/${code}\n`;
        if (err.status === 404) {
          diag += `\nNETLIFY / HOST DIAGNOSIS:\nHTTP 404 Not Found!\nTransfer code '${code}' was not found, OR the server.js backend is not running on Netlify.\n`;
        } else if (err.status) {
          diag += `\nHTTP Status: ${err.status} ${err.statusText}\n`;
        } else {
          diag += `\nDIAGNOSIS: Network error / Server unreachable.\nNode.js server.js is not active.\n`;
        }
        if (err.serverMsg && !err.serverMsg.toLowerCase().includes('<!doctype html')) {
          diag += `\nServer Message: ${err.serverMsg}\n`;
        }
        errorText.textContent = diag;
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
    files.forEach(file => {
      const li = document.createElement('li');
      li.className = 'download-file-item';
      
      const ext = getFileExtension(file.name);
      
      li.innerHTML = `
        <div class="download-file-info">
          <div class="download-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
          <div class="download-file-size">${formatSize(file.size)}</div>
        </div>
        <a href="/api/download/${currentDownloadCode}/${file.id || escapeHtml(file.name)}" class="download-file-btn" download="${escapeHtml(file.name)}" target="_blank">
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
    window.location.href = `/api/download/${currentDownloadCode}`;
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
