// Wallet: a greeting, one yellow card with the total of every account, a tile per account (bank, e-wallet, cash…),
// one soft yellow card with the money that is free to spend, and goals.
import * as E from '../engine.js';
import { S } from '../state.js';
import { icon } from '../icons.js';
import { esc, amountHTML, countUp, ACCOUNT_TYPES } from '../ui.js';

const SPEND = ['EXPENSE', 'BILL_PAYMENT', 'FUND_PURCHASE'];
const spending = (d, from, to) => d.entries.filter((e) => !e.family && SPEND.includes(e.type) && e.date >= from && e.date <= to).reduce((s, e) => s + e.amountMinor, 0);
const TYPE_ICON = { BANK: 'AccountBalanceWallet', EWALLET: 'SwapHoriz', CASH: 'Coin', CREDIT: 'ReceiptLong' };

function goalIcon(name) {
  const n = name.toLowerCase();
  const has = (...w) => w.some((x) => n.includes(x));
  if (has('travel', 'trip', 'flight', 'holiday', 'vacation', 'japan', 'iceland')) return 'Plane';
  if (has('bike', 'bicycle', 'cycle')) return 'Bicycle';
  if (has('car', 'vehicle', 'bmw')) return 'Car';
  if (has('laptop', 'computer', 'macbook', 'phone')) return 'Laptop';
  return 'Target';
}

const eye = (hidden) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12Q6 5 12 5Q18 5 22 12Q18 19 12 19Q6 19 2 12ZM15 12A3 3 0 1 1 9 12A3 3 0 1 1 15 12${hidden ? 'M3 3L21 21' : ''}"/></svg>`;

/** One white tile per account: round icon top-right, name and balance bottom-left. */
function accountTile(a, i, hidden) {
  const bal = E.accountBalance(S.data, a);
  const type = ACCOUNT_TYPES.find(([k]) => k === a.type)?.[1] ?? '';
  return `<button class="wl-tile rise" style="--i:${i + 2}" data-act="account" data-id="${a.id}" aria-label="Edit ${esc(a.name)}">
    <span class="wl-ic">${icon(TYPE_ICON[a.type] ?? 'AccountBalanceWallet', 20)}</span>
    <span class="wl-tk">${esc(type)}</span>
    <span class="wl-nm ell">${esc(a.name)}</span>
    <span class="wl-bal ${bal < 0 ? 'neg' : ''}">${hidden ? '••••••' : E.cash(bal)}</span></button>`;
}

export function view() {
  const d = S.data; const today = S.today;
  const accounts = d.accounts.filter((a) => !a.archived);
  const goals = d.goals.filter((g) => !g.archived);
  const total = accounts.reduce((s, a) => s + E.accountBalance(d, a), 0);
  const weekStart = E.addDays(today, -(E.dow(today) - 1));
  const hiddenSet = (S.ui.hidden ??= {}); const hideAll = !!hiddenSet.all;
  const nick = (d.settings.nickname || '').trim();
  const r = E.result(d, E.monthOf(today), today);

  const html = `<div class="wl">
  <div class="wl-top rise">
    <button class="wl-av" data-act="budget" aria-label="Budget settings">${nick ? esc(nick.slice(0, 1).toUpperCase()) : icon('Person', 24)}</button>
    <div class="wl-acts">
      <button class="wl-ib" data-act="eye" data-id="all" aria-label="${hideAll ? 'Show' : 'Hide'} balances">${eye(hideAll)}</button>
      <button class="wl-ib" data-act="settings" aria-label="Settings">${icon('Settings', 20)}</button></div></div>
  <h1 class="wl-hi rise">Hello,<br>${nick ? esc(nick) : 'there'} <span class="wl-wave" aria-hidden="true">👋</span></h1>

  <section class="wl-hero rise" style="--i:1">
    <div class="wl-hk">Total balance · ${accounts.length ? `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}` : 'No accounts yet'}</div>
    <div class="wl-total">${hideAll ? '<span class="big-amount">RM ••••••</span>' : amountHTML(total, 'big-amount')}</div>
    <div class="wl-stats"><span>Today <b>−${E.cash(spending(d, today, today))}</b></span><i></i><span>This week <b>−${E.cash(spending(d, weekStart, today))}</b></span></div>
    <div class="wl-grid wl-accts">
      ${accounts.map((a, i) => accountTile(a, i, hideAll || hiddenSet[a.id])).join('')}
      <button class="wl-tile wl-add rise" style="--i:${accounts.length + 2}" data-act="account" data-id=""><span class="wl-ic">${icon('Add', 20)}</span>
        <span class="wl-nm">Add account</span></button>
    </div>
  </section>

  <section class="wl-spend rise" style="--i:3" aria-label="Free to spend">
    <div class="wl-spend-v">${hideAll ? 'RM ••••••' : E.cash(Math.max(0, r.remaining))}</div>
    <div class="wl-spend-k">Free to spend</div>
  </section>

  <div class="wl-sec rise" style="--i:5"><h2>Goals</h2><button class="wl-link" data-act="new-goal">${icon('Add', 16)} New</button></div>
  ${goals.length ? goals.slice(0, 3).map((g, i) => `<button class="wl-row rise" style="--i:${i + 6}" data-act="goal" data-id="${g.id}"><span class="wl-ic">${icon(goalIcon(g.name), 20)}</span>
      <span class="wl-rt"><b class="ell">${esc(g.name)}</b><small>Saved of ${E.cash(g.targetMinor).replace('.00', '')}</small></span>${amountHTML(E.goalSaved(d, g.id), 'wl-ra')}</button>`).join('')
    : `<p class="wl-note" style="margin-top:0">No goals yet. Tap New to start saving for something.</p>`}
  </div>`;

  return { html, mount(page, { animate }) { if (animate) countUp(page); } };
}
