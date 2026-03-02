// ===== State =====
let uploadedFiles = [];
let sortableInstance = null;

// ===== DOM Elements =====
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const mergeBtn = document.getElementById('mergeBtn');
const mergeSection = document.getElementById('mergeSection');
const fileListSection = document.getElementById('fileListSection');
const resultCard = document.getElementById('resultCard');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    initDropzone();
    initSortable();
    initMerge();
    initClearAll();

    // Preview modal
    document.getElementById('previewCloseBtn').addEventListener('click', closePreview);
    document.getElementById('previewModal').addEventListener('click', (e) => {
        if (e.target.id === 'previewModal') closePreview();
    });

    // Result actions
    document.getElementById('previewMergedBtn').addEventListener('click', () => {
        openPreview('/merge/preview', 'Merged PDF');
    });
    document.getElementById('downloadMergedBtn').addEventListener('click', () => {
        window.location.href = '/download-merged';
    });
    document.getElementById('adjustBtn').addEventListener('click', () => {
        resultCard.style.display = 'none';
        dropzone.style.display = '';
        fileListSection.style.display = '';
        mergeSection.style.display = uploadedFiles.length > 0 ? '' : 'none';
        mergeBtn.disabled = uploadedFiles.length < 1;
    });
});

// ===== Dropzone =====
function initDropzone() {
    browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(event => {
        dropzone.addEventListener(event, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(event => {
        dropzone.addEventListener(event, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        handleFiles(files);
    });
}

// ===== Handle File Upload =====
async function handleFiles(files) {
    const validFiles = [];
    for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png'].includes(ext)) {
            showToast(`"${file.name}" is not a supported file type.`, 'error');
            continue;
        }
        validFiles.push({ file, ext });
    }

    if (validFiles.length === 0) return;

    const tempEntries = validFiles.map(({ file, ext }) => {
        const tempId = 'temp-' + Date.now() + '-' + Math.random();
        uploadedFiles.push({ id: tempId, name: file.name, pages: '...', type: ext, uploading: true });
        return { file, ext, tempId };
    });
    renderFileList();
    showLoading(`Uploading ${validFiles.length} file${validFiles.length > 1 ? 's' : ''}...`);

    const uploads = tempEntries.map(async ({ file, tempId }) => {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch('/upload', { method: 'POST', body: formData });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Upload failed');

            const idx = uploadedFiles.findIndex(f => f.id === tempId);
            if (idx !== -1) {
                uploadedFiles[idx] = { id: data.id, name: data.name, pages: data.pages, type: data.type, uploading: false };
            }
        } catch (err) {
            uploadedFiles = uploadedFiles.filter(f => f.id !== tempId);
            showToast(`${file.name}: ${err.message}`, 'error');
        }
    });

    await Promise.all(uploads);
    renderFileList();
    hideLoading();
}

// ===== Render File List =====
function renderFileList() {
    fileList.innerHTML = '';
    fileCount.textContent = uploadedFiles.length + ' file' + (uploadedFiles.length !== 1 ? 's' : '');
    mergeBtn.disabled = uploadedFiles.length < 1;
    mergeSection.style.display = uploadedFiles.length > 0 ? '' : 'none';

    uploadedFiles.forEach((file) => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.dataset.id = file.id;

        const iconClass = file.type === 'pdf' ? 'pdf' : ['jpg', 'jpeg', 'png'].includes(file.type) ? 'img' : 'docx';
        const iconEmoji = file.type === 'pdf' ? '📄' : ['jpg', 'jpeg', 'png'].includes(file.type) ? '🖼️' : '📝';
        const pageText = file.uploading ? 'Uploading...' : `${file.pages} page${file.pages !== 1 ? 's' : ''}`;

        card.innerHTML = `
            <span class="drag-handle">⠿</span>
            <div class="file-icon ${iconClass}">${iconEmoji}</div>
            <div class="file-info">
                <div class="file-name" title="${file.name}">${file.name}</div>
                <div class="file-meta">${pageText}</div>
            </div>
            <button class="file-preview" onclick="previewFile('${file.id}', '${file.name}')" title="Preview"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
            <button class="file-remove" onclick="removeFile('${file.id}')" title="Remove">✕</button>
        `;
        fileList.appendChild(card);
    });

    initSortable();
}

// ===== Sortable =====
function initSortable() {
    if (sortableInstance) sortableInstance.destroy();
    if (typeof Sortable !== 'undefined' && fileList) {
        sortableInstance = Sortable.create(fileList, {
            animation: 200,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: () => {
                const newOrder = [];
                fileList.querySelectorAll('.file-card').forEach(card => {
                    const file = uploadedFiles.find(f => f.id === card.dataset.id);
                    if (file) newOrder.push(file);
                });
                uploadedFiles = newOrder;
            }
        });
    }
}

// ===== Remove File =====
async function removeFile(fileId) {
    try {
        await fetch('/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: fileId })
        });
    } catch (err) { /* ignore */ }
    uploadedFiles = uploadedFiles.filter(f => f.id !== fileId);
    renderFileList();
}

// ===== Merge =====
function initMerge() {
    mergeBtn.addEventListener('click', async () => {
        const realFiles = uploadedFiles.filter(f => !f.uploading);
        if (realFiles.length === 0) {
            showToast('Please upload at least one file.', 'error');
            return;
        }

        try {
            showLoading('Merging your files...');
            const response = await fetch('/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    files: realFiles.map(f => f.id),
                    protect: false,
                    password: ''
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Merge failed');

            hideLoading();

            // Show result, hide inputs
            document.getElementById('resultText').textContent =
                `${realFiles.length} file${realFiles.length > 1 ? 's' : ''} merged successfully!`;
            mergeSection.style.display = 'none';
            fileListSection.style.display = 'none';
            dropzone.style.display = 'none';
            resultCard.style.display = 'block';

            showToast('PDF merged successfully!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
            hideLoading();
        }
    });
}

// ===== Loading =====
function showLoading(text) {
    loadingText.textContent = text || 'Processing...';
    loadingOverlay.classList.add('active');
}

function hideLoading() {
    loadingOverlay.classList.remove('active');
}

// ===== Toast =====
function showToast(message, type = 'success') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ===== Clear All =====
function initClearAll() {
    document.getElementById('clearAllBtn').addEventListener('click', async () => {
        if (uploadedFiles.length === 0) return;
        try {
            await fetch('/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (err) { /* ignore */ }
        uploadedFiles = [];
        resultCard.style.display = 'none';
        mergeSection.style.display = 'none';
        dropzone.style.display = '';
        fileListSection.style.display = '';
        renderFileList();
        showToast('All files cleared.', 'success');
    });
}

// ===== Preview =====
function previewFile(fileId, fileName) {
    openPreview(`/preview/${fileId}`, fileName);
}

function openPreview(url, title) {
    document.getElementById('previewTitle').textContent = title;
    document.getElementById('previewFrame').src = url;
    document.getElementById('previewModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePreview() {
    document.getElementById('previewFrame').src = '';
    document.getElementById('previewModal').classList.remove('active');
    document.body.style.overflow = '';
}
