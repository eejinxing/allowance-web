// Fragments reused by several pages: transaction rows, month picker, header buttons.
import * as E from './engine.js';
import { icon } from './icons.js';
import { esc, TYPE_NAMES, CAT_ICONS, dayShort, monthTitle } from './ui.js';

export function entryIconName(e) {
  switch (e.type) {
    case 'TRANSFER': return 'SwapHoriz';
    case 'GOAL_DEPOSIT': case 'GOAL_WITHDRAWAL': return 'Savings';
    case 'FUND_ALLOCATION': case 'FUND_RELEASE': return 'AccountBalanceWallet';
    case 'ADJUSTMENT': return 'Tune';
    case 'INCOME': case 'SCHEDULED_INCOME': return 'Download';
    default: return CAT_ICONS[e.category] ?? 'MoreHoriz';
  }
}

export function whenLabel(e, today) {
  const label = e.date === today ? 'Today' : e.date === E.addDays(today, -1) ? 'Yesterday' : dayShort(e.date);
  const made = new Date(e.createdAt);
  const sameDay = e.createdAt && E.todayISO(made) === e.date;
  return sameDay ? `${label}, ${String(made.getHours()).padStart(2, '0')}:${String(made.getMinutes()).padStart(2, '0')}` : label;
}

export function signFor(e) {
  if (['EXPENSE', 'BILL_PAYMENT', 'FUND_PURCHASE'].includes(e.type)) return '-';
  if (['INCOME', 'SCHEDULED_INCOME', 'FUND_RELEASE', 'GOAL_WITHDRAWAL'].includes(e.type)) return '+';
  return '';
}

export function txnRow(e, today, data) {
  const title = e.note || TYPE_NAMES[e.type];
  const acct = data?.accounts.find((a) => a.id === e.accountId)?.name;
  const sub = [whenLabel(e, today), e.family ? 'Paid by family' : null, acct].filter(Boolean).join(' · ');
  return `<button class="txn" data-act="entry" data-id="${e.id}">${icon(entryIconName(e), 26)}<div class="grow"><div class="ell"><b>${esc(title)}</b></div><div class="sub ell">${esc(sub)}</div></div>
    <b style="white-space:nowrap">${signFor(e)}${E.cash(e.amountMinor)}</b></button>`;
}

export function monthPicker(month, earliest, latest) {
  return `<div class="row" style="justify-content:space-between;margin:4px 0 8px">
    <button class="ghost" data-act="month" data-d="-1" ${month <= earliest ? 'disabled style="opacity:.3"' : ''} aria-label="Previous month">${icon('ChevronLeft', 24)}</button>
    <b class="t-title">${monthTitle(month)}</b>
    <button class="ghost" data-act="month" data-d="1" ${month >= latest ? 'disabled style="opacity:.3"' : ''} aria-label="Next month">${icon('ChevronRight', 24)}</button></div>`;
}

export const circleBtn = (act, name, label, extra = '') => `<button class="circle" data-act="${act}" aria-label="${label}" ${extra}>${icon(name, 24)}</button>`;
export const dotsIcon = () => `<svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true"><circle cx="3" cy="4" r="2.6" fill="currentColor"/><circle cx="13" cy="4" r="2.6" fill="currentColor"/><circle cx="23" cy="4" r="2.6" fill="currentColor"/></svg>`;
