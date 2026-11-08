// Home: a greeting, one yellow summary card (today's money, concentric rings and four figures for this month),
// quick actions and recent activity.
import * as E from '../engine.js';
import { S } from '../state.js';
import { icon } from '../icons.js';
import { esc, amountHTML, countUp, compact } from '../ui.js';
import { txnRow } from '../parts.js';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

const SPEND = ['EXPENSE', 'BILL_PAYMENT', 'FUND_PURCHASE']; // the same self-paid spending the habit weights look at
// The four figures, outermost ring first. The ring and its cell share a colour, so the rings need no legend.
const CELLS = [['spent', 'Spent', '#FFD83D'], ['income', 'Income', '#7ED9B0'], ['transfer', 'Trans', '#8ED1F5'], ['saved', 'Saved', '#FFA3C4']];

/** Money spent, received, moved between accounts and set aside between two dates (inclusive). */
function periodStats(d, from, to) {
  const s = { spent: 0, income: 0, transfer: 0, saved: 0 };
  for (const e of d.entries) {
    if (e.date < from || e.date > to) continue;
    if (!e.family && SPEND.includes(e.type)) s.spent += e.amountMinor;
    else if (e.type === 'INCOME' || e.type === 'SCHEDULED_INCOME') s.income += e.amountMinor;
    else if (e.type === 'TRANSFER') s.transfer += e.amountMinor;
    else if (e.type === 'GOAL_DEPOSIT' || e.type === 'FUND_ALLOCATION') s.saved += e.amountMinor;
    else if (e.type === 'GOAL_WITHDRAWAL' || e.type === 'FUND_RELEASE') s.saved -= e.amountMinor;
  }
  s.saved = Math.max(0, s.saved);
  return s;
}
/** Short enough for a small cell: 161.5, 1,250 and then 12.3k from RM 1,000 up. */
const short = (minor) => (minor >= 100000 ? `${(minor / 100000).toFixed(1).replace('.0', '')}k` : compact(minor));

/**
 * Four concentric rings inside a grey outer band. Each ring is one figure drawn as a share of the biggest one (which fills 90% of
 * the circle), so the rings compare sizes at a glance. pathLength=100 makes the dash maths plain percentages.
 */
function rings(stats) {
  const max = Math.max(...CELLS.map(([key]) => stats[key]), 0);
  const arcs = CELLS.map(([key, , color], i) => {
    const r = 40 - i * 8.5; const len = stats[key] > 0 ? Math.max(4, (stats[key] / max) * 90) : 0;
    return `<circle cx="50" cy="50" r="${r}" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="6.5"/>`
      + (len ? `<circle class="hm-seg" cx="50" cy="50" r="${r}" pathLength="100" fill="none" stroke="${color}" stroke-width="6.5" stroke-linecap="round" stroke-dasharray="${len} ${100 - len}"/>` : '');
  }).join('');
  const label = CELLS.map(([key, name]) => `${name} ${E.cash(stats[key])}`).join(', ');
  return `<svg class="hm-donut" viewBox="0 0 100 100" role="img" aria-label="This month: ${label}">
    <circle cx="50" cy="50" r="49" fill="#3a3a3d"/><circle cx="50" cy="50" r="45.5" fill="#141416"/><g transform="rotate(-90 50 50)">${arcs}</g></svg>`;
}

export function view() {
  const d = S.data; const today = S.today; const month = E.monthOf(today);
  const r = E.result(d, month, today);
  const over = r.remaining < 0 || r.todayRemaining < 0;
  const daysLeft = E.daysInMonth(month) - Number(today.slice(8)) + 1;
  const stats = periodStats(d, `${month}-01`, today);
  const recent = [...d.entries].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)).slice(0, 8);
  const nick = d.settings.nickname;
  // A plan for today (set on the Plan calendar) decides today's allowance: 0 = a no-spend day, more = spend only that much.
  const plan = d.budgets.find((b) => b.month === month)?.plans?.[today];
  const noSpend = plan === 0;
  const label = r.todayRemaining < 0 ? (noSpend ? 'Spent on a no-spend day' : 'Over budget today') : noSpend ? 'No-spend day' : r.todayAllowance === 0 ? 'No allowance today' : 'Available to spend today';
  const sub = r.todayRemaining < 0 ? `${E.cash(-r.todayRemaining)} over today’s ${noSpend ? 'no-spend plan' : 'budget'}`
    : noSpend ? 'You planned to spend nothing today' : r.todayAllowance === 0 ? 'Nothing to spend today'
    : `Spent ${E.cash(r.spentToday)} of ${E.cash(r.todayAllowance)} today${plan > 0 ? ' (your limit)' : ''}`;

  const html = `
  <div class="hm-top rise" style="--i:0">
    <button type="button" class="hm-hi" data-act="budget" aria-label="Edit my name, income and bills"><img class="hm-av" src="img/tiger_head.webp" alt=""><span><small>${greeting()},</small><b>${nick ? esc(nick) : 'there'}</b></span></button>
    <button class="circle" data-act="settings" aria-label="Settings">${icon('Settings', 24)}</button>
  </div>
  <section class="hm-card ${over ? 'over' : ''} rise" style="--i:1">
    <div class="hm-head"><span class="hm-lbl">${label}</span><button class="hm-mini" data-act="plan" aria-label="Plan this month">${icon('CalendarMonth', 20)}</button></div>
    <div class="hm-amt">${amountHTML(r.todayRemaining, 'num')}</div>
    <div class="hm-sub">${sub}</div>
    <div class="hm-meta"><div><small>Left this month</small><b>${E.cash(r.remaining)}</b></div><div class="r"><small>Days left</small><b>${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}</b></div></div>
    <div class="hm-grid">
      ${rings(stats)}
      <div class="hm-panel">
        <div class="hm-ttl">This month<small>RM</small></div>
        <div class="hm-box">${CELLS.map(([key, name, color]) => `<div class="hm-cell" style="--c:${color}" title="${name} ${E.cash(stats[key])}"><span>${name}</span><b>${short(stats[key])}</b></div>`).join('')}</div>
      </div>
    </div>
  </section>
  <div class="hm-actions rise" style="--i:2">
    <button class="hm-act primary" data-act="add">${icon('AddBold', 22)}<span>Add</span></button>
    <button class="hm-act" data-act="plan">${icon('CalendarMonth', 22)}<span>Plan</span></button>
    <button class="hm-act" data-act="transfer">${icon('SwapHoriz', 22)}<span>Transfer</span></button>
  </div>
  <div class="row rise" style="--i:3;margin-top:26px"><h3 class="grow" style="margin:0;font-size:18px;font-weight:600">Transactions</h3>
    <button class="ghost" data-act="history" aria-label="See all transactions" style="margin-right:-12px">${icon('ArrowRight', 24)}</button></div>
  <div style="margin-top:10px">${recent.length ? recent.map((e, i) => `<div class="rise" style="--i:${i + 4}">${txnRow(e, today, d)}</div>`).join('') : `
    <div class="empty rise" style="--i:4"><img class="tiger" src="img/tiger_head.webp" alt="">
      <h4>No transactions yet</h4><p>Log your first expense and your budget updates on its own.</p>
      <button class="btn yellow" data-act="add">${icon('AddBold', 18)} Add an expense</button></div>`}</div>`;

  return { html, cls: 'hm', mount(page, { animate }) { if (animate) countUp(page); } };
}
