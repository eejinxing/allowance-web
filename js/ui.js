// Shared UI pieces: formatting helpers, the form + sheet system, dialogs and the count-up effect.
import * as E from './engine.js';
import { icon } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const CAT_NAMES = { FOOD: 'Food & drinks', TRANSPORT: 'Transport', SHOPPING: 'Shopping', FUN: 'Entertainment', LIVING: 'Living', HEALTH: 'Health', OTHER: 'Other' };
export const CAT_ICONS = { FOOD: 'Restaurant', TRANSPORT: 'DirectionsBus', SHOPPING: 'ShoppingBag', FUN: 'Celebration', LIVING: 'Home', HEALTH: 'Favorite', OTHER: 'MoreHoriz' };
export const CAT_COLORS = { FOOD: '#FFD83D', TRANSPORT: '#8ED1F5', SHOPPING: '#FFA3C4', FUN: '#FFA45C', LIVING: '#7ED9B0', HEALTH: '#B9A6F2', OTHER: '#D8D2C4' };
export const FREQS = [['MONTHLY', 'Monthly'], ['WEEKLY', 'Weekly'], ['DAILY', 'Daily']];
export const ACCOUNT_TYPES = [['BANK', 'Bank'], ['EWALLET', 'E-wallet'], ['CASH', 'Cash'], ['CREDIT', 'Credit card']];
export const TYPE_NAMES = { EXPENSE: 'Expense', INCOME: 'Extra income', SCHEDULED_INCOME: 'Scheduled income', TRANSFER: 'Transfer', ADJUSTMENT: 'Balance adjustment',
  BILL_PAYMENT: 'Bill payment', FUND_ALLOCATION: 'Fund top-up', FUND_PURCHASE: 'Fund purchase', FUND_RELEASE: 'Fund release', GOAL_DEPOSIT: 'Saved to goal', GOAL_WITHDRAWAL: 'Taken from goal' };
export const PALETTE = ['#FFD83D', '#141414', '#A89F91', '#FF8A3D', '#34C48B', '#5BB8F0', '#FF7FA8'];
export const CARD_COLORS = ['#07442a', '#0e36b8', '#3a1f8c', '#222222'];

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WD = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WD3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const monthTitle = (ym) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
export const dayShort = (iso) => `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8))}`;
export const dayLong = (iso) => `${WD[E.dow(iso) - 1]}, ${dayShort(iso)}`;
/** "RM 1,250.00" → "1,250" for tight spaces. */
export const compact = (minor) => { const t = E.cash(minor).replace('RM ', '').replace(/\.00$/, ''); return t.includes('.') ? t.replace(/0$/, '') : t; };

export const amountHTML = (minor, cls = '', style = '') =>
  `<span class="${cls}" data-count="${minor}" style="${style}">${E.cash(minor)}</span>`;

// ---------- count-up ----------
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
export function countUp(root) {
  if (reduceMotion()) return;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target) || target === 0) return;
    const start = performance.now(); const duration = 800;
    const fmt = (v) => (el.dataset.fmt === 'plain' ? String(Math.round(v)) : E.cash(Math.round(v)));
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = fmt(target * easeOutExpo(t));
      if (t < 1) requestAnimationFrame(step); else el.textContent = fmt(target);
    };
    el.textContent = fmt(0);
    requestAnimationFrame(step);
  });
}

// ---------- forms ----------
const attr = (v) => esc(v ?? '');
export const BILL_ICON = { MONTHLY: 'CalendarMonth', WEEKLY: 'SwapHoriz', DAILY: 'Clock' };
export const billMoney = (a) => { try { return E.cash(E.parseMoney(a)); } catch { return 'RM ' + (String(a).trim() || '0'); } };

/** Add or edit one bill in a sheet; [done] redraws the list afterwards. */
export function editBill(vals, id, done) {
  const old = id ? vals.bills.find((x) => x.id === id) : null;
  openSheet({ title: old ? 'Edit bill' : 'New bill', fields: [
    { k: 'name', t: 'text', label: 'Bill name', v: old?.name ?? '' },
    { k: 'amount', t: 'money', label: 'Amount (RM)', v: old?.amount ?? '' },
    { k: 'frequency', t: 'chips', v: old?.frequency ?? 'MONTHLY', opts: FREQS },
    { k: 'family', t: 'switch', label: 'Paid by family (not from my budget)', v: old?.family ?? false },
    ...(old ? [{ t: 'btn', id: 'rm', label: 'Remove this bill', danger: true, onClick: (_v, c) => { vals.bills = vals.bills.filter((x) => x.id !== id); c.close(); done(); } }] : []),
  ], onSave: (v) => {
    E.require(v.name.trim(), 'Name this bill');
    E.positive(v.amount);
    const next = { id: old?.id ?? E.id(), name: v.name.trim(), amount: v.amount.trim(), frequency: v.frequency, family: v.family };
    vals.bills = old ? vals.bills.map((x) => (x.id === id ? next : x)) : [...vals.bills, next];
    done();
  } });
}

function billsHTML(f, vals) {
  const bills = vals[f.k];
  return `<div class="section" style="margin:18px 0 8px"><h2 style="font-size:20px">Fixed bills</h2><button type="button" class="link" data-bill-add>+ Add</button></div>`
    + (bills.length ? '' : `<p class="note">Rent, phone bills and subscriptions all go here.</p>`)
    + bills.map((b) => `<div class="billbox" data-bill="${b.id}">
      <label class="field"><span>Bill name</span><input data-bill-k="name" value="${attr(b.name)}" autocomplete="off"></label>
      <label class="field"><span>Amount (RM)</span><input data-bill-k="amount" inputmode="decimal" value="${attr(b.amount)}" autocomplete="off"></label>
      <div class="chips">${E_FREQ.map(([v, l]) => `<button type="button" class="chip ${b.frequency === v ? 'on' : ''}" data-bill-freq="${v}">${l}</button>`).join('')}</div>
      <div class="switch" style="margin-top:8px"><span>Paid by family (not from my budget)</span><button type="button" class="sw ${b.family ? 'on' : ''}" data-bill-family role="switch" aria-checked="${b.family}"></button></div>
      <button type="button" class="btn text danger" data-bill-remove>Remove this bill</button></div>`).join('')
}
const E_FREQ = FREQS;

function fieldHTML(f, vals) {
  const v = f.k ? vals[f.k] : undefined;
  switch (f.t) {
    case 'text': case 'money': {
      const mode = f.t === 'money' ? (f.signed ? 'text' : 'decimal') : 'text';
      return `<label class="field"><span>${esc(f.label)}</span><input data-k="${f.k}" value="${attr(v)}" inputmode="${mode}" ${f.ph ? `placeholder="${attr(f.ph)}"` : ''} autocomplete="off" ${f.secret ? 'type="password"' : ''}>${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
    }
    case 'date': return `<label class="field"><span>${esc(f.label)}${f.optional ? ' (optional)' : ''}</span><input type="date" data-k="${f.k}" value="${attr(v)}" ${f.max ? `max="${f.max}"` : ''} ${f.min ? `min="${f.min}"` : ''}></label>`;
    case 'chips': {
      const opts = typeof f.opts === 'function' ? f.opts(vals) : f.opts;
      const lab = typeof f.label === 'function' ? f.label(vals) : f.label;
      return `${lab ? `<div class="label">${esc(lab)}</div>` : ''}<div class="chips" style="margin-bottom:12px">${opts.map(([val, label]) => `<button type="button" class="chip ${String(v) === String(val) ? 'on' : ''}" data-chip="${f.k}" data-v="${attr(val)}">${esc(label)}</button>`).join('')}</div>`;
    }
    case 'switch': return `<div class="switch"><span>${esc(f.label)}</span><button type="button" class="sw ${v ? 'on' : ''}" data-sw="${f.k}" role="switch" aria-checked="${Boolean(v)}"></button></div>`;
    case 'note': return `<p class="note">${f.text(vals)}</p>`;
    case 'html': return f.html(vals);
    case 'btn': return `<button type="button" class="btn text ${f.danger ? 'danger' : ''}" data-btn="${f.id}">${esc(f.label)}</button>`;
    case 'colors': return `<div class="dots" style="margin-bottom:12px">${PALETTE.map((c, i) => `<button type="button" class="dot ${v === i ? 'on' : ''}" data-dot="${f.k}" data-v="${i}" style="background:${c}" aria-label="Colour ${i + 1}"></button>`).join('')}</div>`;
    case 'bills': return billsHTML(f, vals);
    default: return '';
  }
}

export function fieldsHTML(fields, vals) { return fields.filter((f) => !f.show || f.show(vals)).map((f) => fieldHTML(f, vals)).join(''); }

/** Mounts [fields] into [host], keeping [vals] in sync. Returns a refresh function. */
export function mountForm(host, fields, vals, ctx = {}) {
  const draw = () => {
    const sc = ctx.scroller; const top = sc?.scrollTop;
    host.innerHTML = fieldsHTML(fields, vals);
    if (sc) sc.scrollTop = top;
  };
  draw();
  host.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.k) vals[t.dataset.k] = t.value;
    if (t.dataset.billK) { const b = vals.bills.find((x) => x.id === t.closest('[data-bill]').dataset.bill); b[t.dataset.billK] = t.value; }
  });
  host.addEventListener('click', (e) => {
    const c = e.target.closest('[data-chip],[data-sw],[data-dot],[data-btn],[data-bill-add],[data-bill-freq],[data-bill-family],[data-bill-remove]');
    if (!c || !host.contains(c)) return;
    const d = c.dataset;
    if ('chip' in d) vals[d.chip] = d.v;
    else if ('dot' in d) vals[d.dot] = Number(d.v);
    else if ('sw' in d) vals[d.sw] = !vals[d.sw];
    else if ('btn' in d) { fields.find((f) => f.id === d.btn).onClick?.(vals, ctx); return; }
    else if ('billAdd' in d) vals.bills.push({ id: E.id(), name: '', amount: '', frequency: 'MONTHLY', family: false });
    else {
      const id = c.closest('[data-bill]').dataset.bill; const b = vals.bills.find((x) => x.id === id);
      if ('billFreq' in d) b.frequency = d.billFreq; else if ('billFamily' in d) b.family = !b.family; else vals.bills = vals.bills.filter((x) => x.id !== id);
    }
    draw(); ctx.onChange?.(vals);
  });
  return draw;
}

export const initialValues = (fields) => Object.fromEntries(fields.filter((f) => f.k).map((f) => [f.k, f.v ?? (f.t === 'switch' ? false : f.t === 'bills' ? [] : '')]));

// ---------- sheets and dialogs ----------
const layer = () => document.getElementById('layer');
const openSheets = [];

export function openSheet(spec) {
  const vals = initialValues(spec.fields);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;inset:0;pointer-events:auto';
  wrap.innerHTML = `<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${attr(spec.title)}"><div class="grab"></div><h3>${esc(spec.title)}</h3>
    <div class="body"></div><div class="err" role="alert" hidden></div>
    ${spec.noSave ? '' : `<button type="button" class="btn ink block" data-save>${esc(spec.saveLabel || 'Save')}</button>`}
    <button type="button" class="btn text block" data-cancel style="margin-top:6px">${spec.noSave ? 'Close' : 'Cancel'}</button></div>`;
  layer().appendChild(wrap);
  const sheet = wrap.querySelector('.sheet'); const scrim = wrap.querySelector('.scrim'); const err = wrap.querySelector('.err');
  const close = () => {
    if (!wrap.isConnected) return;
    scrim.classList.remove('on'); sheet.classList.remove('on');
    setTimeout(() => wrap.remove(), 380);
    openSheets.splice(openSheets.indexOf(close), 1);
  };
  openSheets.push(close);
  const ctx = { scroller: sheet, close, vals, onChange: () => { err.hidden = true; } };
  mountForm(wrap.querySelector('.body'), spec.fields, vals, ctx);
  requestAnimationFrame(() => requestAnimationFrame(() => { scrim.classList.add('on'); sheet.classList.add('on'); }));
  scrim.addEventListener('click', close);
  wrap.querySelector('[data-cancel]').addEventListener('click', close);
  const save = wrap.querySelector('[data-save]');
  save?.addEventListener('click', () => {
    err.hidden = true;
    try { const r = spec.onSave(vals, close); if (r !== false) close(); } catch (e) { err.textContent = e.message || 'Check what you entered'; err.hidden = false; }
  });
  return close;
}
export const closeAllSheets = () => [...openSheets].forEach((c) => c());

export function confirmDialog({ title, text, confirm = 'Confirm', danger = true }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;pointer-events:auto;z-index:5';
    wrap.innerHTML = `<div class="scrim"></div><div class="dialog" role="alertdialog" aria-modal="true"><h3>${esc(title)}</h3><p>${esc(text)}</p>
      <div class="pill-row"><button class="btn text" data-no>Cancel</button><button class="btn text ${danger ? 'danger' : ''}" data-yes>${esc(confirm)}</button></div></div>`;
    layer().appendChild(wrap);
    requestAnimationFrame(() => { wrap.querySelector('.scrim').classList.add('on'); wrap.querySelector('.dialog').classList.add('on'); });
    const done = (v) => { wrap.querySelector('.scrim').classList.remove('on'); wrap.querySelector('.dialog').classList.remove('on'); setTimeout(() => wrap.remove(), 260); resolve(v); };
    wrap.querySelector('[data-yes]').onclick = () => done(true);
    wrap.querySelector('[data-no]').onclick = () => done(false);
    wrap.querySelector('.scrim').onclick = () => done(false);
  });
}

// ---------- small shared fragments ----------
export function header({ title, sub, back, right = '', left = '', flat = false, big = '' }) {
  return `<header class="hdr ${flat ? 'flat' : ''}"><div class="hdr-row">${back ? `<button class="ghost" data-act="back" aria-label="Back" style="margin-left:-12px">${icon('ChevronLeft', 28)}</button>` : left}
    <div class="hdr-title ${back || left ? '' : 'left'}">${esc(title)}${sub ? `<div class="hdr-sub" style="font-weight:400;font-size:15px;letter-spacing:0">${esc(sub)}</div>` : ''}</div>${right}</div>${big}</header>`;
}
export const progress = (frac, done = false) => `<div class="progress ${done ? 'done' : ''}"><i data-w="${Math.max(0, Math.min(1, frac)) * 100}"></i></div>`;
/** Fills progress bars after layout so their width transition plays. */
export function animateBars(root) { requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll('.progress > i[data-w]').forEach((i) => { i.style.width = i.dataset.w + '%'; }))); }
export const emptyCard = (title, text, label, act) =>
  `<div class="empty"><h4>${esc(title)}</h4><p>${esc(text)}</p>${label ? `<button class="btn yellow" data-act="${act}">${esc(label)}</button>` : ''}</div>`;

/** Shrinks big amounts until they fit their box, so RM 10,000.00 never overflows a narrow card. */
export function fitAll(root) {
  root.querySelectorAll('.tot .v, .gcard .amt, .bal-card .num, .big-amount, .hm-amt .num, .acct .bal .grow').forEach((el) => {
    el.style.fontSize = '';
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth + 1 && size > 12) { size -= 1; el.style.fontSize = size + 'px'; }
  });
}

/** Animates "draw-in" lines: measures each path and slides its dash offset to zero. Skipped for reduced motion. */
export function armDraw(root) {
  if (reduceMotion()) return;
  root.querySelectorAll('.draw').forEach((p) => {
    const len = Math.ceil(p.getTotalLength?.() ?? 0); if (!len) return;
    p.style.strokeDasharray = len; p.style.strokeDashoffset = len; p.style.transition = 'none';
    void p.getBoundingClientRect();
    p.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1) .15s'; p.style.strokeDashoffset = 0;
  });
}
