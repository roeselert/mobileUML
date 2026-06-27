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

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const TYPE_BADGE  = { javascript: 'js', plantuml: 'uml', aichat: 'ai', markdown: 'md' };
const RUN_LABEL   = { javascript: '▶ Run', aichat: '▶ Ask', markdown: '⟳ Render', plantuml: '⟳ Render' };
const RUN_TITLE   = { javascript: 'Run (Ctrl+Enter)', aichat: 'Ask AI (Ctrl+Enter)', markdown: 'Render (Ctrl+Enter)', plantuml: 'Render (Ctrl+Enter)' };

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
  typeBadge.textContent = TYPE_BADGE[cellData.type] || 'md';

  const runBtn = document.createElement('button');
  runBtn.className = 'btn btn-run';
  runBtn.textContent = RUN_LABEL[cellData.type] || '▶ Run';
  runBtn.title = RUN_TITLE[cellData.type] || 'Run (Ctrl+Enter)';

  const spacer = document.createElement('span');
  spacer.className = 'cell-toolbar-spacer';

  const wrapBtn = btn('↵', 'Toggle line wrap for this cell');
  const upBtn   = btn('↑', 'Move up');
  const downBtn = btn('↓', 'Move down');
  const dupBtn  = btn('⎘', 'Duplicate (Ctrl+D)');
  const delBtn  = btn('✕', 'Delete', 'btn-danger');

  toolbar.append(typeBadge, runBtn, spacer, wrapBtn, upBtn, downBtn, dupBtn, delBtn);

  // ── AI config bar (aichat only) ───────────────────────
  let modelInput = null;
  let tokenInput = null;

  if (cellData.type === 'aichat') {
    const configBar = document.createElement('div');
    configBar.className = 'cell-ai-config';

    modelInput = document.createElement('input');
    modelInput.type = 'text';
    modelInput.className = 'ai-model-input';
    modelInput.placeholder = 'Model ID  (e.g. HuggingFaceH4/zephyr-7b-beta)';
    modelInput.value = cellData.config?.model || '';
    modelInput.spellcheck = false;
    modelInput.autocomplete = 'off';

    tokenInput = document.createElement('input');
    tokenInput.type = 'password';
    tokenInput.className = 'ai-token-input';
    tokenInput.placeholder = 'HF Token  (hf_...)';
    tokenInput.value = cellData.config?.token || '';
    tokenInput.autocomplete = 'off';

    const saveConfig = () => callbacks.onConfigUpdate(cellData.id, {
      model: modelInput.value,
      token: tokenInput.value,
    });
    modelInput.addEventListener('input', saveConfig);
    tokenInput.addEventListener('input', saveConfig);

    configBar.append(modelInput, tokenInput);
    el.append(toolbar, configBar);
  } else {
    el.appendChild(toolbar);
  }

  // ── Editor + output ───────────────────────────────────
  const editorWrap = document.createElement('div');
  editorWrap.className = 'cell-editor-wrap';

  const output = document.createElement('div');
  output.className = 'cell-output';

  el.append(editorWrap, output);

  // ── Execute / render ──────────────────────────────────
  let editor;

  function showErr(msg) {
    const d = document.createElement('div');
    d.className = 'output-error';
    d.textContent = msg;
    output.appendChild(d);
  }

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
        showErr('Failed to render. Check diagram syntax and network connection.');
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

    } else if (cellData.type === 'aichat') {
      const model = modelInput.value.trim();
      const token = tokenInput.value.trim();
      if (!model) { showErr('Enter a Model ID in the cell config.'); return; }
      if (!token) { showErr('Enter a HuggingFace token (hf_...) in the cell config.'); return; }

      const spinner = document.createElement('div');
      spinner.className = 'output-spinner';
      spinner.textContent = `Calling ${model}…`;
      output.appendChild(spinner);

      try {
        const resp = await fetch('https://api-inference.huggingface.co/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: src }],
            max_tokens: 1024,
          }),
        });

        spinner.remove();

        if (!resp.ok) {
          const errText = await resp.text();
          showErr(`API error ${resp.status}: ${escHtml(errText)}`);
          return;
        }

        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content ?? JSON.stringify(data, null, 2);
        output.innerHTML = renderMarkdown(text);
      } catch (e) {
        spinner.remove();
        showErr(`Fetch error: ${e.message}`);
      }
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

  editorWrap.addEventListener('cell-duplicate', () => callbacks.onDuplicate(cellData.id));

  // ── Toolbar events ────────────────────────────────────
  runBtn.addEventListener('click',  execute);
  upBtn.addEventListener('click',   () => callbacks.onMoveUp(cellData.id));
  downBtn.addEventListener('click', () => callbacks.onMoveDown(cellData.id));
  dupBtn.addEventListener('click',  () => callbacks.onDuplicate(cellData.id));
  delBtn.addEventListener('click',  () => callbacks.onDelete(cellData.id));

  let wrapOn = false;
  wrapBtn.addEventListener('click', () => {
    wrapOn = !wrapOn;
    editor.setWrap(wrapOn);
    wrapBtn.classList.toggle('active', wrapOn);
  });

  el._focus   = () => editor.focus();
  el._destroy = () => editor.destroy();

  return el;
}
