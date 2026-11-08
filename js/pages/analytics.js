// Analytics: a dark "market" card with the spending line for the week or month, self vs family totals,
// and a dark category table (amount and change against the previous period).
import * as E from '../engine.js';
import { S } from '../state.js';
import { icon } from '../icons.js';
import { amountHTML, countUp, armDraw, CAT_NAMES, CAT_ICONS, CAT_COLORS, WD3, dayLong, esc } from '../ui.js';
import { lineChart, dayBars, flowChart, LINE_PAD, LINE_AXIS } from '../charts.js';
import { dotsIcon } from '../parts.js';

const SPEND = ['EXPENSE', 'BILL_PAYMENT', 'FUND_PURCHASE'];
const st = () => (S.ui.an ??= { monthly: false, sel: null, who: 'all', sort: 'amt', dir: -1 });

function range(monthly, today) {
  const month = E.monthOf(today);
  const start = monthly ? `${month}-01` : E.addDays(today, -(E.dow(today) - 1));
  const len = monthly ? E.daysInMonth(month) : 7;
  const prevStart = monthly ? `${E.addMonths(month, -1)}-01` : E.addDays(start, -7);
  const prevEnd = E.addDays(start, -1);
  return { month, start, end: E.addDays(start, len - 1), len, prevStart, prevEnd };
}

function compute() {
  const s = st(); const today = S.today;
  const r = range(s.monthly, today);
  const dates = Array.from({ length: r.len }, (_, i) => E.addDays(r.start, i));
  const spend = S.data.entries.filter((e) => SPEND.includes(e.type));
  const rows = spend.filter((e) => e.date >= r.start && e.date <= r.end);
  const prev = spend.filter((e) => e.date >= r.prevStart && e.date <= r.prevEnd);
  const day = (date, family) => rows.filter((e) => e.date === date && e.family === family).reduce((t, e) => t + e.amountMinor, 0);
  const self = dates.map((d) => day(d, false)); const family = dates.map((d) => day(d, true));
  const idx = dates.indexOf(today);
  if (s.sel == null || s.sel >= dates.length) s.sel = idx >= 0 ? idx : dates.length - 1;
  const todayIdx = idx >= 0 ? idx : dates.length - 1;
  // A live-tracker style line: at every sample, how much went out in the 24 hours before it.
  // Sampled hourly for a week (every 4 h for a month), so the line moves with each payment.
  const hourOf = (e) => { if (!e.createdAt) return 12; const t = new Date(e.createdAt); return t.getHours() + t.getMinutes() / 60; };
  const marks = rows.map((e) => [dates.indexOf(e.date) * 24 + hourOf(e), e.amountMinor]);
  const clock = new Date(); const now = idx >= 0 ? idx * 24 + clock.getHours() + clock.getMinutes() / 60 : dates.length * 24;
  const step = s.monthly ? 4 : 1; const hours = [];
  for (let h = 0; h <= now + 0.01; h += step) hours.push(h);
  if (hours[hours.length - 1] < now) hours.push(now);
  const curve = hours.map((h) => [h / 24 - 0.5, marks.reduce((t, [m, v]) => t + (m <= h && m > h - 24 ? v : 0), 0)]);
  return { ...r, monthly: s.monthly, dates, self, family, rows, prev, todayIdx, curve, cut: now / 24 - 0.5 };
}

const sum = (a) => a.reduce((x, y) => x + y, 0);
const total = (list) => list.reduce((t, e) => t + e.amountMinor, 0);
const chartLabels = (c) => c.dates.map((d, i) => (c.monthly
  ? (['01', '08', '15', '22'].includes(d.slice(8)) || i === c.dates.length - 1 ? String(Number(d.slice(8))) : '')
  : WD3[E.dow(d) - 1]));
const caption = (c) => { const i = st().sel; return `${dayLong(c.dates[i])} · you paid ${E.cash(c.self[i])}, family paid ${E.cash(c.family[i])}`; };

/** "▲ RM 12.00 (+8%) vs last week": more spending is red, less is yellow. */
function delta(cur, prev, monthly) {
  const what = monthly ? 'last month' : 'last week';
  if (!prev) return cur ? `<span class="an-delta">First ${monthly ? 'month' : 'week'} with spending</span>` : `<span class="an-delta">Nothing spent ${monthly ? 'this month' : 'this week'} yet</span>`;
  const diff = cur - prev; const pct = Math.round((diff / prev) * 100);
  const up = diff > 0;
  return `<span class="an-delta ${diff === 0 ? '' : up ? 'up' : 'down'}"><i></i>${E.cash(Math.abs(diff))} (${up ? '+' : diff < 0 ? '−' : ''}${Math.abs(pct)}%) vs ${what}</span>`;
}

/** History: one row per day (newest first) with the total and a strip of hourly bars, like a step counter's history. */
function historyList(c) {
  const days = c.dates.slice(0, c.todayIdx + 1).map((date, i) => ({ date, total: c.self[i] + c.family[i] })).reverse();
  const shown = c.monthly ? days.filter((d, i) => d.total > 0 || i === 0) : days;
  const fmt = (iso) => { const dt = new Date(iso + 'T00:00:00Z'); return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/^(\w+)/, '$1,'); };
  const row = (d, i) => {
    const hours = Array(24).fill(0);
    for (const e of c.rows) if (e.date === d.date) { const h = e.createdAt ? new Date(e.createdAt).getHours() : 12; hours[h] += e.amountMinor; }
    const upTo = d.date === S.today ? new Date().getHours() : 23;
    return `<button class="an-hrow" style="--i:${i}" data-day="${c.dates.indexOf(d.date)}" aria-label="${fmt(d.date)}, ${E.cash(d.total)}"><span class="an-hl"><small>${fmt(d.date)}</small><b>${E.cash(d.total).replace('RM ', '')}</b></span>${dayBars(hours, upTo)}</button>`;
  };
  return `<section class="an-hist rise" style="--i:1"><h2>History</h2><div class="an-hcard">${shown.length ? shown.map(row).join('') : '<p class="an-none">Nothing logged yet.</p>'}</div></section>`;
}

/** Spending by category as a flow: categories on the left, joined to each payment on the right. Tap to focus one. */
const FLOW_COLORS = ['#FFD83D', '#F5A524', '#141414', '#141414', '#141414', '#141414', '#141414'];
function categoryFlow(c) {
  const s = st();
  const keep = (e) => s.who === 'all' || (s.who === 'family') === e.family;
  const list = c.rows.filter(keep);
  const totals = {}; for (const e of list) totals[e.category] = (totals[e.category] ?? 0) + e.amountMinor;
  const order = Object.entries(totals).sort((p, q) => q[1] - p[1]);
  const color = Object.fromEntries(order.map(([k], i) => [k, FLOW_COLORS[Math.min(i, FLOW_COLORS.length - 1)]]));
  const MAX = 8;
  const pays = [...list].sort((p, q) => q.amountMinor - p.amountMinor);
  const day = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  // Every category gets its biggest payment, then the next biggest overall fill the rest; rows are grouped by category
  // (biggest category on top) so each ribbon leaves its block, bends once, and runs straight to its row.
  const picked = order.map(([k]) => pays.find((e) => e.category === k));
  for (const e of pays) { if (picked.length >= Math.max(MAX, order.length)) break; if (!picked.includes(e)) picked.push(e); }
  const rank = Object.fromEntries(order.map(([k], i) => [k, i]));
  picked.sort((p, q) => rank[p.category] - rank[q.category] || q.amountMinor - p.amountMinor);
  const items = picked.map((e) => ({ cat: e.category, amount: e.amountMinor, name: esc(((e.note || '').trim() || CAT_NAMES[e.category]).slice(0, 22)), sub: esc(E.cash(e.amountMinor) + ' · ' + day(e.date)) }));
  const cats = order.filter(([k]) => items.some((i) => i.cat === k)).map(([k, v], i) => ({ cat: k, amount: v, color: color[k], bright: i < 2, ic: icon(CAT_ICONS[k], 20).replace('<svg ', '<svg style="color:#141414" '), label: esc(CAT_NAMES[k] + ', ' + E.cash(v)) }));
  flowData = { cats, items };
  const tab = (v, t) => `<button class="${s.who === v ? 'on' : ''}" data-who="${v}">${t}</button>`;
  const legend = order.map(([k, v]) => `<button class="fl-leg" data-fcat="${k}" style="--c:${color[k]}"><i></i>${CAT_NAMES[k]}<b>${E.cash(v)}</b></button>`).join('');
  const more = pays.length - picked.length;
  return `<section class="an-cat rise" style="--i:2">
    <div class="fl-head"><h2>Spending by category</h2><span>${order.length} ${order.length === 1 ? 'category' : 'categories'} · ${list.length} ${list.length === 1 ? 'payment' : 'payments'}</span></div>
    <div class="an-tabs sm">${tab('all', 'All')}${tab('self', 'Self-paid')}${tab('family', 'Family-paid')}</div>
    ${items.length ? `<div class="fl-legs">${legend}</div><div class="fl-wrap" id="flow"></div>${more > 0 ? `<p class="fl-more">+${more} smaller ${more === 1 ? 'payment' : 'payments'} not shown</p>` : ''}`
      : `<p class="an-none">No spending ${s.who === 'family' ? 'paid by family ' : s.who === 'self' ? 'paid by you ' : ''}${c.monthly ? 'this month' : 'this week'} yet.</p>`}
  </section>`;
}
let flowData = { cats: [], items: [] };

export function view() {
  const c = compute();
  const all = sum(c.self) + sum(c.family); const empty = all === 0;
  const result = E.result(S.data, c.month, S.today);
  const html = `<div class="an-root"><header class="an-hero">
    <div class="hdr-row">
      <button class="circle" data-act="back" aria-label="Back">${icon('ChevronLeft', 26)}</button><div class="hdr-title">Analytics</div>
      <div style="position:relative"><button class="circle" id="more" aria-label="More options">${dotsIcon()}</button>
        <div class="menu" id="menu" hidden><button data-m="settings">Settings</button></div></div></div>
    <div class="an-tabs" role="tablist"><button class="${c.monthly ? '' : 'on'}" data-period="week" role="tab" aria-selected="${!c.monthly}">This week</button><button class="${c.monthly ? 'on' : ''}" data-period="month" role="tab" aria-selected="${c.monthly}">This month</button></div>
    <div class="an-top rise"><div class="an-k">Total spending</div>${amountHTML(all, 'big-amount')}${delta(all, total(c.prev), c.monthly)}
      <div class="an-split"><span>You paid <b>${E.cash(sum(c.self))}</b></span><span>Family paid <b>${E.cash(sum(c.family))}</b></span></div></div>
    ${empty ? `<div class="an-empty"><div style="opacity:.5">${icon('BarChart', 40)}</div><b>${c.monthly ? 'No spending this month yet' : 'No spending this week yet'}</b><span>Your daily line appears here as soon as you log an expense.</span></div>`
      : `<div class="an-chart" id="chart"></div><div class="an-cap" id="cap">${caption(c)}</div>`}
  </header>
  ${historyList(c)}
  ${categoryFlow(c)}
  <p class="muted small" style="margin-top:16px">Total spending is everything you spent plus what family paid for you, including bill payments and fund purchases. Your daily allowance only counts what you paid yourself. Transfers and fund top-ups aren’t counted. Budget left this month: ${E.cash(result.remaining)}</p></div>`;

  return { html, cls: 'an', mount(page, { animate, rerender }) {
    const host = page.querySelector('#chart');
    if (host) {
      const values = c.self.map((v, i) => v + c.family[i]);
      const draw = (anim) => { host.innerHTML = lineChart({ values, curve: c.curve, cut: c.cut, labels: chartLabels(c), selected: st().sel, width: host.clientWidth, animate: anim }); if (anim) armDraw(host); };
      draw(animate);
      const pick = (e) => {
        const r = host.getBoundingClientRect(); const n = c.dates.length;
        const f = (e.clientX - r.left - LINE_AXIS) / Math.max(1, r.width - LINE_AXIS - LINE_PAD);
        const i = Math.max(0, Math.min(n - 1, Math.floor(f * n)));
        if (i === st().sel) return;
        st().sel = i; draw(false); page.querySelector('#cap').textContent = caption(c);
        navigator.vibrate?.(4);
      };
      host.addEventListener('pointerdown', (e) => { host.setPointerCapture?.(e.pointerId); pick(e); });
      host.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') pick(e); });
    }
    const flow = page.querySelector('#flow');
    if (flow) {
      flow.innerHTML = flowChart({ ...flowData, width: flow.clientWidth });
      if (!animate) flow.classList.add('still');
      // Tapping a category (node, band or chip) focuses it: everything else fades back. Tap again to clear.
      const focus = (cat) => {
        const on = flow.dataset.focus === cat ? '' : cat; flow.dataset.focus = on;
        flow.querySelector('svg').classList.toggle('focus', !!on);
        flow.querySelectorAll('[data-cat]').forEach((el) => el.classList.toggle('hit', el.dataset.cat === on));
        page.querySelectorAll('.fl-leg').forEach((el) => el.classList.toggle('on', el.dataset.fcat === on));
      };
      flow.addEventListener('click', (e) => { const el = e.target.closest('[data-cat]'); if (el) focus(el.dataset.cat); });
      page.querySelectorAll('.fl-leg').forEach((btn) => btn.addEventListener('click', () => focus(btn.dataset.fcat)));
    }
    const menu = page.querySelector('#menu');
    page.querySelector('#more').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', () => { menu.hidden = true; }, { once: true });
    menu.addEventListener('click', (e) => { if (e.target.closest('[data-m="settings"]')) document.dispatchEvent(new CustomEvent('app:go', { detail: 'settings' })); });
    page.querySelector('.an-root').addEventListener('click', (e) => { // root is replaced on every render, so listeners never pile up
      const p = e.target.closest('[data-period]');
      if (p) { const m = p.dataset.period === 'month'; if (m !== st().monthly) { st().monthly = m; st().sel = null; rerender(); } return; }
      const w = e.target.closest('[data-who]');
      if (w) { st().who = w.dataset.who; return rerender(); }
      const hd = e.target.closest('[data-day]');
      if (hd && host) { st().sel = Number(hd.dataset.day); page.querySelector('#chart').scrollIntoView({ behavior: 'smooth', block: 'center' }); return rerender(); }
    });
    if (animate) countUp(page);
  } };
}
export { esc };
