function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function exportNotebook(doc) {
  const json = JSON.stringify(doc.notebook, null, 2);
  const safe = (doc.name || 'notebook').replace(/[^\w\-. ]/g, '_');
  triggerDownload(new Blob([json], { type: 'application/json' }), `${safe}.json`);
}

export function exportMarkdown(doc) {
  const lines = [];
  const title = doc.name || 'Untitled';
  lines.push(`# ${title}`, '');

  for (const cell of doc.notebook.cells) {
    const src = cell.source.trimEnd();
    if (!src) continue;
    if (cell.type === 'markdown') {
      lines.push(src, '');
    } else if (cell.type === 'plantuml') {
      lines.push('```plantuml', src, '```', '');
    } else if (cell.type === 'javascript') {
      lines.push('```javascript', src, '```', '');
    }
  }

  const safe = title.replace(/[^\w\-. ]/g, '_');
  triggerDownload(new Blob([lines.join('\n')], { type: 'text/markdown' }), `${safe}.md`);
}

export function importNotebook() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) { resolve(null); return; }
      try {
        const text = await file.text();
        const notebook = JSON.parse(text);
        if (typeof notebook.version !== 'number' || !Array.isArray(notebook.cells)) {
          throw new Error('Invalid format: expected { version, cells[] }');
        }
        const validTypes = new Set(['markdown', 'plantuml', 'javascript', 'aichat']);
        for (const cell of notebook.cells) {
          if (!cell.id || typeof cell.source !== 'string' || !validTypes.has(cell.type)) {
            throw new Error(`Invalid cell: ${JSON.stringify(cell)}`);
          }
        }
        const doc = {
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: notebook.title || file.name.replace(/\.json$/i, ''),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          notebook,
        };
        resolve(doc);
      } catch (err) {
        alert(`Import failed: ${err.message}`);
        resolve(null);
      }
    });
    input.click();
  });
}
