import { render as renderMarkdown } from './markdown.js';
import { getUrl as plantumlUrl } from './plantuml.js';
import { runCode } from './sandbox.js';
import { attachEditor } from './editor.js';

function btn(label, title, cls = '') {
  const b = document.createElement('button');
  b.className = `btn btn-icon ${cls}`;
  b.textContent = label;
  b.title = title;
  return b;
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

const PLACEHOLDER = {
  markdown: '# Heading\n\nWrite **Markdown** here…',
  plantuml: '@startuml\nAlice -> Bob: Hello\n@enduml',
  javascript: '// JavaScript\nconsole.log("Hello, world!");',
};

export function createCell(cellData, callbacks) {
  const el = document.createElement('div');
  el.className = 'cell';
  el.dataset.id = cellData.id;
  el.dataset.type = cellData.type;

  // ── Toolbar ──────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.className = 'cell-toolbar';

  const typeBadge = document.createElement('span');
  typeBadge.className = 'cell-type-badge';
  typeBadge.textContent = cellData.type === 'javascript' ? 'js'
    : cellData.type === 'plantuml' ? 'uml' : 'md';

  const isJs = cellData.type === 'javascript';
  const runBtn = document.createElement('button');
  runBtn.className = 'btn btn-run';
  runBtn.textContent = isJs ? '▶ Run' : '⟳ Render';
  runBtn.title = isJs ? 'Run (Ctrl+Enter)' : 'Render (Ctrl+Enter)';

  const spacer = document.createElement('span');
  spacer.className = 'cell-toolbar-spacer';

  const upBtn    = btn('↑', 'Move up');
  const downBtn  = btn('↓', 'Move down');
  const dupBtn   = btn('⎘', 'Duplicate (Ctrl+D)');
  const delBtn   = btn('✕', 'Delete', 'btn-danger');

  toolbar.append(typeBadge, runBtn, spacer, upBtn, downBtn, dupBtn, delBtn);

  // ── Textarea ─────────────────────────────────────────
  const ta = document.createElement('textarea');
  ta.className = 'cell-editor';
  ta.value = cellData.source;
  ta.placeholder = PLACEHOLDER[cellData.type] || '';
  ta.spellcheck = false;
  ta.autocomplete = 'off';
  Object.assign(ta, { autocorrect: 'off', autocapitalize: 'none' });
  ta.rows = 3;

  // ── Output ────────────────────────────────────────────
  const output = document.createElement('div');
  output.className = 'cell-output';

  el.append(toolbar, ta, output);

  // ── Rendering ────────────────────────────────────────
  async function execute() {
    output.innerHTML = '';
    const src = ta.value.trim();
    if (!src) return;

    if (cellData.type === 'markdown') {
      output.innerHTML = renderMarkdown(src);

    } else if (cellData.type === 'plantuml') {
      const spinner = document.createElement('div');
      spinner.className = 'output-spinner';
      spinner.textContent = 'Rendering diagram…';
      output.appendChild(spinner);

      const img = document.createElement('img');
      img.className = 'plantuml-img';
      img.alt = 'PlantUML diagram';
      img.onload = () => { spinner.remove(); output.appendChild(img); };
      img.onerror = () => {
        spinner.remove();
        const e = document.createElement('div');
        e.className = 'output-error';
        e.textContent = 'Failed to render. Check diagram syntax and network connection.';
        output.appendChild(e);
      };
      img.src = plantumlUrl(ta.value);

    } else if (cellData.type === 'javascript') {
      const log = document.createElement('div');
      log.className = 'js-output';
      output.appendChild(log);

      await runCode(
        ta.value,
        ({ level, args }) => {
          const line = document.createElement('div');
          line.className = `log-${level}`;
          line.textContent = args.join(' ');
          log.appendChild(line);
          output.scrollTop = output.scrollHeight;
        },
        msg => {
          const line = document.createElement('div');
          line.className = 'output-error';
          line.textContent = `Error: ${msg}`;
          log.appendChild(line);
        }
      );
    }
  }

  // ── Events ────────────────────────────────────────────
  runBtn.addEventListener('click', execute);

  upBtn.addEventListener('click',   () => callbacks.onMoveUp(cellData.id));
  downBtn.addEventListener('click', () => callbacks.onMoveDown(cellData.id));
  dupBtn.addEventListener('click',  () => callbacks.onDuplicate(cellData.id));
  delBtn.addEventListener('click',  () => callbacks.onDelete(cellData.id));

  ta.addEventListener('input', () => {
    autoGrow(ta);
    callbacks.onUpdate(cellData.id, ta.value);
  });

  ta.addEventListener('cell-duplicate', () => callbacks.onDuplicate(cellData.id));

  attachEditor(ta, {
    onRun: execute,
    onMoveToAbove: () => callbacks.onFocusPrev(cellData.id),
    onMoveToBelow: () => callbacks.onFocusNext(cellData.id),
  });

  // Expose textarea for external focus
  el._textarea = ta;
  el._autoGrow = () => autoGrow(ta);

  requestAnimationFrame(() => autoGrow(ta));

  return el;
}
