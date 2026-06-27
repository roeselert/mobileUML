import {
  EditorView, keymap, lineNumbers, highlightActiveLine,
  drawSelection, placeholder,
} from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, historyKeymap, history, indentWithTab } from '@codemirror/commands';
import {
  syntaxHighlighting, defaultHighlightStyle, bracketMatching,
} from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';

const DARK = window.matchMedia('(prefers-color-scheme: dark)').matches;

let _fontSize = parseInt(localStorage.getItem('mluml-fontsize') || '14', 10);
let _wrap = localStorage.getItem('mluml-wrap') === 'true';

export function getSettings() { return { fontSize: _fontSize, wrap: _wrap }; }

export function applyFontSize(px) {
  _fontSize = px;
  localStorage.setItem('mluml-fontsize', px);
  document.documentElement.style.setProperty('--editor-font-size', `${px}px`);
}

export function applyWrap(on) {
  _wrap = on;
  localStorage.setItem('mluml-wrap', on);
  document.dispatchEvent(new CustomEvent('cm-wrap', { detail: { on } }));
}

// Apply saved font size immediately so the CSS var is ready
applyFontSize(_fontSize);

const PLACEHOLDERS = {
  markdown:   '# Heading\n\nWrite Markdown here…',
  plantuml:   '@startuml\nAlice -> Bob: Hello\n@enduml',
  javascript: '// JavaScript\nconsole.log("Hello, world!");',
};

function getLang(type) {
  if (type === 'javascript') return javascript();
  if (type === 'markdown')   return markdown();
  return [];
}

export function createEditor(container, { type, source, onChange, onRun, onFocusPrev, onFocusNext }) {
  const wrapComp = new Compartment();

  const customKeys = keymap.of([
    {
      key: 'Mod-Enter',
      run: () => { onRun?.(); return true; },
    },
    {
      key: 'Mod-d',
      run: () => {
        container.dispatchEvent(new CustomEvent('cell-duplicate'));
        return true;
      },
    },
    {
      key: 'ArrowUp',
      run: v => {
        const { head, anchor } = v.state.selection.main;
        if (head !== anchor) return false;
        if (v.state.doc.lineAt(head).number === 1) { onFocusPrev?.(); return true; }
        return false;
      },
    },
    {
      key: 'ArrowDown',
      run: v => {
        const { head, anchor } = v.state.selection.main;
        if (head !== anchor) return false;
        if (v.state.doc.lineAt(head).number === v.state.doc.lines) { onFocusNext?.(); return true; }
        return false;
      },
    },
  ]);

  const extensions = [
    history(),
    lineNumbers(),
    highlightActiveLine(),
    drawSelection(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    customKeys,
    getLang(type),
    wrapComp.of(_wrap ? EditorView.lineWrapping : []),
    ...(DARK ? [oneDark] : [syntaxHighlighting(defaultHighlightStyle)]),
    ...(type === 'javascript' ? [bracketMatching()] : []),
    placeholder(PLACEHOLDERS[type] || ''),
    EditorView.updateListener.of(update => {
      if (update.docChanged) onChange?.(update.state.doc.toString());
    }),
  ];

  const view = new EditorView({
    state: EditorState.create({ doc: source, extensions }),
    parent: container,
  });

  const onWrapEvent = e => {
    view.dispatch({ effects: wrapComp.reconfigure(e.detail.on ? EditorView.lineWrapping : []) });
  };
  document.addEventListener('cm-wrap', onWrapEvent);

  return {
    getValue: () => view.state.doc.toString(),
    setValue: val => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: val } }),
    focus: () => view.focus(),
    destroy: () => { document.removeEventListener('cm-wrap', onWrapEvent); view.destroy(); },
  };
}
