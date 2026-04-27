/**
 * app.js — ProjectVault Frontend Logic
 */

'use strict';

const API = '/api';
let currentProjectId = null;

// SECTION 1: Page Navigation
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const el = document.getElementById(`page-${name}`);
  if (el) el.classList.add('active');

  const token = getToken();
  const protectedPages = ['dashboard', 'submit'];

  if (protectedPages.includes(name) && !token) {
    showToast('Please sign in first', 'error');
    showPage('login');
    return;
  }

  if (name === 'dashboard') loadDashboard();
  if (name === 'home') updateNavForAuth();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// SECTION 2: Auth Helpers
function getToken() {
  return localStorage.getItem('portal_token');
}

function getUser() {
  const u = localStorage.getItem('portal_user');
  return u ? JSON.parse(u) : null;
}

function setSession(token, user) {
  localStorage.setItem('portal_token', token);
  localStorage.setItem('portal_user', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('portal_token');
  localStorage.removeItem('portal_user');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

function updateNavForAuth() {
  const token = getToken();
  const user = getUser();

  const show = id => document.getElementById(id)?.classList.remove('hidden');
  const hide = id => document.getElementById(id)?.classList.add('hidden');

  if (token && user) {
    show('navDashboard');
    show('navSubmit');
    show('userPill');
    show('btnLogout');
    hide('btnLogin');

    document.getElementById('userName').textContent = user.name.split(' ')[0];
    document.getElementById('userAvatar').textContent = user.name[0].toUpperCase();
  } else {
    hide('navDashboard');
    hide('navSubmit');
    hide('userPill');
    hide('btnLogout');
    show('btnLogin');
  }
}

// SECTION 3: Register
async function handleRegister(e) {
  e.preventDefault();

  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl = document.getElementById('registerError');
  const btn = document.getElementById('registerBtn');

  errEl.classList.add('hidden');
  setButtonLoading(btn, true);

  try {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    setSession(data.token, data.user);
    updateNavForAuth();
    showToast(`Welcome, ${data.user.name}! 🎉`, 'success');

    document.getElementById('registerForm').reset();
    showPage('dashboard');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    setButtonLoading(btn, false);
  }
}

// SECTION 4: Login
async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  errEl.classList.add('hidden');
  setButtonLoading(btn, true);

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    setSession(data.token, data.user);
    updateNavForAuth();
    showToast(`Welcome back, ${data.user.name}!`, 'success');

    document.getElementById('loginForm').reset();
    showPage('dashboard');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    setButtonLoading(btn, false);
  }
}

// SECTION 5: Logout
function logout() {
  clearSession();
  updateNavForAuth();
  showToast('Logged out successfully', 'success');
  showPage('home');
}

// SECTION 6: Dashboard
async function loadDashboard() {
  try {
    const res = await fetch(`${API}/projects`, { headers: authHeaders() });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        logout();
        return;
      }
      throw new Error(data.error || 'Failed to load dashboard');
    }

    const projects = data.projects || [];
    const totalFiles = projects.reduce((acc, p) => acc + (p.file_count || 0), 0);

    document.getElementById('totalProjects').textContent = projects.length;
    document.getElementById('totalFiles').textContent = totalFiles;

    const grid = document.getElementById('projectsGrid');
    const empty = document.getElementById('emptyState');

    [...grid.children].forEach(c => {
      if (c.id !== 'emptyState') c.remove();
    });

    if (projects.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');

    projects.forEach(p => {
      const card = buildProjectCard(p);
      grid.appendChild(card);
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function buildProjectCard(p) {
  const div = document.createElement('div');
  div.className = 'project-card';

  div.innerHTML = `
    <div class="project-card-header">
      <div class="project-title">${escHtml(p.title)}</div>
      <span class="project-status">${escHtml(p.status || 'submitted')}</span>
    </div>

    <div class="project-desc">${escHtml(p.description || 'No description provided')}</div>

    ${p.tech_stack ? `<div class="project-tech">🛠 ${escHtml(p.tech_stack)}</div>` : ''}

    <div class="project-meta">
      <span>📎 ${p.file_count || 0} file(s)</span>
      <span>${formatDate(p.created_at)}</span>
    </div>

    <div class="project-actions" onclick="event.stopPropagation()">
      <button class="btn btn-ghost" style="font-size:0.8rem;padding:6px 12px"
        onclick="openProjectModal('${p.project_id}')">
        View Details
      </button>

      <button class="btn btn-primary" style="font-size:0.8rem;padding:6px 12px"
        onclick="goToUpload('${p.project_id}')">
        + Add File
      </button>

      <button class="btn btn-ghost" style="font-size:0.8rem;padding:6px 12px"
        onclick="openEditProject('${p.project_id}')">
        ✏️ Edit
      </button>

      <button class="btn btn-danger" style="font-size:0.8rem;padding:6px 12px;background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3)"
        onclick="deleteProject('${p.project_id}')">
        🗑
      </button>
    </div>
  `;

  return div;
}

// SECTION 7: Submit Project
async function handleProjectSubmit(e) {
  e.preventDefault();

  const title = document.getElementById('projTitle').value.trim();
  const description = document.getElementById('projDesc').value.trim();
  const tech_stack = document.getElementById('projTech').value.trim();
  const errEl = document.getElementById('submitError');
  const btn = document.getElementById('submitProjectBtn');

  errEl.classList.add('hidden');
  setButtonLoading(btn, true);

  try {
    const res = await fetch(`${API}/projects`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title, description, tech_stack })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submission failed');

    currentProjectId = data.project.project_id;
    showToast('Project saved! Now upload files.', 'success');

    document.getElementById('submitStep1').classList.add('hidden');
    document.getElementById('submitStep2').classList.remove('hidden');

    markStep(1, 'done');
    markStep(2, 'active');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    setButtonLoading(btn, false);
  }
}

// SECTION 8: File Upload
async function handleFiles(files) {
  console.log('Uploading to project:', currentProjectId);

  if (!currentProjectId) {
    showToast('No project selected for upload', 'error');
    return;
  }

  if (!files || files.length === 0) {
    showToast('No files selected', 'error');
    return;
  }

  for (const file of files) {
    await uploadFile(file);
  }
}

async function uploadFile(file) {
  const list = document.getElementById('fileList');
  const itemId = `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const item = document.createElement('div');
  item.className = 'file-item';
  item.id = itemId;

  item.innerHTML = `
    <span class="file-icon">${fileIcon(file.name)}</span>
    <span class="file-name">${escHtml(file.name)}</span>
    <span class="file-size">${formatSize(file.size)}</span>
    <span class="file-status uploading" id="status-${itemId}">⟳</span>
  `;

  list.appendChild(item);

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API}/files/upload/${currentProjectId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    });

    const data = await res.json();
    const statusEl = document.getElementById(`status-${itemId}`);

    if (res.ok) {
      statusEl.textContent = '✅';
      statusEl.classList.remove('uploading');
      showToast(`${file.name} uploaded!`, 'success');
    } else {
      statusEl.textContent = '❌';
      statusEl.classList.remove('uploading');
      showToast(data.error || 'Upload failed', 'error');
    }
  } catch (err) {
    document.getElementById(`status-${itemId}`).textContent = '❌';
    showToast(err.message, 'error');
  }
}

function finishSubmission() {
  document.getElementById('submitStep2').classList.add('hidden');
  document.getElementById('submitStep3').classList.remove('hidden');

  markStep(2, 'done');
  markStep(3, 'active');
}

function resetSubmitForm() {
  document.getElementById('projectForm').reset();
  document.getElementById('fileList').innerHTML = '';

  document.getElementById('submitStep1').classList.remove('hidden');
  document.getElementById('submitStep2').classList.add('hidden');
  document.getElementById('submitStep3').classList.add('hidden');

  markStep(1, 'active');
  markStep(2, '');
  markStep(3, '');

  currentProjectId = null;
}

function goToUpload(projectId) {
  resetSubmitForm();

  currentProjectId = projectId;

  showPage('submit');

  document.getElementById('submitStep1').classList.add('hidden');
  document.getElementById('submitStep2').classList.remove('hidden');
  document.getElementById('submitStep3').classList.add('hidden');

  markStep(1, 'done');
  markStep(2, 'active');
  markStep(3, '');
}

// SECTION 9: Edit Project
async function openEditProject(projectId) {
  try {
    const getRes = await fetch(`${API}/projects/${projectId}`, {
      headers: authHeaders()
    });

    const getData = await getRes.json();
    if (!getRes.ok) throw new Error(getData.error || 'Could not load project');

    const project = getData.project;

    const title = prompt('Edit project title:', project.title || '');
    if (title === null) return;

    const description = prompt('Edit description:', project.description || '');
    if (description === null) return;

    const tech_stack = prompt('Edit tech stack:', project.tech_stack || '');
    if (tech_stack === null) return;

    const res = await fetch(`${API}/projects/${projectId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ title, description, tech_stack })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Update failed');

    showToast('Project updated', 'success');
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// SECTION 10: Delete Project
async function deleteProject(projectId) {
  if (!confirm('Delete this project and all its files?')) return;

  try {
    const res = await fetch(`${API}/projects/${projectId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed');

    showToast('Project deleted', 'success');
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// SECTION 11: Project Detail Modal
async function openProjectModal(projectId) {
  try {
    const res = await fetch(`${API}/projects/${projectId}`, {
      headers: authHeaders()
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load project');

    const { project, files } = data;

    const filesHtml = files.length
      ? files.map(f => `
          <div class="file-item">
            <span class="file-icon">${fileIcon(f.original_name)}</span>

            <div style="flex:1">
              <div class="file-name">${escHtml(f.original_name)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted)">
                ${formatSize(f.file_size)} • ${formatDate(f.uploaded_at)}
              </div>
            </div>

            <button class="btn btn-ghost" style="font-size:0.75rem;padding:4px 10px"
              onclick="downloadFile('${f.file_url || f.url}', '${escHtml(f.original_name)}')">
              ⬇ Download
            </button>

            <button class="btn" style="font-size:0.75rem;padding:4px 10px;background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2)"
              onclick="deleteFile('${f.file_id}', '${projectId}')">
              🗑
            </button>
          </div>
        `).join('')
      : '<p style="color:var(--text-muted);font-size:0.9rem">No files uploaded yet.</p>';

    document.getElementById('modalContent').innerHTML = `
      <div class="modal-title">${escHtml(project.title)}</div>
      <span class="project-status">${escHtml(project.status || 'submitted')}</span>

      ${project.description ? `
        <div class="modal-section">
          <div class="modal-label">Description</div>
          <div class="modal-value">${escHtml(project.description)}</div>
        </div>
      ` : ''}

      ${project.tech_stack ? `
        <div class="modal-section">
          <div class="modal-label">Tech Stack</div>
          <div class="project-tech" style="margin-top:4px">🛠 ${escHtml(project.tech_stack)}</div>
        </div>
      ` : ''}

      <div class="modal-section">
        <div class="modal-label">Submitted</div>
        <div class="modal-value">${formatDate(project.created_at)}</div>
      </div>

      <hr class="modal-divider" />

      <div class="modal-section">
        <div class="modal-label">Files (${files.length})</div>
        <div style="margin-top:0.75rem;display:flex;flex-direction:column;gap:0.6rem">
          ${filesHtml}
        </div>
      </div>

      <div class="upload-info" style="margin-top:1.5rem">
        🗄️ Metadata stored in <strong>Supabase PostgreSQL</strong> &nbsp;|&nbsp;
        📦 Files in <strong>Supabase Storage</strong> 
        (bucket: ${escHtml(files[0]?.bucket_name || 'studentsubmission')})
      </div>

      <div style="margin-top:1.5rem;display:flex;gap:10px">
        <button class="btn btn-primary" onclick="goToUpload('${project.project_id}'); closeModal()">
          + Add File
        </button>

        <button class="btn btn-ghost" onclick="openEditProject('${project.project_id}')">
          ✏️ Edit Project
        </button>

        <button class="btn btn-ghost" onclick="closeModal()">
          Close
        </button>
      </div>
    `;

    document.getElementById('projectModal').classList.remove('hidden');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// SECTION 12: Download File
async function downloadFile(url, filename) {
  try {
    if (!url) throw new Error('File URL missing');

    const res = await fetch(url);
    if (!res.ok) throw new Error('File not found in storage');

    const blob = await res.blob();

    const link = document.createElement('a');
    const objectUrl = window.URL.createObjectURL(blob);

    link.href = objectUrl;
    link.download = filename || 'download';

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(objectUrl);
  } catch (err) {
    console.error('Download failed:', err);
    showToast(err.message || 'Download failed', 'error');
  }
}

// SECTION 13: Delete File
async function deleteFile(fileId, projectId) {
  console.log('🗑 deleteFile called:', { fileId, projectId });

  if (!confirm('Remove this file?')) return;

  try {
    const res = await fetch(`${API}/files/${fileId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    const data = await res.json();

    console.log('Delete response:', {
      status: res.status,
      ok: res.ok,
      data
    });

    if (!res.ok) {
      throw new Error(data.error || `Delete failed (${res.status})`);
    }

    showToast('File removed', 'success');

    await openProjectModal(projectId);
    await loadDashboard();
  } catch (err) {
    console.error('Delete error:', err);
    showToast(err.message, 'error');
  }
}

function closeModal() {
  document.getElementById('projectModal').classList.add('hidden');
}

// SECTION 14: Drag and Drop
function initDragDrop() {
  const zone = document.getElementById('uploadZone');
  if (!zone) return;

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });

  zone.addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
}

// SECTION 15: UI Helpers
function setButtonLoading(btn, loading) {
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');

  if (loading) {
    btn.disabled = true;
    text?.classList.add('hidden');
    loader?.classList.remove('hidden');
  } else {
    btn.disabled = false;
    text?.classList.remove('hidden');
    loader?.classList.add('hidden');
  }
}

function markStep(num, state) {
  const el = document.getElementById(`step${num}`);
  if (!el) return;

  el.classList.remove('active', 'done');
  if (state) el.classList.add(state);
}

let toastTimer;

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');

  el.textContent = `${type === 'success' ? '✅' : '❌'} ${msg}`;
  el.className = `toast ${type}`;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(iso) {
  if (!iso) return '—';

  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name = '') {
  const ext = name.split('.').pop().toLowerCase();

  const map = {
    pdf: '📄',
    zip: '🗜️',
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    gif: '🖼️',
    txt: '📝',
    doc: '📝',
    docx: '📝'
  };

  return map[ext] || '📎';
}

// SECTION 16: Boot
document.addEventListener('DOMContentLoaded', () => {
  updateNavForAuth();
  initDragDrop();

  document.getElementById('projectModal').addEventListener('click', e => {
    if (e.target.id === 'projectModal') closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  if (getToken()) {
    showPage('dashboard');
  } else {
    showPage('home');
  }
});

// GLOBAL EXPORTS FOR INLINE HTML onclick
window.showPage = showPage;
window.logout = logout;
window.handleRegister = handleRegister;
window.handleLogin = handleLogin;
window.handleProjectSubmit = handleProjectSubmit;
window.handleFiles = handleFiles;
window.finishSubmission = finishSubmission;
window.resetSubmitForm = resetSubmitForm;
window.goToUpload = goToUpload;
window.deleteProject = deleteProject;
window.openEditProject = openEditProject;
window.openProjectModal = openProjectModal;
window.downloadFile = downloadFile;
window.deleteFile = deleteFile;
window.closeModal = closeModal;