import * as store from './store.js';
import * as nb from './notebook.js';
import { createCell } from './cell.js';
import { exportNotebook, exportMarkdown, importNotebook } from './fileio.js';
import { reset as resetSandbox } from './sandbox.js';
import { getSettings, applyFontSize } from './cm-editor.js';

let saveTimer = null;

// ── Init ────────────────────────────────────────────────

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW:', err));
  }

  // Wire toolbar
  document.getElementById('btn-sidebar').addEventListener('click', toggleSidebar);
  document.getElementById('btn-new').addEventListener('click', newDoc);
  document.getElementById('btn-import').addEventListener('click', importDoc);
  document.getElementById('btn-export').addEventListener('click', exportDoc);
  document.getElementById('btn-export-md').addEventListener('click', exportDocMd);
  document.getElementById('btn-reset-js').addEventListener('click', () => {
    resetSandbox();
    showToast('Sandbox reset');
  });
  document.getElementById('doc-title').addEventListener('change', renameDoc);
  document.getElementById('doc-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') e.target.blur();
  });

  // Wire add-cell buttons
  document.getElementById('btn-add-md').addEventListener('click',  () => addCell('markdown'));
  document.getElementById('btn-add-uml').addEventListener('click', () => addCell('plantuml'));
  document.getElementById('btn-add-js').addEventListener('click',  () => addCell('javascript'));

  // Wire sidebar overlay
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

  // ── Editor settings ──────────────────────────────────
  const { fontSize } = getSettings();

  const fontSizeEl = document.getElementById('editor-font-size');
  fontSizeEl.value = fontSize;
  fontSizeEl.addEventListener('change', () => applyFontSize(parseInt(fontSizeEl.value, 10)));

  // Model changes → auto-save
  nb.onchange(scheduleAutoSave);

  // Load documents
  const docs = (await store.getAll()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  await refreshSidebar();

  if (docs.length > 0) {
    await loadDoc(docs[0].id);
  } else {
    await newDoc();
  }
}

// ── Document operations ─────────────────────────────────

async function newDoc() {
  const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const doc = {
    id,
    name: 'Untitled',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    notebook: {
      version: 1,
      title: 'Untitled',
      cells: [{ id: `cell-1-${Date.now()}`, type: 'markdown', source: '' }],
    },
  };
  await store.put(doc);
  await loadDoc(id);
}

async function loadDoc(id) {
  const doc = await store.get(id);
  if (!doc) return;
  nb.setDoc(doc);
  document.getElementById('doc-title').value = doc.name || '';
  renderNotebook();
  await refreshSidebar();
  closeSidebar();
}

async function renameDoc() {
  const doc = nb.getDoc();
  if (!doc) return;
  const name = document.getElementById('doc-title').value.trim() || 'Untitled';
  doc.name = name;
  doc.notebook.title = name;
  doc.updatedAt = Date.now();
  await store.put(doc);
  await refreshSidebar();
}

async function exportDoc() {
  const doc = nb.getDoc();
  if (!doc) { alert('No document loaded.'); return; }
  exportNotebook(doc);
}

async function exportDocMd() {
  const doc = nb.getDoc();
  if (!doc) { alert('No document loaded.'); return; }
  exportMarkdown(doc);
}

async function importDoc() {
  const doc = await importNotebook();
  if (!doc) return;
  await store.put(doc);
  await loadDoc(doc.id);
  await refreshSidebar();
}

// ── Sidebar ─────────────────────────────────────────────

async function refreshSidebar() {
  const current = nb.getDoc()?.id;
  const docs = (await store.getAll()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const list = document.getElementById('doc-list');
  list.innerHTML = '';

  for (const doc of docs) {
    const item = document.createElement('div');
    item.className = 'doc-item' + (doc.id === current ? ' active' : '');

    const name = document.createElement('span');
    name.className = 'doc-name';
    name.textContent = doc.name || 'Untitled';

    const del = document.createElement('button');
    del.className = 'doc-delete';
    del.title = 'Delete document';
    del.textContent = '✕';
    del.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Delete "${doc.name || 'Untitled'}"?`)) return;
      await store.remove(doc.id);
      const remaining = (await store.getAll()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (doc.id === current) {
        if (remaining.length > 0) {
          await loadDoc(remaining[0].id);
        } else {
          nb.setDoc(null);
          document.getElementById('doc-title').value = '';
          destroyAndClear();
          await refreshSidebar();
          await newDoc();
        }
      } else {
        await refreshSidebar();
      }
    });

    item.append(name, del);
    item.addEventListener('click', () => loadDoc(doc.id));
    list.appendChild(item);
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const open = sidebar.classList.toggle('open');
  overlay.classList.toggle('visible', open);
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

// ── Notebook rendering ──────────────────────────────────

function destroyAndClear() {
  const container = document.getElementById('notebook');
  container.querySelectorAll('.cell').forEach(el => el._destroy?.());
  container.innerHTML = '';
}

function renderNotebook() {
  destroyAndClear();
  const doc = nb.getDoc();
  if (!doc) return;
  const container = document.getElementById('notebook');
  for (const cell of doc.notebook.cells) {
    container.appendChild(createCell(cell, makeCellCallbacks()));
  }
}

function makeCellCallbacks() {
  return {
    onUpdate(id, text) { nb.updateSource(id, text); },
    onDelete(id) { nb.deleteCell(id); renderNotebook(); },
    onMoveUp(id) { nb.moveCell(id, 'up'); renderNotebook(); focusCell(id); },
    onMoveDown(id) { nb.moveCell(id, 'down'); renderNotebook(); focusCell(id); },
    onDuplicate(id) {
      const copy = nb.duplicateCell(id);
      renderNotebook();
      if (copy) focusCell(copy.id);
    },
    onFocusPrev(id) { focusRelative(id, -1); },
    onFocusNext(id) { focusRelative(id, 1); },
  };
}

function focusCell(id) {
  const el = document.querySelector(`.cell[data-id="${id}"]`);
  el?._focus?.();
}

function focusRelative(id, offset) {
  const cells = [...document.querySelectorAll('.cell')];
  const idx = cells.findIndex(c => c.dataset.id === id);
  cells[idx + offset]?._focus?.();
}

// ── Add cell ────────────────────────────────────────────

function addCell(type) {
  const doc = nb.getDoc();
  if (!doc) return;
  const focused = document.activeElement?.closest('.cell');
  let atIndex;
  if (focused) {
    const idx = doc.notebook.cells.findIndex(c => c.id === focused.dataset.id);
    if (idx !== -1) atIndex = idx + 1;
  }
  const cell = nb.addCell(type, atIndex);
  renderNotebook();
  requestAnimationFrame(() => focusCell(cell.id));
}

// ── Auto-save ────────────────────────────────────────────

function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const doc = nb.getDoc();
    if (!doc) return;
    doc.updatedAt = Date.now();
    await store.put(doc);
  }, 600);
}

// ── Toast ────────────────────────────────────────────────

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = [
      'position:fixed;bottom:20px;left:50%;transform:translateX(-50%)',
      'background:#333;color:#fff;padding:8px 16px;border-radius:6px',
      'font-size:.85rem;z-index:9999;pointer-events:none;opacity:0',
      'transition:opacity .2s',
    ].join(';');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2000);
}

init().catch(console.error);
