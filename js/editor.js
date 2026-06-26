export function attachEditor(textarea, { onRun, onMoveToAbove, onMoveToBelow }) {
  textarea.addEventListener('keydown', e => {
    const ctrl = e.metaKey || e.ctrlKey;

    if (ctrl && e.key === 'Enter') {
      e.preventDefault();
      onRun?.();
      return;
    }

    if (ctrl && e.key === 'd') {
      e.preventDefault();
      textarea.dispatchEvent(new CustomEvent('cell-duplicate'));
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end, value: v } = textarea;

      if (!e.shiftKey) {
        if (s === end) {
          textarea.value = v.slice(0, s) + '  ' + v.slice(end);
          textarea.selectionStart = textarea.selectionEnd = s + 2;
        } else {
          const lineStart = v.lastIndexOf('\n', s - 1) + 1;
          const block = v.slice(lineStart, end);
          const indented = block.replace(/^/gm, '  ');
          textarea.value = v.slice(0, lineStart) + indented + v.slice(end);
          textarea.selectionStart = lineStart;
          textarea.selectionEnd = lineStart + indented.length;
        }
      } else {
        const lineStart = v.lastIndexOf('\n', s - 1) + 1;
        const block = v.slice(lineStart, end);
        const dedented = block.replace(/^ {1,2}/gm, '');
        const diff = block.length - dedented.length;
        const cursorDiff = Math.min(2, v.slice(lineStart, s).match(/^ {1,2}/)?.[0].length ?? 0);
        textarea.value = v.slice(0, lineStart) + dedented + v.slice(end);
        textarea.selectionStart = Math.max(lineStart, s - cursorDiff);
        textarea.selectionEnd = lineStart + dedented.length;
        void diff;
      }

      textarea.dispatchEvent(new Event('input'));
      return;
    }

    if (e.key === 'ArrowUp' && !ctrl && !e.shiftKey && !e.altKey) {
      if (!textarea.value.slice(0, textarea.selectionStart).includes('\n')) {
        e.preventDefault();
        onMoveToAbove?.();
      }
      return;
    }

    if (e.key === 'ArrowDown' && !ctrl && !e.shiftKey && !e.altKey) {
      if (!textarea.value.slice(textarea.selectionStart).includes('\n')) {
        e.preventDefault();
        onMoveToBelow?.();
      }
      return;
    }
  });
}
