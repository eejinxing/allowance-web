// Settings: profile, appearance, backup and restore, erase, install tips.
import * as E from '../engine.js';
import { S, DEMO, storageIsPersistent } from '../state.js';
import { header, esc } from '../ui.js';
import * as llm from '../llm.js';

/** The AI card: which AI is connected, or how to connect one. Redrawn as the connection or download progresses. */
function aiCardBody() {
  const st = llm.state; const sup = S.ui.aiSupport; const pref = S.prefs.ollama ?? {};
  const bad = (msg) => `<p class="small" style="margin:0 0 12px;color:var(--danger,#c0392b)">${esc(msg)}</p>`;
  if (st.status === 'loading') return st.backend === 'ollama'
    ? `<p class="muted" style="margin:6px 0 10px">Connecting to Ollama… <b>${Math.round(st.progress * 100)}%</b></p><p class="muted small" style="margin:0">${esc(st.text)}</p>`
    : `<p class="muted" style="margin:6px 0 10px">Downloading and starting the model… <b>${Math.round(st.progress * 100)}%</b>. The first time is a big download (about 1 GB), so Wi-Fi is best. Keep this page open.</p>
    <p class="muted small" style="margin:0">${esc(st.text)}</p>`;
  if (st.status === 'ready' && st.backend === 'ollama') return `<p class="muted" style="margin:6px 0 14px">Connected to Ollama on your computer. Text: <b>${esc(st.model)}</b>. Receipt photos: ${st.vision ? `<b>${esc(st.vision)}</b>` : 'not available yet. In a terminal run <b>ollama pull qwen2.5vl:3b</b>, then press Connect again.'} It is free and private. It reads your sentences and photos, but an amount typed in words always comes from your own words, and a receipt is only saved after you check it.</p>
    <div class="stack">${st.vision ? '' : '<button class="btn ink block" data-act="ai-ollama">Connect again</button>'}<button class="btn line block" data-act="ai-disable">Disconnect</button></div>`;
  if (st.status === 'ready') return `<p class="muted" style="margin:6px 0 14px">On. A small AI model (Qwen2.5 1.5B) runs on this device and reads what you type in the AI tab. It is free, private and works offline. Nothing is sent to a server, and it never decides an amount: prices are always read from your own words.</p>
    <button class="btn line block" data-act="ai-disable">Turn off and remove the model</button>`;
  const browser = sup && !sup.ok
    ? `<p class="muted small" style="margin:0">This browser can’t run the AI itself (${esc(sup.reason)}).</p>`
    : `<p class="muted small" style="margin:0 0 12px">Downloads a small model once (about 1 GB, best on Wi-Fi) and runs it in this browser. Works on a recent phone. Understands sentences, but can’t read photos.</p><button class="btn line block" data-act="ai-enable">Download and run in this browser</button>`;
  return `${st.status === 'error' ? bad(`Couldn’t start it: ${st.error}`) : ''}<p class="muted" style="margin:6px 0 14px">Make the assistant a real AI that understands loose sentences in English or 中文, and (with Ollama) reads receipt photos. Free, private, no account, no limits. The built-in rules stay as the backup.</p>
    <p style="margin:0 0 4px"><b>Ollama on your computer</b> <span class="muted small">(fastest; reads receipts)</span></p>
    <label class="field" style="margin-bottom:10px"><span>Ollama address</span><input id="ollama-url" value="${esc(pref.url || llm.OLLAMA_URL)}" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
    <button class="btn ink block" data-act="ai-ollama">Connect to Ollama</button>
    <p style="margin:18px 0 6px"><b>In this browser</b> <span class="muted small">(for phones)</span></p>${browser}`;
}

/** When you last saved a backup file; a nudge if it's been a while. */
function backupLine() {
  if (DEMO) return 'Nothing is saved while sample data is showing.';
  const last = S.prefs.lastBackup;
  if (!last) return 'You haven’t saved a backup file yet. Do it once now, and after big changes. On iPhone choose Save to Files.';
  const days = E.daysBetween(last, S.today);
  return days === 0 ? 'Last backup: today.' : days < 14 ? `Last backup: ${days} day${days === 1 ? '' : 's'} ago.` : `Last backup: ${days} days ago. Worth saving a fresh one.`;
}

export function view() {
  const s = S.data.settings;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const html = `${header({ title: 'Settings', back: true })}
    <div class="card rise" style="--i:0"><div class="t-large">${esc(s.nickname || 'My budget')}</div><div class="muted" style="margin:4px 0 14px">Since ${s.started} · MYR (Malaysian ringgit)</div>
      <div class="stack"><button class="btn ink block" data-act="budget">Income, bills and budget</button><button class="btn line block" data-act="plan">Plan this month</button></div></div>
    <div class="card rise" style="--i:1;margin-top:12px"><div class="t-large">Cheaper swaps</div>
      <p class="muted" style="margin:6px 0 14px">When you overspend, the assistant suggests these on the days after, like the bus instead of the train. ${S.data.swaps.length} saved.</p>
      <button class="btn line block" data-act="swaps">Edit swaps</button></div>
    <div class="card rise" style="--i:2;margin-top:12px"><div class="t-large">On-device AI</div><div id="ai-card">${aiCardBody()}</div></div>
    <div class="card rise" style="--i:2;margin-top:12px"><div class="t-large">Data and backup</div>
      <p class="muted" style="margin:6px 0 8px">Your data lives in this browser on this device, and nowhere else. A JSON backup restores everything and also works with the Android app. CSV is for spreadsheets.</p>
      <p class="muted small" style="margin:0 0 14px" id="store-note">${esc(backupLine())}</p>
      <div class="stack"><button class="btn line block" data-act="export-json">Export JSON backup</button><button class="btn line block" data-act="import-json">Restore JSON backup</button>
        <button class="btn line block" data-act="export-csv">Export all transactions as CSV</button><button class="btn text danger" data-act="erase">Erase all budget data</button></div>
      <input type="file" id="file" accept="application/json,.json,text/plain" hidden></div>
    ${standalone ? '' : `<div class="card rise" style="--i:3;margin-top:12px"><div class="t-large">Put it on your Home Screen</div>
      <p class="muted" style="margin:6px 0 0">On iPhone, open this page in Safari, tap the Share button, then <b>Add to Home Screen</b>. It opens full screen like an app, and Safari is less likely to clear its data.</p>
      <p class="muted small" style="margin:8px 0 0">Heads up: the Home Screen app keeps its own separate data. Add it first, then enter your budget there, or restore a backup into it.</p></div>`}
    <div class="card rise" style="--i:4;margin:12px 0"><div class="t-large">About Allowance</div>
      <p class="muted" style="margin:6px 0 0">Offline budgeting, web edition. The budget assistant runs on your device: built-in rules, plus an optional small AI model you can turn on above. This version doesn’t connect to banks, sync to the cloud or use any online AI service, and it has no app lock.</p></div>`;
  return { html, mount(page) {
    const paint = () => { const el = page.querySelector('#ai-card'); if (el) el.innerHTML = aiCardBody(); };
    llm.listen('settings', paint);
    if (!S.ui.aiSupport) llm.support().then((s) => { S.ui.aiSupport = s; paint(); });
    const file = page.querySelector('#file');
    file.addEventListener('change', () => document.dispatchEvent(new CustomEvent('app:import', { detail: file })));
    if (!DEMO) storageIsPersistent().then((p) => { const note = page.querySelector('#store-note'); if (note && p === false) note.textContent += ' The browser hasn’t promised to keep this data, so backups matter more.'; });
  } };
}
export { E };
