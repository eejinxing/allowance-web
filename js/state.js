// Shared app state, persistence and navigation. Pages never touch localStorage directly.
import * as E from './engine.js';
import { demoData, demoChat } from './demo.js';

// Sample data: shown until you choose "Use my data" (or open with ?real). ?demo turns it back on.
// Nothing is saved while sample data is showing, and your own saved data is never touched.
const DEMO_KEY = 'allowance.web.demo.v2'; // new key: sample data shows again for everyone who switched it off before
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
try { if (params.has('demo')) localStorage.removeItem(DEMO_KEY); if (params.has('real')) localStorage.setItem(DEMO_KEY, 'off'); } catch { /* storage blocked */ }
const demoOff = () => { try { return localStorage.getItem(DEMO_KEY) === 'off'; } catch { return false; } };
export const DEMO = params.has('demo') || (!params.has('real') && !demoOff());
export function leaveDemo() { try { localStorage.setItem(DEMO_KEY, 'off'); } catch { /* ignore */ } location.replace(location.pathname + location.hash); }
export function enterDemo() { try { localStorage.removeItem(DEMO_KEY); } catch { /* ignore */ } location.replace(location.pathname + location.hash); }

const DATA_KEY = 'allowance.web.v1';
const PREF_KEY = 'allowance.web.prefs';

function loadData() {
  let raw = null;
  try { raw = localStorage.getItem(DATA_KEY); } catch { /* storage blocked: start empty */ }
  if (!raw) return E.emptyData();
  try { return E.ensureMonths(E.normalize(JSON.parse(raw)), E.todayISO()); } catch (error) {
    // Never overwrite what we can't read: keep a copy before starting fresh.
    try { localStorage.setItem(DATA_KEY + '.unreadable', raw); } catch { /* ignore */ }
    console.warn('Could not read saved data', error);
    return E.emptyData();
  }
}
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
}

export const S = { data: DEMO ? demoData(E.todayISO()) : loadData(), prefs: loadPrefs(), today: E.todayISO(), route: 'home', chat: DEMO ? demoChat() : [], ui: {} };

let renderer = () => {};
export const setRenderer = (fn) => { renderer = fn; };
export const render = (opts) => renderer(opts);

export function persist() {
  if (DEMO) return true;
  try { const text = JSON.stringify(S.data); localStorage.setItem(DATA_KEY, text); mirrorWrite(text); return true; } catch { toast('Couldn’t save. Your browser may be blocking storage.'); return false; }
}

// ---------- a second copy, and asking the browser to keep it ----------
// Browsers may clear localStorage (low space, or Safari after a long time unused). So every save is also written to IndexedDB,
// and if the main copy ever comes back empty while that one still has your budget, it is restored. We also ask for "persistent" storage,
// which stops the browser clearing it on its own. None of this replaces a file backup: clearing website data in settings wipes both.
const IDB_NAME = 'allowance'; const IDB_STORE = 'kv';
const idbRun = (mode, fn) => new Promise((resolve, reject) => {
  const open = indexedDB.open(IDB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(IDB_STORE);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result; const tx = db.transaction(IDB_STORE, mode); const req = fn(tx.objectStore(IDB_STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  };
});
function mirrorWrite(text) { if (typeof indexedDB !== 'undefined') idbRun('readwrite', (s) => s.put(text, DATA_KEY)).catch(() => {}); }

/** Run once at start: ask for persistent storage, restore from the second copy if the main one is empty, otherwise refresh that copy. */
export async function protectData() {
  if (DEMO) return;
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
  if (typeof indexedDB === 'undefined') return;
  try {
    if (S.data.settings) return mirrorWrite(JSON.stringify(S.data));
    const text = await idbRun('readonly', (s) => s.get(DATA_KEY));
    const saved = text ? E.decodeBackup(text, S.today) : null;
    if (saved?.settings) { replaceData(saved); toast('Restored your budget from the backup copy on this device'); }
  } catch { /* no second copy, or unreadable: carry on with what we have */ }
}
/** Whether the browser promised not to clear our data on its own (null when it can't tell). */
export async function storageIsPersistent() { try { return (await navigator.storage?.persisted?.()) ?? null; } catch { return null; } }
export function savePrefs() { if (DEMO) return; try { localStorage.setItem(PREF_KEY, JSON.stringify(S.prefs)); } catch { /* ignore */ } }

/** Applies a change to the data, validates it, saves and redraws. Throws a readable Error on a rule violation. */
export function commit(transform, message = 'Saved') {
  const next = E.ensureMonths(transform(S.data), S.today);
  E.validate(next);
  S.data = next;
  persist();
  if (message) toast(message);
  render({ keepAnimations: true });
}

export function replaceData(next) { S.data = next; persist(); render(); }

// ---------- toast ----------
let toastTimer;
export function toast(message) {
  const host = document.getElementById('toast');
  if (!host) return;
  host.innerHTML = `<span role="status"></span>`;
  const el = host.firstChild; el.textContent = message;
  requestAnimationFrame(() => el.classList.add('on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2800);
}

// ---------- navigation ----------
export const TABS = ['home', 'analytics', 'ai', 'goals', 'wallet', 'swaps'];
export function go(route, { push = true } = {}) {
  if (S.route === route) return;
  S.route = route;
  if (push) history.pushState({ route }, '', '#' + route);
  render();
}
window.addEventListener('popstate', (e) => { S.route = e.state?.route || (location.hash.slice(1) || 'home'); render(); });
