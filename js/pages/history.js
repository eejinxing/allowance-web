// History: every entry, grouped by day, with month, search and category filters.
import * as E from '../engine.js';
import { S } from '../state.js';
import { icon } from '../icons.js';
import { esc, header, emptyCard, CAT_NAMES, TYPE_NAMES, dayLong, countUp } from '../ui.js';
import { monthPicker, txnRow } from '../parts.js';

const filters = () => (S.ui.history ??= { month: E.monthOf(S.today), q: '', cat: 'ALL' });

function listHTML() {
  const f = filters(); const d = S.data;
  const spend = ['EXPENSE', 'BILL_PAYMENT', 'FUND_PURCHASE'];
  const q = f.q.trim().toLowerCase();
  const rows = d.entries.filter((e) => e.date.startsWith(f.month)
    && (f.cat === 'ALL' || (e.category === f.cat && spend.includes(e.type)))
    && (!q || e.note.toLowerCase().includes(q) || TYPE_NAMES[e.type].toLowerCase().includes(q)
      || (d.accounts.find((a) => a.id === e.accountId)?.name ?? '').toLowerCase().includes(q)))
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
  if (!rows.length) return emptyCard('Nothing matches', 'Try another month, category or search.', f.q || f.cat !== 'ALL' ? 'Clear filters' : '', 'clear-filters');
  const days = [...new Set(rows.map((e) => e.date))];
  return days.map((day) => `<div class="label muted" style="margin-top:14px">${dayLong(day)}</div>${rows.filter((e) => e.date === day).map((e) => txnRow(e, S.today, d)).join('')}`).join('');
}

export function view() {
  const f = filters(); const started = E.monthOf(S.data.settings.started); const latest = E.monthOf(S.today);
  const html = `${header({ title: 'History', sub: 'Every ringgit, accounted for.', back: true })}
    ${monthPicker(f.month, started, latest)}
    <label class="field rise"><span>Search notes, types or accounts</span><input id="hq" value="${esc(f.q)}" autocomplete="off" enterkeyhint="search"></label>
    <div class="chips rise" style="--i:1;margin-bottom:6px">${[['ALL', 'All'], ...Object.entries(CAT_NAMES)].map(([k, n]) => `<button class="chip ${f.cat === k ? 'on' : ''}" data-act="cat" data-v="${k}">${n}</button>`).join('')}</div>
    <div id="hlist">${listHTML()}</div>`;
  return { html, mount(page, { animate }) {
    const input = page.querySelector('#hq');
    input.addEventListener('input', () => { f.q = input.value; page.querySelector('#hlist').innerHTML = listHTML(); });
    if (animate) countUp(page);
  } };
}
export { icon };
