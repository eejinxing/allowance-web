// App shell: routing, bottom nav, every button action, first-run setup, theme.
import * as E from './engine.js';
import { S, TABS, go, render, setRenderer, commit, replaceData, savePrefs, toast, DEMO, leaveDemo, protectData } from './state.js';
import { icon } from './icons.js';
import { esc, mountForm, initialValues, confirmDialog, closeAllSheets, countUp, animateBars, fitAll, editBill, BILL_ICON, billMoney } from './ui.js';
import * as editors from './editors.js';
import * as home from './pages/home.js';
import * as historyPage from './pages/history.js';
import * as analytics from './pages/analytics.js';
import * as plan from './pages/plan.js';
import * as goals from './pages/goals.js';
import * as wallet from './pages/wallet.js';
import * as ai from './pages/ai.js';
import * as settings from './pages/settings.js';
import * as swaps from './pages/swaps.js';

const PAGES = { home, history: historyPage, analytics, plan, goals, wallet, swaps, ai, settings };
const NAV = [['home', 'Home', 'Home'], ['analytics', 'Analytics', 'BarChart'], ['ai', 'AI', null], ['goals', 'Goals', 'Target'], ['wallet', 'Wallet', 'AccountBalanceWallet'], ['swaps', 'Swaps', 'SwapHoriz']];
const NAV_OF = { history: 'home', plan: 'home', settings: 'home' };
const pageEl = () => document.getElementById('page');
let lastRoute = null;

// ---------- rendering ----------
function navHTML() {
  const active = NAV_OF[S.route] ?? S.route;
  return NAV.map(([route, label, ic]) => `<button class="${active === route ? 'on' : ''}" data-act="tab" data-v="${route}" aria-label="${label}" aria-current="${active === route}">
    ${ic ? icon(ic, 26) : '<img src="img/tiger_head.webp" alt="">'}<span>${label}</span></button>`).join('');
}

// First-run setup: three collapsible step cards (Name, Income & savings, Fixed bills), one open at a time.
const ONB_STEPS = ['name', 'income', 'bills'];
const ONB_CARDS = {
  name: { ic: 'Person', title: 'Name', hint: 'What should we call you?', next: 'income' },
  income: { ic: 'AccountBalanceWallet', title: 'Income & savings', hint: 'Allowance, period and savings', next: 'bills' },
  bills: { ic: 'ReceiptLong', title: 'Fixed bills', hint: 'Rent, phone, subscriptions' },
};
function onbSummary(key, v) {
  const money = (x) => 'RM ' + (String(x).trim() || '0');
  if (key === 'name') return v.name.trim() || ONB_CARDS.name.hint;
  if (key === 'income') return v.income.trim() ? `${money(v.income)} ${(E_FREQ_NAME[v.frequency] ?? '').toLowerCase()} · save ${money(v.savings)}` : ONB_CARDS.income.hint;
  return v.bills.length ? `${v.bills.length} ${v.bills.length === 1 ? 'bill' : 'bills'}` : ONB_CARDS.bills.hint;
}
const E_FREQ_NAME = { MONTHLY: 'Monthly', WEEKLY: 'Weekly', DAILY: 'Daily', YEARLY: 'Yearly' };

// The income step opens as an inset yellow card over the top of the screen, modelled on a wallet balance screen:
// the stepper buttons nudge the amount, the round button cycles the period, and the tile sets the monthly savings.
const PERIOD = { MONTHLY: 'Month', WEEKLY: 'Week', DAILY: 'Day', YEARLY: 'Year' }; // shown on the round button
const BUMP = { MONTHLY: 5000, WEEKLY: 1000, DAILY: 500, YEARLY: 50000 };            // sen added by the ↑ / ↓ buttons
const NEXT_FREQ = { MONTHLY: 'WEEKLY', WEEKLY: 'DAILY', DAILY: 'YEARLY', YEARLY: 'MONTHLY' };
const periodButton = (f) => `${icon('CalendarMonth', 20)}<span>${PERIOD[f]}</span>`;

function onbHero(vals) {
  const savings = vals.savings === '0' ? '' : vals.savings; // an untouched "0" shows as the placeholder instead
  return `<section class="hero" style="view-transition-name:onb-income">
    <div class="hero-top"><button type="button" class="hero-back" data-onb-go="name" aria-label="Back">${icon('ChevronLeft', 26)}</button><b>Your allowance</b><span class="hero-gap"></span></div>
    <div class="hero-mid">
      <div class="hero-cap">Balance</div>
      <label class="hero-amt"><em>RM</em><input data-hk="income" inputmode="decimal" placeholder="0.00" autocomplete="off" aria-label="Income or allowance in RM" value="${esc(vals.income)}"></label>
      <span class="hero-mirror" aria-hidden="true"></span>
      <div class="hero-ctl">
        <div class="hero-pill"><button type="button" data-onb-bump="1" aria-label="Increase">${icon('ArrowUp', 22)}</button><i></i><button type="button" data-onb-bump="-1" aria-label="Decrease">${icon('ArrowDown', 22)}</button></div>
        <button type="button" class="hero-round" data-onb-freq aria-label="Income period: ${PERIOD[vals.frequency]}. Tap to change">${periodButton(vals.frequency)}</button></div>
    </div>
    <div class="hero-save"><div class="hero-cap2">Monthly savings to set aside</div>
      <label class="hero-tile"><input data-hk="savings" inputmode="decimal" placeholder="Optional" autocomplete="off" aria-label="Monthly savings in RM" value="${esc(savings)}"></label></div>
    <button type="button" class="btn ink hero-link" data-onb-go="bills">Proceed to next</button>
  </section>`;
}

function wireHero(host, vals, hideErr) {
  const hero = host.querySelector('.hero:not(.bsheet)'); if (!hero) return;
  const input = (k) => hero.querySelector(`[data-hk="${k}"]`);
  const money = (text) => { try { return E.parseMoney(String(text).trim() || '0'); } catch { return 0; } };
  // The amount is the widest thing on the card: start from a size that follows the card width, then shrink only if the digits no longer fit.
  const fit = () => {
    if (!hero.isConnected) { removeEventListener('resize', fit); return; }
    const i = input('income'); const row = i.parentElement; const rm = row.querySelector('em'); const mirror = hero.querySelector('.hero-mirror');
    let size = Math.min(row.clientWidth * 0.22, 72);
    const measure = () => { mirror.style.fontSize = size + 'px'; mirror.textContent = i.value || '0.00'; rm.style.fontSize = size * 0.4 + 'px'; return mirror.offsetWidth + rm.offsetWidth + 10; };
    while (measure() > row.clientWidth - 8 && size > 30) size -= 2;
    i.style.fontSize = size + 'px'; i.style.width = mirror.offsetWidth + 6 + 'px';
  };
  hero.addEventListener('input', (e) => { const k = e.target.dataset.hk; if (!k) return; vals[k] = e.target.value; if (k === 'income') fit(); hideErr(); });
  hero.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if ('onbBump' in b.dataset) { vals.income = E.decimal(Math.max(0, money(vals.income) + Number(b.dataset.onbBump) * BUMP[vals.frequency])); input('income').value = vals.income; fit(); }
    else if ('onbFreq' in b.dataset) { vals.frequency = NEXT_FREQ[vals.frequency]; b.innerHTML = periodButton(vals.frequency); b.setAttribute('aria-label', `Income period: ${PERIOD[vals.frequency]}. Tap to change`); }
    else return;
    hideErr();
  });
  addEventListener('resize', fit);
  fit();
}

// The bills step opens as the same inset card laid out like a task list: a big monthly total, one ring-icon row per bill,
// an "Add bill" row, and an "up next" bar at the bottom that finishes setup.
const BILL_PER_MONTH = { MONTHLY: 1, WEEKLY: 52 / 12, DAILY: 365 / 12 };
const billsTotal = (bills) => bills.filter((b) => !b.family).reduce((sum, b) => { try { return sum + Math.round(E.parseMoney(b.amount) * BILL_PER_MONTH[b.frequency]); } catch { return sum; } }, 0);
const rowTail = `<span class="bs-dots">${icon('MoreHoriz', 24)}</span><span class="bs-chev">${icon('ChevronRight', 22)}</span>`;
const billRow = (b) => `<button type="button" class="bs-row" data-bill-edit="${b.id}"><span class="bs-ring">${icon(b.family ? 'People' : BILL_ICON[b.frequency], 24)}</span>
  <span class="bs-txt"><b>${esc(b.name.trim() || 'Unnamed bill')}</b><span>${esc(billMoney(b.amount))} · ${esc(E_FREQ_NAME[b.frequency])}${b.family ? ' · Family' : ''}</span></span>${rowTail}</button>`;

function onbBills() {
  return `<section class="hero bsheet" style="view-transition-name:onb-bills">
    <div class="hero-top"><button type="button" class="hero-back" data-onb-go="income" aria-label="Back">${icon('ChevronLeft', 26)}</button></div>
    <div class="bs-head"><div class="bs-total" data-bs-total></div><div class="bs-sub" data-bs-sub></div></div>
    <div class="bs-list" data-bs-list></div>
    <div class="err" id="oberr" hidden></div>
    <div class="bs-bar"><span class="bs-ring">${icon('AccountBalanceWallet', 22)}</span><span class="bs-txt"><b>Your budget</b><span>Up next</span></span>
      <button type="button" class="btn ink bs-next" data-onb-finish>${icon('ArrowRight', 20)}Next</button></div>
  </section>`;
}

function wireBills(host, vals, hideErr) {
  const sheet = host.querySelector('.bsheet'); if (!sheet) return;
  const paint = () => {
    sheet.querySelector('[data-bs-total]').textContent = E.cash(billsTotal(vals.bills));
    sheet.querySelector('[data-bs-sub]').innerHTML = `<b>Fixed bills</b> · ${vals.bills.length ? `${vals.bills.length} added` : 'none yet'} · per month`;
    sheet.querySelector('[data-bs-list]').innerHTML = vals.bills.map(billRow).join('')
      + `<button type="button" class="bs-row" data-bill-new><span class="bs-ring plus">${icon('Add', 26)}</span><span class="bs-txt"><b>Add bill</b><span>Rent, phone, apps</span></span>${rowTail}</button>`;
  };
  sheet.querySelector('[data-bs-list]').addEventListener('click', (e) => {
    const row = e.target.closest('[data-bill-edit],[data-bill-new]'); if (!row) return;
    editBill(vals, row.dataset.billEdit, () => { paint(); hideErr(); });
  });
  paint();
}

// The fine print under the step cards, as a short "how it works" list instead of one long paragraph.
const ONB_NOTES = `<section class="onb-how" aria-label="How your budget works"><b class="onb-how-t">${icon('AutoAwesome', 16)} How it works</b>
  <ul><li><span>Starting mid-month?</span> Your budget covers the whole month, so you can still log what you spent on earlier days.</li>
    <li><span>Weekly amounts</span> are counted per day (÷ 7).</li>
    <li><span>Income isn’t added to your bank balance automatically.</span> Log it as Scheduled income when it arrives.</li></ul></section>`;

// Opening or closing a step morphs the cards (View Transitions where the browser has them, a plain redraw otherwise).
function switchStep(next) {
  const run = () => { S.ui.onbOpen = next; renderOnboarding(false, true); };
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return run();
  document.activeElement?.blur?.();
  document.startViewTransition(run);
}

function renderOnboarding(animate, morph = false) {
  const host = pageEl(); const nav = document.getElementById('nav');
  nav.classList.add('hide');
  const sections = editors.budgetSections(null);
  const vals = (S.ui.onb ??= initialValues(Object.values(sections).flat()));
  S.ui.onbOpen ??= 'name';
  const open = S.ui.onbOpen; const step = ONB_STEPS.indexOf(open);
  const card = open === 'income' || open === 'bills'; // these two steps open as the big card instead of an inline step
  host.className = 'page onb' + (animate ? ' enter' : ' noanim') + (morph && document.startViewTransition ? ' vt' : '');
  host.innerHTML = `${step > 0 && !card ? `<button class="btn text onb-back" data-onb-go="${ONB_STEPS[step - 1]}">${icon('ChevronLeft', 20)}Back</button>` : '<div style="height:48px"></div>'}
    <h1 class="onb-title">Let’s get<br>started</h1>
    <p class="muted" style="margin:0 0 20px">Starting today, give your allowance a plan.</p>
    ${ONB_STEPS.map((key) => { const c = ONB_CARDS[key]; const on = open === key;
      if (card && on) return key === 'income' ? onbHero(vals) : onbBills();
      return `<section class="step ${on ? 'on' : ''}" style="view-transition-name:onb-${key}"><button type="button" class="step-head" data-onb-toggle="${key}" aria-expanded="${on}" aria-label="${on ? 'Collapse' : 'Expand'} ${c.title}">
        <span class="step-ic">${icon(c.ic, 22)}</span>
        <span class="step-txt"><b>${c.title}</b>${on ? '' : `<span class="muted">${esc(onbSummary(key, vals))}</span>`}</span>
        <span class="step-chev">${icon('ChevronDown', 24)}</span></button>
        ${on ? `<div class="step-body"><div data-onb-form="${key}"></div>${c.next ? `<button type="button" class="btn line block" data-onb-go="${c.next}">Next</button>` : ''}</div>` : ''}</section>`; }).join('')}
    ${ONB_NOTES}${open === 'bills' ? '' : '<div class="err" id="oberr" hidden></div><button class="btn ink block" id="obgo" style="margin-top:12px">Continue</button>'}`;
  const hideErr = () => { host.querySelector('#oberr').hidden = true; };
  const form = host.querySelector(`[data-onb-form="${open}"]`);
  if (form) mountForm(form, sections[open], vals, { scroller: host, onChange: hideErr });
  wireHero(host, vals, hideErr);
  wireBills(host, vals, hideErr);
  // Focusing an input can scroll the outer shell as well as the page (the on-screen keyboard does this), so reset both.
  host.scrollTop = 0; host.parentElement.scrollTop = 0;
  if (card) { const el = host.querySelector('.hero'); if (el) host.scrollTop = Math.max(0, el.offsetTop - 12); }
  host.querySelectorAll('[data-onb-toggle]').forEach((b) => b.addEventListener('click', () => switchStep(open === b.dataset.onbToggle ? '' : b.dataset.onbToggle)));
  host.querySelectorAll('[data-onb-go]').forEach((b) => b.addEventListener('click', () => switchStep(b.dataset.onbGo)));
  const finish = () => {
    try { editors.applyBudget(vals, true); S.ui.onb = null; S.ui.onbOpen = null; S.route = 'home'; history.replaceState({ route: 'home' }, '', '#home'); render(); } catch (e) { const el = host.querySelector('#oberr'); el.textContent = e.message; el.hidden = false; }
  };
  host.querySelectorAll('#obgo,[data-onb-finish]').forEach((b) => b.addEventListener('click', finish));
}

function doRender(opts = {}) {
  const host = pageEl(); const nav = document.getElementById('nav');
  const animate = !opts.keepAnimations || S.route !== lastRoute;
  if (!S.data.settings) { renderOnboarding(animate); lastRoute = 'onboarding'; return; }
  if (!PAGES[S.route]) S.route = 'home';
  const keep = S.route === lastRoute ? host.scrollTop : 0;
  const v = PAGES[S.route].view();
  host.className = `page ${v.cls ?? ''} ${animate ? (S.route === lastRoute ? '' : 'enter') : 'noanim'}`;
  host.innerHTML = v.html;
  host.scrollTop = keep;
  nav.innerHTML = navHTML();
  nav.classList.toggle('hide', S.route === 'ai' || S.route === 'settings');
  v.mount?.(host, { animate, rerender: () => render({ keepAnimations: true }) });
  fitAll(host);
  if (animate) animateBars(host);
  lastRoute = S.route;
  S.ui.hdr = null;
}
setRenderer(doRender);

// ---------- actions ----------
const entry = (id) => S.data.entries.find((e) => e.id === id);
const download = (name, type, text) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
};

const ACT = {
  tab: (el) => { closeAllSheets(); go(el.dataset.v); },
  back: () => { if (history.length > 1 && history.state?.route) window.history.back(); else go('home'); },
  add: () => editors.openEntry(null),
  entry: (el) => editors.openEntry(el.dataset.id),
  settings: () => go('settings'),
  history: () => go('history'),
  plan: () => go('plan'),
  home: () => go('home'),
  goals: () => go('goals'),
  budget: () => editors.openBudget(),
  day: (el) => (el.dataset.date > S.today ? editors.openPlanDay(el.dataset.date) : editors.openDaySpend(el.dataset.date)),
  mode: (el) => commit((d) => E.configure(d, { ...d.settings, weightMode: el.dataset.v }, d.bills, S.today), el.dataset.v === 'HABIT' ? 'Now following your habits' : 'Spreading evenly'),
  month: (el) => { const f = S.ui.history; f.month = E.addMonths(f.month, Number(el.dataset.d)); render({ keepAnimations: true }); },
  cat: (el) => { S.ui.history.cat = el.dataset.v; render({ keepAnimations: true }); },
  'clear-filters': () => { Object.assign(S.ui.history, { q: '', cat: 'ALL' }); render({ keepAnimations: true }); },
  account: (el) => editors.openAccount(el.dataset.id),
  adjust: () => { const list = S.data.accounts.filter((a) => !a.archived); const a = list[S.ui.acct ?? 0] ?? list[0]; if (a) editors.openBalance(a.id); },
  transfer: () => editors.openTransfer(),
  eye: (el) => { const h = (S.ui.hidden ??= {}); h[el.dataset.id] = !h[el.dataset.id]; render({ keepAnimations: true }); },
  'wallet-open': () => { S.ui.walletOpen = !S.ui.walletOpen; render({ keepAnimations: true }); },
  'goto-card': (el) => { S.ui.walletOpen = false; render({ keepAnimations: true }); const d = document.getElementById('deck'); const c = d?.querySelector('.acct'); if (c) d.scrollTo({ left: Number(el.dataset.i) * (c.offsetWidth + 8) }); },
  goal: (el) => editors.openGoalSheet(el.dataset.id),
  'new-goal': () => editors.openTarget('goal'),
  fund: (el) => editors.openFundSheet(el.dataset.id),
  'new-fund': () => editors.openTarget('fund'),
  'new-wish': () => editors.openTarget('wish'),
  'edit-wish': (el) => editors.openTarget('wish', el.dataset.id),
  'remove-wish': async (el) => { if (await confirmDialog({ title: 'Remove this wish?', text: 'You can add it again later.', confirm: 'Remove' })) commit((d) => ({ ...d, wishes: d.wishes.filter((w) => w.id !== el.dataset.id) }), 'Wish removed'); },
  'export-json': async () => {
    // On iPhone the share sheet offers "Save to Files" (iCloud Drive), which keeps the backup outside the browser. Elsewhere it downloads.
    const name = `Allowance-${S.today}.json`; const text = JSON.stringify(S.data, null, 2);
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Allowance backup' }); } catch (err) { if (err?.name === 'AbortError') return; download(name, 'application/json', text); }
    } else download(name, 'application/json', text);
    S.prefs.lastBackup = S.today; savePrefs(); toast('Backup saved'); render({ keepAnimations: true });
  },
  'export-csv': () => { download(`Allowance-${S.today}.csv`, 'text/csv', E.csv(S.data)); toast('CSV exported'); },
  'import-json': () => document.getElementById('file').click(),
  erase: async () => { if (await confirmDialog({ title: 'Erase all budget data?', text: 'Income settings, accounts, transactions, goals and funds will be deleted. Theme is kept. This can’t be undone, so export a JSON backup first.', confirm: 'Erase' })) { replaceData(E.emptyData()); S.route = 'home'; S.chat = []; toast('Data erased'); } },
  'ai-afford': () => ai.askAfford(),
  'ai-camera': () => ai.say('note', 'Photo input isn’t available yet. Type the item and its price instead.'),
  'ai-voice': (el) => ai.voice(el),
  swaps: () => editors.openSwaps(),
  swap: (el) => editors.openSwap(el.dataset.id || null),
  'ai-payback': (el) => ai.buyAndPayBack(el.dataset.n, Number(el.dataset.a), Number(el.dataset.turn)),
  'ai-swap': (el) => ai.toggleSwap(Number(el.dataset.turn), el.dataset.date, el.dataset.id),
  'ai-wish': (el) => ai.wishFrom(el.dataset.n, Number(el.dataset.a)),
  'ai-info': () => ai.openChartInfo(),
  'ai-try': (el) => ai.tryPrompt(el.dataset.q),
  'ai-goal': (el) => ai.goalFrom(el.dataset.n, Number(el.dataset.a)),
  'ai-bought': (el) => editors.openEntry(null, { amount: Number(el.dataset.a), note: el.dataset.n, category: 'SHOPPING' }),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); try { fn(el); } catch (err) { toast(err.message); } }
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role=button][data-act]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('app:go', (e) => go(e.detail));
document.addEventListener('app:import', async (e) => {
  const input = e.detail; const f = input.files?.[0]; input.value = '';
  if (!f) return;
  try {
    const next = E.decodeBackup(await f.text(), S.today);
    if (await confirmDialog({ title: 'Restore this backup?', text: `Your current data will be replaced by ${next.entries.length} transactions and ${next.accounts.length} accounts from the backup.`, confirm: 'Restore' })) { replaceData(next); S.route = 'home'; toast('Backup restored'); }
  } catch (err) { toast(`Couldn’t restore backup: ${err.message}`); }
});

// ---------- boot ----------
// While sample data is showing, a small pill at the top says so and switches to your own data.
if (DEMO) {
  const pill = document.createElement('button');
  pill.className = 'demo-pill'; pill.type = 'button';
  pill.innerHTML = '<i></i>Sample data<b>Use my data</b>';
  pill.addEventListener('click', leaveDemo);
  document.getElementById('app').appendChild(pill);
}
S.route =(location.hash.slice(1) in PAGES ? location.hash.slice(1) : 'home');
history.replaceState({ route: S.route }, '', '#' + S.route);
render();
protectData();

// A new day (or coming back to the app) refreshes today's allowance.
const refreshDay = () => { const t = E.todayISO(); if (t !== S.today) { S.today = t; commit((d) => d, null); } };
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDay(); });
setInterval(refreshDay, 30_000);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
export { TABS, esc, countUp };
