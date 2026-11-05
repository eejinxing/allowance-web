// Settings: profile, appearance, backup and restore, erase, install tips.
import * as E from '../engine.js';
import { S, DEMO, storageIsPersistent } from '../state.js';
import { header, esc } from '../ui.js';

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
      <p class="muted" style="margin:6px 0 0">Offline budgeting, web edition. The budget assistant runs rule-based estimates on your device. This version doesn’t connect to banks, sync to the cloud or use online AI, and it has no app lock.</p></div>`;
  return { html, mount(page) {
    const file = page.querySelector('#file');
    file.addEventListener('change', () => document.dispatchEvent(new CustomEvent('app:import', { detail: file })));
    if (!DEMO) storageIsPersistent().then((p) => { const note = page.querySelector('#store-note'); if (note && p === false) note.textContent += ' The browser hasn’t promised to keep this data, so backups matter more.'; });
  } };
}
export { E };
