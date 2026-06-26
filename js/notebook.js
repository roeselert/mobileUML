let _doc = null;
let _onChange = null;
let _counter = 0;

function genId() {
  return `cell-${++_counter}-${Date.now()}`;
}

function emit() {
  if (_onChange) _onChange(_doc);
}

export function setDoc(doc) { _doc = doc; }
export function getDoc() { return _doc; }
export function onchange(fn) { _onChange = fn; }

export function addCell(type, atIndex) {
  const cell = { id: genId(), type, source: '' };
  const cells = _doc.notebook.cells;
  if (atIndex === undefined || atIndex >= cells.length) {
    cells.push(cell);
  } else {
    cells.splice(atIndex, 0, cell);
  }
  emit();
  return cell;
}

export function deleteCell(id) {
  const cells = _doc.notebook.cells;
  const idx = cells.findIndex(c => c.id === id);
  if (idx !== -1) { cells.splice(idx, 1); emit(); }
}

export function moveCell(id, dir) {
  const cells = _doc.notebook.cells;
  const idx = cells.findIndex(c => c.id === id);
  if (idx === -1) return;
  const to = idx + (dir === 'up' ? -1 : 1);
  if (to < 0 || to >= cells.length) return;
  [cells[idx], cells[to]] = [cells[to], cells[idx]];
  emit();
}

export function duplicateCell(id) {
  const cells = _doc.notebook.cells;
  const idx = cells.findIndex(c => c.id === id);
  if (idx === -1) return null;
  const copy = { id: genId(), type: cells[idx].type, source: cells[idx].source };
  cells.splice(idx + 1, 0, copy);
  emit();
  return copy;
}

export function updateSource(id, text) {
  const cell = _doc.notebook.cells.find(c => c.id === id);
  if (cell) { cell.source = text; emit(); }
}
