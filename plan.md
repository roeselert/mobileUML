# mobileUML — PWA Design Plan

## Context

`README.md` specifies a small, Jupyter-like PWA for authoring **AI-agent specs** that mix
**Markdown text**, **PlantUML diagrams**, and **JavaScript** in one document. It must be a pure
static app (HTML/CSS/JS only, all third-party deps via CDN), persist documents in the browser,
support import/export to disk, and be hosted as an installable PWA on GitHub Pages.

The repository currently contains only `README.md` — this is a greenfield build. There is no
existing code to reuse, so the plan below establishes the full structure.

**Locked decisions (confirmed with user):**
- On-disk format: **JSON notebook** (`.json`) — `{version, title, cells:[{id,type,source}]}`.
- Storage: **multiple named documents** in **IndexedDB**.
- JS execution: **sandboxed iframe** with `postMessage` console capture.
- PlantUML output: **SVG** via the public PlantUML proxy.
- No build step, no npm — ES modules + CDN libraries only.

## Architecture

Static file layout (all paths **relative** so it works under the GitHub Pages subpath
`https://<user>.github.io/mobileUML/`):

```
index.html                 app shell + toolbar + sidebar + notebook container
manifest.webmanifest       PWA manifest (name, icons, start_url "./", display standalone)
sw.js                      service worker: cache app shell + CDN libs (offline support)
css/styles.css             mobile-first, responsive, large tap targets
js/app.js                  entry (type=module): bootstraps state, wires UI, registers SW
js/store.js                IndexedDB wrapper: list/get/put/delete documents
js/notebook.js             notebook model + cell ops (add/delete/move/duplicate)
js/cell.js                 renders one cell: editor + toolbar + output area
js/editor.js               custom keyboard handling for textareas
js/markdown.js             marked + DOMPurify rendering
js/plantuml.js             text -> deflate -> PlantUML base64 -> proxy SVG URL
js/sandbox.js              persistent hidden sandboxed iframe; run code, stream logs
js/fileio.js               import/export JSON notebooks
icons/icon-192.png, icon-512.png   PWA icons
```

**CDN libraries** (loaded via `<script type="importmap">` or direct ESM CDN imports):
- `marked` — Markdown → HTML
- `dompurify` — sanitize rendered HTML
- `pako` — raw DEFLATE for PlantUML encoding

## Data model

Persisted document (IndexedDB store `documents`, keyPath `id`):
```js
{ id, name, createdAt, updatedAt,
  notebook: { version: 1, title, cells: [ { id, type, source } ] } }
```
- `type` ∈ `"markdown" | "plantuml" | "javascript"`.
- Rendered outputs are **ephemeral** (not persisted) — re-render/re-run on demand.
- Export writes only the inner `notebook` object as `<name>.json`; import wraps it in a new
  document record. Validate `version` and `cells` shape on import.

## Component details

**store.js** — minimal promise wrapper around IndexedDB (`open`, `getAll`, `get`, `put`,
`delete`). Single DB `mobileuml`, store `documents`. Used for the sidebar document list,
auto-save (debounced on edit), create/rename/delete.

**notebook.js** — pure model. `addCell(type, atIndex)`, `deleteCell(id)`, `moveCell(id, dir)`,
`duplicateCell(id)`, `updateSource(id, text)`. Generates cell ids (counter + timestamp seed,
since `Math.random`/`Date.now` are fine in the app itself). Emits a change event that triggers
debounced save via store.js.

**cell.js** — per-cell DOM: a `<textarea>` editor, a toolbar (Run/Render, type label,
move up/down, duplicate, delete), and an output `<div>`. Dispatches to markdown/plantuml/sandbox
based on type. Auto-grows textarea height to content.

**editor.js** — custom keyboard handling attached to each textarea (satisfies README's
"custom keyboard extension: arrow keys, tab, paste, copy"):
- `Tab` / `Shift+Tab`: insert / remove 2-space indent (preventDefault to stop focus change),
  works on multi-line selections.
- `Ctrl/Cmd+Enter`: run/render the current cell.
- `ArrowUp`/`ArrowDown` at the first/last line boundary: move focus to the previous/next cell
  editor (cell navigation).
- Native copy/paste preserved; add `Ctrl/Cmd+D` to duplicate the cell. Multi-line paste keeps
  indentation.

**markdown.js** — `render(source) -> safeHTML` using `marked` then `DOMPurify.sanitize`.
Output injected into the cell's output div.

**plantuml.js** — `encode(text)`:
1. `new TextEncoder().encode(text)`
2. `pako.deflateRaw(bytes, { level: 9 })`
3. encode bytes with PlantUML's base64 alphabet (`0-9A-Za-z-_`, the standard 3-byte→4-char
   `encode64`/`append3bytes` routine).
Then build `https://www.plantuml.com/plantuml/svg/<encoded>` and set it as an `<img src>` in the
output div (show a spinner; handle `onerror` → message to retry / check network). SVG endpoint
chosen for crisp scaling on mobile.

**sandbox.js** — one persistent hidden `<iframe sandbox="allow-scripts">` whose `srcdoc`
bootstrap overrides `console.log/info/warn/error` to `parent.postMessage({type:'log',...})`,
runs posted user code in `try/catch`, and posts completion/errors. The parent assigns each run an
`execId`, posts `{code, execId}`, and appends streamed messages (including async logs from
timers/promises) to that cell's output. Sandbox is cross-origin (no `allow-same-origin`) so user
code cannot touch the app/DOM. Provide a "Reset sandbox" action that reloads the iframe for a
clean global scope.

**app.js** — builds the toolbar (new doc, import, export, document name), renders the document
sidebar from `store.getAll()`, loads the selected notebook, wires add-cell buttons, and registers
the service worker (`navigator.serviceWorker.register('./sw.js')`). Debounced auto-save on any
cell change.

**sw.js** — install: pre-cache app shell (`./`, `index.html`, css, all `js/*`, manifest, icons).
Fetch: cache-first for same-origin shell and CDN libs (stale-while-revalidate), so the app works
offline after first load. Bump a `CACHE_VERSION` constant to invalidate.

## UI / UX

- Mobile-first single-column notebook; toolbar collapses to icons on narrow screens; sidebar is a
  slide-over drawer on mobile, fixed column on desktop.
- "Add cell" control offers the three types; each cell shows its type and Run/Render + output.
- Light/dark via `prefers-color-scheme`.

## Verification

1. **Serve locally:** `python3 -m http.server 8000` in repo root; open
   `http://localhost:8000/`.
2. **Markdown cell:** type Markdown, Render → sanitized HTML appears below.
3. **PlantUML cell:** enter `@startuml ... @enduml`, Render → SVG from proxy appears (requires
   network). Verify a deliberately broken diagram surfaces a readable error.
4. **JavaScript cell:** run `console.log(1+1)` and an async `setTimeout(()=>console.log('later'),100)`
   → both appear in output; throw an error → caught and shown; confirm code can't reach the parent
   DOM. Test "Reset sandbox".
5. **Keyboard:** Tab/Shift+Tab indent; Ctrl/Cmd+Enter runs cell; Up/Down crosses cell boundaries;
   copy/paste works.
6. **Persistence:** create/rename/delete docs; reload page → documents and content restored from
   IndexedDB.
7. **Import/export:** export a `.json`, edit, re-import → round-trips identically; malformed JSON
   shows a clear error.
8. **PWA:** Chrome DevTools → Application: manifest valid, service worker active, app installable;
   reload offline → app shell loads. Run Lighthouse PWA audit.
9. **GitHub Pages:** confirm all asset paths are relative (no leading `/`) so it works under the
   `/mobileUML/` subpath; enable Pages on the `main` branch root.

## Out of scope (initial version)

- Collaborative editing, auth, or a backend.
- Persisting rendered outputs in the saved document.
- Syntax highlighting in the editor (could add highlight.js via CDN later).
