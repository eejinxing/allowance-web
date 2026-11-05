// Plan: a month calendar where every day wears a mark for how it went, the plans coming up, and a Budget tab with where the money
// comes from and your weekday pattern.
// Every day has a mark you choose (it is never worked out from the amount): none, red, teal or yellow.
//   red dash   = nothing spent; the daily bills aren't counted that day
//   teal dash  = only the amount at the top; the daily bills aren't counted that day
//   yellow dot = the daily bills are counted, plus the amount at the top
// Tap a day to select it, tap it again to switch its mark, tap the amount at the top to type it.
// A past day's amount is the expense you logged; today and later take it as a plan.
import * as E from '../engine.js';
import { S, commit, toast } from '../state.js';
import { icon, swapIcon } from '../icons.js';
import { amountHTML, countUp, compact, monthTitle, dayLong, WD, WD3, esc, openSheet, confirmDialog } from '../ui.js';
import { openPlanDay } from '../editors.js';

const SPEND = ['EXPENSE', 'BILL_PAYMENT', 'FUND_PURCHASE'];
const MONTHS_AHEAD = 2;       // how far forward the calendar can be paged
const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MARK_MODE = { RED: 'free', TEAL: 'lite', YELLOW: 'full' }; const MODE_MARK = { free: 'RED', lite: 'TEAL', full: 'YELLOW' };
const NEXT = { none: 'free', free: 'lite', lite: 'full', full: 'none' }; // the order a tap switches a day through
const MARK_CLASS = { free: 'free', lite: 'lite', full: 'spent' };

// ---------- Budget tab ----------
function weekCard(avg, habit) {
  const max = Math.max(1, ...avg); const top = avg.indexOf(Math.max(...avg)); const has = avg.some((a) => a > 0);
  return `<div class="card rise" style="--i:1;margin-top:12px"><div class="t-title">Your week</div>
    <div class="muted" style="margin-top:2px">${has ? `You spend most on ${WD[top]}s, about ${E.cash(avg[top])}.` : 'Log a few days of spending and your weekly pattern shows up here.'}</div>
    <div class="week">${avg.map((a, i) => `<div>${has && a > 0 ? `<small>${compact(a)}</small>` : ''}<div class="b ${has && i === top ? 'top' : ''}" style="height:0" data-h="${has ? Math.max(4, (a / max) * 100) : 8}%"></div>
      <span class="${has && i === top ? 'top' : ''}">${WD3[i]}</span></div>`).join('')}</div>
    <div class="label" style="margin-top:20px">Spread my money</div>
    <div class="seg"><button class="${habit ? '' : 'on'}" data-act="mode" data-v="EVEN">Evenly</button><button class="${habit ? 'on' : ''}" data-act="mode" data-v="HABIT">Like my habits</button></div>
    <p class="muted small" style="margin:8px 0 0">${habit ? 'Days you usually spend more on get a bigger share, updated as you log.' : 'Every day without a plan gets the same share.'}</p></div>`;
}

const PER = { DAILY: 'a day', WEEKLY: 'a week', MONTHLY: 'a month' };
/** One small line per bill, so it is clear what a total is made of: what it costs each time, and what that comes to this month. */
const billLines = (bills, month, skipped = 0) => bills.map((b) => { const daily = b.frequency === 'DAILY' && skipped > 0; const days = E.daysInMonth(month) - (daily ? skipped : 0);
  return `<div class="mline" style="font-size:14px;opacity:.7;padding-left:12px"><span>${esc(b.name)} · ${E.cash(b.amountMinor)} ${PER[b.frequency] ?? ''}${daily ? ` × ${days} days` : ''}</span><b>${E.cash(E.periodAmount(b.amountMinor, b.frequency, days))}</b></div>`; }).join('');

function budgetTab(d, today, month, r, budget) {
  const family = E.familyBillsMinor(d.bills, month);
  const skipped = E.noSpendDays(d, month, today); const hasDaily = E.dailyBillsMinor(d.bills) > 0;
  // What your marked days add up to: red costs nothing, teal costs only what you typed (instead of the daily bill), yellow costs the daily bill plus what you typed.
  const st = monthState(d, month); const from = E.budgetFrom(d.settings);
  const tally = { free: { n: 0, sum: 0 }, lite: { n: 0, sum: 0 }, full: { n: 0, sum: 0 } };
  for (let n = 1; n <= E.daysInMonth(month); n++) {
    const date = `${month}-${String(n).padStart(2, '0')}`; if (date < from) continue;
    const i = dayInfo(d, date, today, st); if (i.mode) { tally[i.mode].n++; tally[i.mode].sum += i.total ?? 0; }
  }
  const planned = Object.entries(st.plans).filter(([date]) => date >= today).reduce((t, [, v]) => t + v, 0);
  const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
  const marked = [
    tally.free.n ? `<div class="mline" style="font-size:14px;opacity:.7;padding-left:12px"><span>Red · ${days(tally.free.n)}</span><b>no cost</b></div>` : '',
    tally.lite.n ? `<div class="mline" style="font-size:14px;opacity:.7;padding-left:12px"><span>Teal · ${days(tally.lite.n)}, instead of the daily bill</span><b>${E.cash(tally.lite.sum)}</b></div>` : '',
    tally.full.n ? `<div class="mline" style="font-size:14px;opacity:.7;padding-left:12px"><span>Yellow · ${days(tally.full.n)}, extra on top of the bill</span><b>${E.cash(tally.full.sum)}</b></div>` : '',
  ].join('');
  const daysLeft = E.daysInMonth(month) - Number(today.slice(8)) + 1;
  const line = (label, minor, sign) => `<div class="mline"><span>${label}</span><b>${sign} ${E.cash(minor)}</b></div>`;
  return `<div class="card rise" style="--i:0"><div class="row"><div class="grow"><div class="muted">Left for ${daysLeft} days</div>${amountHTML(r.remaining + r.spentToday, 'big-amount', 'font-size:32px;letter-spacing:-.8px')}</div>
      <button class="btn line" data-act="budget" style="min-height:44px">${icon('Edit', 18)} Edit</button></div>
      <hr class="divider" style="margin:16px 0">
      ${line('Income', budget.incomeMinor, '+')}${line('Fixed bills (yours)', E.billsFor(d, budget, today), '−')}${billLines(d.bills.filter((b) => !b.family), month, skipped)}${hasDaily && skipped ? `<p class="muted small" style="margin:2px 0 6px 12px">Daily bills aren’t charged on the ${skipped} days marked red or teal in Calendar.</p>` : ''}${marked}${planned > 0 ? line('Planned for coming days', planned, '−') : ''}${line('Saved for your goals', budget.savingsMinor, '−')}${line('Spent so far', r.spentBeforeToday + r.spentToday, '−')}
      ${family ? `<div class="mline" style="opacity:.6"><span>Bills paid by family</span><b>${E.cash(family)}</b></div>${billLines(d.bills.filter((b) => b.family), month)}<p class="muted small" style="margin:4px 0 0">Shown for your total only. It isn’t taken from your budget.</p>` : ''}
      <p class="muted small" style="margin:12px 0 0">Every day you log, the rest of the month re-balances around what’s left.</p></div>
    ${weekCard(E.weekdayAverages(d, today), d.settings.weightMode === 'HABIT')}`;
}

// ---------- Calendar tab ----------
/** Plans, free spending per day and how many expenses make it up, for one month. Fixed bills and fund purchases never count: only what you spend freely does. */
function monthState(d, view) {
  const budget = d.budgets.find((b) => b.month === view); const plans = budget?.plans ?? {}; const marks = budget?.marks ?? {}; const spent = {}; const count = {}; const family = {};
  for (const e of d.entries) if (e.family && e.type === 'EXPENSE' && e.date.startsWith(view)) family[e.date] = (family[e.date] ?? 0) + e.amountMinor; // shown, but never part of your budget
  for (const e of d.entries) if (!e.family && e.type === 'EXPENSE' && e.date.startsWith(view)) { spent[e.date] = (spent[e.date] ?? 0) + e.amountMinor; count[e.date] = (count[e.date] ?? 0) + 1; }
  return { plans, marks, spent, count, family };
}

/**
 * total = what the day came to (null while it has no mark), mode = its mark. The mark is what you chose, never worked out from the amount:
 * typing 23 on a teal day leaves it teal. A past day's total is what was logged; today and later take their plan, or what has been logged.
 * Days marked before marks existed fall back on their amounts: nothing = red, logged spending = yellow, a plan = teal.
 */
function dayInfo(d, date, today, st) {
  const logged = st.spent[date] ?? 0; const plan = st.plans[date]; const marked = MARK_MODE[st.marks[date]] ?? null;
  let total = date < today ? (logged > 0 ? logged : null) : plan ?? (logged || null);
  if (total == null && marked) total = 0;
  let mode = marked ?? (total == null ? null : total === 0 ? 'free' : date < today ? 'full' : 'lite');
  if (mode === 'free' && total > 0) mode = 'lite'; // red can't have spending on it
  return { total, mode, count: st.count[date] ?? 0, family: st.family[date] ?? 0 };
}

/** The selected day at the top of the calendar: what that day comes to (a field you type into), and what is suggested for it. */
function dayHead(date, today, started, info, suggested, swaps = []) {
  const name = dayLong(date);
  if (date < started) return `<div class="pl-sel off"><span class="pl-sel-d">${esc(name)}</span><span class="pl-sel-a">—</span><span class="pl-chip">Before your budget started</span></div>`;
  const { total, mode, count, family } = info;
  const locked = count > 1 && date < today; // several expenses: change them one by one in Activity
  const chip = suggested < 0 ? 'No budget left this month' : `Suggested ${E.cash(suggested)}`;
  const field = `<label class="pl-sel-a"><span class="pl-rm">RM</span><input class="pl-in" data-amount="${date}" inputmode="decimal" enterkeyhint="done" autocomplete="off"
    value="${E.decimal(total ?? 0)}" style="width:${Math.max(3, E.decimal(total ?? 0).length + 0.5)}ch" aria-label="${esc(`${name} spent`)}" ${locked ? 'readonly' : ''}>${locked ? '' : icon('Edit', 18)}</label>`;
  return `<div class="pl-sel"><span class="pl-sel-d">${esc(name)}</span>${field}<span class="pl-chip ${MARK_CLASS[mode] ?? ''}">${esc(locked ? `${count} expenses, see Activity` : chip)}</span>${swaps.length ? `<span class="pl-sw">${swaps.map((w) => `<span>${swapIcon({ cheaperName: w.name, usualName: w.usual ?? '' }, 14)} ${esc(w.name)}${w.usual ? ` instead of ${esc(w.usual)}` : ''} · −${E.cash(w.savingMinor)}</span>`).join('')}</span>` : ''}${family ? `<span class="pl-sw"><span>Family paid ${E.cash(family)}, not part of your budget</span></span>` : ''}</div>`;
}

const infoButton = () => `<button class="pl-info" data-pl-info aria-label="What the marks mean"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.6" r=".6" fill="currentColor"/></svg></button>`;

/** The explanation of the marks, in a small sheet instead of a legend on the calendar. */
function openMarkInfo() {
  const row = (cls, title, text) => `<div class="mk-row"><span class="mk-mark"><i class="${cls}"></i></span><div><b>${title}</b><p>${text}</p></div></div>`;
  openSheet({ title: 'What the marks mean', noSave: true, fields: [{ t: 'html', html: () => `<div class="mk-list">
    ${row('mk-free', 'No spend', 'Nothing spent. Daily bills aren’t counted that day.')}
    ${row('mk-lite', 'Only this much', 'Just the amount at the top. Daily bills aren’t counted that day.')}
    ${row('mk-full', 'Budget + extra', 'Daily bills are counted, plus the amount at the top.')}
    ${row('mk-none', 'No mark', 'Nothing set for this day yet.')}
        <p class="mk-tip">Tap a day to select it. Tap it again to switch its mark, and tap the amount to type it.</p></div>` }] });
}

function calendarCard(month, today, infos, sel, paybacks = []) {
  const started = E.budgetFrom(S.data.settings); // the whole month you set up in counts, so earlier days can still be logged
  const lead = E.dow(`${month}-01`) - 1; const dim = E.daysInMonth(month);
  const total = Math.ceil((lead + dim) / 7) * 7;
  const first = `${month}-01`;
  const cells = Array.from({ length: total }, (_, i) => E.addDays(first, i - lead));
  const earliest = E.monthOf(S.data.settings.started); const latest = E.addMonths(E.monthOf(today), MONTHS_AHEAD);
  const arrow = (dir, name, off) => `<button class="pl-arrow" data-pl-month="${dir}" aria-label="${name} month" ${off ? 'disabled' : ''}>${icon(dir < 0 ? 'ChevronLeft' : 'ChevronRight', 26)}</button>`;
  const day = (date) => {
    const num = Number(date.slice(8));
    if (E.monthOf(date) !== month) return `<span class="pl-d out">${num}</span>`;
    if (date < started) return `<span class="pl-d off">${num}</span>`;
    const { total: sum, mode } = infos[date];
    const hint = { free: 'no spend', lite: `only ${E.cash(sum ?? 0)}`, full: `budget used, ${E.cash(sum ?? 0)} in all` }[mode] ?? 'not marked';
    const cls = ['pl-d', date === today && 'today', date === sel && 'sel', MARK_CLASS[mode]].filter(Boolean).join(' ');
    return `<button class="${cls}" style="--n:${num}" data-date="${date}" aria-label="${esc(`${dayLong(date)}, ${hint}`)}"><b>${num}</b><i></i></button>`;
  };
  const picked = E.monthOf(sel) === month ? dayHead(sel, today, started, infos[sel], E.allowanceOn(S.data, sel, today), paybacks.flatMap((p) => p.days.filter((x) => x.date === sel).flatMap((x) => x.swaps))) : `<div class="pl-sel off"><span class="pl-sel-a">—</span><span class="pl-chip">Pick a day</span></div>`;
  return `<div class="pl-cal rise" style="--i:1">
    <div class="pl-cal-h">${arrow(-1, 'Previous', month <= earliest)}<b>${monthTitle(month)}</b>${arrow(1, 'Next', month >= latest)}</div>
    <div aria-live="polite">${picked}</div>
    <div class="pl-wk">${HEAD.map((h) => `<span>${h}</span>`).join('')}</div>
    <div class="pl-grid">${cells.map(day).join('')}</div>
    ${infoButton()}
  </div>`;
}

/** Plans from today onwards, soonest first. */
function upcoming(d, today) {
  const out = [];
  for (const b of d.budgets) for (const [date, minor] of Object.entries(b.plans || {})) if (date >= today) out.push({ date, minor });
  return out.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 8);
}

function upcomingList(items) {
  const body = items.length ? items.map((p, i) => `<button class="pl-row rise" style="--i:${i + 3}" data-act="day" data-date="${p.date}" aria-label="${esc(`${dayLong(p.date)}, ${p.minor === 0 ? 'no-spend day' : `planned ${E.cash(p.minor)}`}. Tap to edit`)}">
      <span class="pl-ic">${icon(p.minor === 0 ? 'Check' : 'CalendarMonth', 22)}</span>
      <span class="pl-tx"><b>${p.minor === 0 ? 'No-spend day' : 'Planned spend'}</b><small>${esc(dayLong(p.date))}</small></span>
      <b class="pl-amt">${p.minor === 0 ? 'No spend' : E.cash(p.minor)}</b><span class="pl-go">${icon('ChevronRight', 20)}</span></button>`).join('')
    : `<div class="pl-none rise" style="--i:3">No plans yet. Select a coming day and tap it again to mark it, or type an amount at the top.</div>`;
  return `<h3 class="pl-sub rise" style="--i:2">Upcoming plans</h3>${body}`;
}

/** Spending logged in the month on show, newest first. */
function activityList(d, view) {
  const items = d.entries.filter((e) => !e.family && SPEND.includes(e.type) && e.date.startsWith(view))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt ?? 0) - (a.createdAt ?? 0))).slice(0, 8);
  if (!items.length) return '';
  const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();
  return `<h3 class="pl-sub rise" style="--i:3">Activity</h3>` + items.map((e, i) => `<button class="pl-row rise" style="--i:${i + 4}" data-act="day" data-date="${e.date}" aria-label="${esc(`${dayLong(e.date)}, spent ${E.cash(e.amountMinor)}. Tap to edit`)}">
      <span class="pl-ic">${icon('Coin', 22)}</span>
      <span class="pl-tx"><b>${esc(e.note.trim() || cap(String(e.category)))}</b><small>${esc(cap(String(e.category)))}</small><small>${esc(dayLong(e.date))}</small></span>
      <b class="pl-amt out">−${E.cash(e.amountMinor)}</b><span class="pl-go">${icon('ChevronRight', 20)}</span></button>`).join('');
}

function calendarTab(d, today, month) {
  const view = S.ui.planMonth ?? month; const sel = S.ui.planSel ?? today;
  const st = monthState(d, view);
  const infos = {};
  for (let n = 1; n <= E.daysInMonth(view); n++) { const date = `${view}-${String(n).padStart(2, '0')}`; infos[date] = dayInfo(d, date, today, st); }
  return calendarCard(view, today, infos, sel, d.budgets.find((b) => b.month === view)?.paybacks ?? []) + upcomingList(upcoming(d, today)) + activityList(d, view);
}

// ---------- page ----------
export function view() {
  const d = S.data; const today = S.today; const month = E.monthOf(today);
  const tab = S.ui.planTab ?? 'cal';
  const budget = d.budgets.find((b) => b.month === month) ?? E.makeBudget(d.settings, d.bills, month);
  const html = `<div class="pl-root">
    <div class="pl-top rise" style="--i:0"><button class="circle" data-act="home" aria-label="Back to Home">${icon('ChevronLeft', 26)}</button><h1>Planning</h1><button class="pl-new" data-pl-new>${icon('AddBold', 16)} Plan a day</button></div>
    <div class="pl-tabs rise" style="--i:0" role="tablist">
      <button class="${tab === 'budget' ? 'on' : ''}" role="tab" aria-selected="${tab === 'budget'}" data-pl-tab="budget">Budget</button>
      <button class="${tab === 'cal' ? 'on' : ''}" role="tab" aria-selected="${tab === 'cal'}" data-pl-tab="cal">Calendar</button></div>
    ${tab === 'budget' ? budgetTab(d, today, month, E.result(d, month, today), budget) : calendarTab(d, today, month)}</div>`;

  return { html, cls: 'pl', mount(page, { animate, rerender }) {
    if (tab === 'budget') requestAnimationFrame(() => requestAnimationFrame(() => page.querySelectorAll('.week .b').forEach((b) => { b.style.height = b.dataset.h; })));
    if (animate) countUp(page);
    const root = page.querySelector('.pl-root'); // replaced on every render, so these listeners never pile up
    const info = (date) => dayInfo(S.data, date, today, monthState(S.data, E.monthOf(date)));

    // Set what a day comes to. A past day is logged spending (one expense, replaced in place); today and later take a plan.
    // Set what a day comes to: a number, or null for "no mark". A past day is logged spending (one expense, replaced in place) with a
    // no-spend mark for zero; today and later take a plan. Taking away something you logged asks first.
    const applyDay = async (date, minor, mark) => {
      if (date >= today) return commit((data) => E.setMark(E.setPlan(data, date, minor, today), date, mark, today), null);
      const mine = S.data.entries.filter((e) => e.date === date && e.type === 'EXPENSE' && !e.family);
      if (mine.length > 1) return toast(`${mine.length} expenses on this day. Change them one by one in Activity.`);
      if (!minor && mine.length && !(await confirmDialog({ title: `Remove ${E.cash(mine[0].amountMinor)} from ${dayLong(date)}?`, text: 'The expense you logged that day will be deleted.', confirm: 'Remove' }))) return rerender();
      commit((data) => {
        let out = data;
        if (!minor && mine.length) out = E.deleteEntry(out, mine[0].id);
        if (minor) out = E.saveEntry(out, mine.length ? { ...mine[0], amountMinor: minor } : E.newEntry({ date, amountMinor: minor, category: 'OTHER' }), today);
        return E.setMark(out, date, mark, today);
      }, null);
    };
    // A starting amount for a teal day: about a third of the day's suggestion.
    const litePick = (budget) => (budget <= 100 ? Math.max(1, Math.floor(budget / 2)) : Math.min(Math.max(100, Math.round(budget / 3 / 100) * 100), budget - 1));
    // Tapping the selected day moves it along: no mark → red → teal → yellow → no mark, for any day.
    const cycle = (date) => {
      const now = info(date);
      if (now.count > 1 && date < today) return toast(`${now.count} expenses on this day. Change them one by one in Activity.`);
      const budget = Math.max(E.allowanceOn(S.data, date, today), 0);
      const next = NEXT[now.mode ?? 'none'];
      applyDay(date, next === 'none' ? null : next === 'free' ? 0 : next === 'full' ? (budget > 0 ? budget : 100) : litePick(budget), MODE_MARK[next] ?? null);
      if (next === 'lite') { const input = document.querySelector('.pl-in'); input?.focus(); input?.select(); } // straight on to typing the amount
    };
    const tapDay = (date) => {
      if ((S.ui.planSel ?? today) === date) return cycle(date);
      S.ui.planSel = date; rerender();
    };
    root.addEventListener('click', (e) => {
      const day = e.target.closest('.pl-d[data-date]');
      if (day) return tapDay(day.dataset.date);
      if (e.target.closest('[data-pl-info]')) return openMarkInfo();
      const tabBtn = e.target.closest('[data-pl-tab]');
      if (tabBtn) { S.ui.planTab = tabBtn.dataset.plTab; return rerender(); }
      const mo = e.target.closest('[data-pl-month]');
      if (mo && !mo.disabled) { S.ui.planMonth = E.addMonths(S.ui.planMonth ?? month, Number(mo.dataset.plMonth)); return rerender(); }
      if (e.target.closest('[data-pl-new]')) { const sel = S.ui.planSel ?? today; return openPlanDay(sel >= today ? sel : today); }
    });
    // The amount at the top: select it on focus, grow with what's typed, save when you finish.
    root.addEventListener('focusin', (e) => { if (e.target.matches('.pl-in')) setTimeout(() => e.target.select?.(), 0); });
    root.addEventListener('input', (e) => { if (e.target.matches('.pl-in')) e.target.style.width = `${Math.max(3, e.target.value.length + 0.5)}ch`; });
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.pl-in')) { e.preventDefault(); e.target.blur(); } });
    root.addEventListener('change', (e) => {
      const input = e.target.closest('.pl-in'); if (!input || input.readOnly) return;
      const date = input.dataset.amount; let typed;
      try { typed = E.zeroOrPositive(input.value); } catch (err) { toast(err.message); return rerender(); }
      // Typing never changes a mark, except: a day with no mark that you give an amount becomes yellow, and a red day that you give one becomes teal.
      const now = info(date); let mode = now.mode;
      if (!mode && typed === 0) return rerender();
      if (!mode) mode = 'full'; else if (mode === 'free' && typed > 0) mode = 'lite';
      applyDay(date, typed, MODE_MARK[mode]);
    });
  } };
}
