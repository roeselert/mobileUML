import { createEditor } from './cm-editor.js';
import { render as renderMarkdown } from './markdown.js';
import { getUrl as plantumlUrl } from './plantuml.js';
import { runCode } from './sandbox.js';

function btn(label, title, cls = '') {
  const b = document.createElement('button');
  b.className = `btn btn-icon ${cls}`;
  b.textContent = label;
  b.title = title;
  return b;
}

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

  const upBtn   = btn('↑', 'Move up');
  const downBtn = btn('↓', 'Move down');
  const dupBtn  = btn('⎘', 'Duplicate (Ctrl+D)');
  const delBtn  = btn('✕', 'Delete', 'btn-danger');

  toolbar.append(typeBadge, runBtn, spacer, upBtn, downBtn, dupBtn, delBtn);

  // ── Editor container ──────────────────────────────────
  const editorWrap = document.createElement('div');
  editorWrap.className = 'cell-editor-wrap';

  // ── Output ────────────────────────────────────────────
  const output = document.createElement('div');
  output.className = 'cell-output';

  el.append(toolbar, editorWrap, output);

  // execute references editor; define before createEditor so the closure captures it
  let editor;

  async function execute() {
    output.innerHTML = '';
    const src = editor.getValue().trim();
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
      img.src = plantumlUrl(editor.getValue());

    } else if (cellData.type === 'javascript') {
      const log = document.createElement('div');
      log.className = 'js-output';
      output.appendChild(log);

      await runCode(
        editor.getValue(),
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

  // ── Create CM editor ──────────────────────────────────
  editor = createEditor(editorWrap, {
    type: cellData.type,
    source: cellData.source,
    onChange: text => callbacks.onUpdate(cellData.id, text),
    onRun: execute,
    onFocusPrev: () => callbacks.onFocusPrev(cellData.id),
    onFocusNext: () => callbacks.onFocusNext(cellData.id),
  });

  // Ctrl+D duplicate event bubbles up from cm-editor.js
  editorWrap.addEventListener('cell-duplicate', () => callbacks.onDuplicate(cellData.id));

  // ── Toolbar events ────────────────────────────────────
  runBtn.addEventListener('click',  execute);
  upBtn.addEventListener('click',   () => callbacks.onMoveUp(cellData.id));
  downBtn.addEventListener('click', () => callbacks.onMoveDown(cellData.id));
  dupBtn.addEventListener('click',  () => callbacks.onDuplicate(cellData.id));
  delBtn.addEventListener('click',  () => callbacks.onDelete(cellData.id));

  // ── Expose focus / destroy ────────────────────────────
  el._focus   = () => editor.focus();
  el._destroy = () => editor.destroy();

  return el;
}
