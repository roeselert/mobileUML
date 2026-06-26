let _iframe = null;
let _ready = false;
let _queue = [];
let _execCounter = 0;
const _listeners = new Map();

const SANDBOX_HTML = `<!DOCTYPE html><html><body><script>
let _id = null;
['log','info','warn','error'].forEach(m => {
  const orig = console[m].bind(console);
  console[m] = (...args) => {
    orig(...args);
    parent.postMessage({
      type: 'log', level: m, execId: _id,
      args: args.map(a => {
        try { return typeof a === 'object' && a !== null ? JSON.stringify(a, null, 2) : String(a); }
        catch(e) { return '[unserializable]'; }
      })
    }, '*');
  };
});
window.addEventListener('message', async e => {
  const d = e.data;
  if (!d || d.type !== 'exec') return;
  _id = d.execId;
  try {
    const AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
    await new AsyncFn(d.code)();
    parent.postMessage({ type: 'done', execId: _id }, '*');
  } catch(err) {
    parent.postMessage({ type: 'error', execId: _id, message: err.message || String(err) }, '*');
  }
});
<\/script></body></html>`;

function ensureIframe() {
  if (_iframe) return;
  _iframe = document.createElement('iframe');
  _iframe.setAttribute('sandbox', 'allow-scripts');
  _iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;top:-9999px;left:-9999px';
  _iframe.addEventListener('load', () => {
    _ready = true;
    _queue.forEach(msg => _iframe.contentWindow.postMessage(msg, '*'));
    _queue = [];
  }, { once: true });
  _iframe.srcdoc = SANDBOX_HTML;
  document.body.appendChild(_iframe);

  window.addEventListener('message', e => {
    if (e.source !== _iframe.contentWindow) return;
    const { type, execId, level, args, message } = e.data || {};
    const cb = _listeners.get(execId);
    if (!cb) return;
    if (type === 'log') {
      cb.onLog({ level: level || 'log', args: args || [] });
    } else if (type === 'done') {
      _listeners.delete(execId);
      cb.onDone();
    } else if (type === 'error') {
      _listeners.delete(execId);
      cb.onError(message || 'Unknown error');
    }
  });
}

function send(msg) {
  if (_ready) {
    _iframe.contentWindow.postMessage(msg, '*');
  } else {
    _queue.push(msg);
  }
}

export function runCode(code, onLog, onError) {
  return new Promise(resolve => {
    ensureIframe();
    const execId = `exec-${++_execCounter}`;
    _listeners.set(execId, {
      onLog,
      onError: msg => { onError(msg); resolve(); },
      onDone: () => resolve(),
    });
    send({ type: 'exec', code, execId });
  });
}

export function reset() {
  if (_iframe) { _iframe.remove(); _iframe = null; }
  _ready = false;
  _queue = [];
  _listeners.clear();
}
