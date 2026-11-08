// Budget assistant: say "spent RM3 on coffee" or "Sneakers RM 120" (English or 中文) and it records it or reads your budget.
// It runs on-device with plain rules (see nlu.js): no AI service, no key, no cost, and it works offline.
import * as E from '../engine.js';
import { S, commit, render } from '../state.js';
import { icon, swapIcon } from '../icons.js';
import { esc, WD3, openSheet } from '../ui.js';
import { interpret, isChinese, spendingTotal } from '../nlu.js';
import * as llm from '../llm.js';
import { recall, describe, hint } from '../memory.js';

// ---------- the picture: one bar per day, like a stats chart ----------
// The round badge on each bar: today it is everything spent today (your usual day plus this purchase); on the days after it is the most you
// can spend that day. A bar is as tall as its layers add up to and each layer is sized by its number:
//   today:      the extra on top (+8), your usual day under it (30)
//   days after: your usual day (30) with what is deducted for the purchase under it (−2)
/** Whole ringgit when big, sen when small, so a RM 1.19 trim and a RM 114 day both stay readable in a narrow bar. */
const rm = (m) => { const v = Math.abs(m) / 100; return (m < 0 ? '−' : '') + (Number.isInteger(v) || v >= 100 ? Math.round(v) : v.toFixed(v < 10 ? 2 : 1)); };
const signed = (m) => (m > 0 ? '+' : m < 0 ? '−' : '') + rm(Math.abs(m));
/** "2026-11-04" → "11/04", the way the date sits under each bar. */
const md = (date) => `${date.slice(5, 7)}/${date.slice(8)}`;
const dayCount = (n) => `${n} day${n === 1 ? '' : 's'}`;
const next = (n) => (n === 1 ? 'the next day' : `the next ${n} days`);
const SHOWN = 6; // days drawn (today and five more), so every bar is wide; a plan longer than that scrolls

/** The explanation of the chart, in a small sheet, so the bars themselves can stay free of words. */
export function openChartInfo() {
  const row = (cls, title, text) => `<div class="mk-row"><span class="mk-mark"><i class="mk-sq ${cls}"></i></span><div><b>${title}</b><p>${text}</p></div></div>`;
  openSheet({ title: 'Reading the chart', noSave: true, fields: [{ t: 'html', html: () => `<div class="mk-list">
    <div class="mk-row"><span class="mk-mark"><i class="mk-dot">8</i></span><div><b>The round number</b><p>Today it is everything spent today. On the days after it is the most you can spend that day.</p></div></div>
    ${row('red', 'Red bar: today', 'The top part is the extra from this purchase. The bottom part is your usual day.')}
    ${row('green', 'Green bars: the days after', 'The big part is your usual day. The small piece at the bottom is what is deducted from it to pay the purchase back.')}
    <div class="mk-row"><span class="mk-mark"><span class="bc-sw on" style="margin:0">${swapIcon({ cheaperName: 'Bread' }, 15)}</span></span><div><b>The round icons under a date</b><p>Cheaper swaps you can use that day. Tap one to switch it on and it lights up. A swap for a fixed bill (like breakfast) adds its own yellow block showing how much that bill goes down by. Any other swap is deducted from that day. The rest is shared out again.</p></div></div>
    </div>` }] });
}

/** Your budget as it would be if today also had an extra purchase of `amount`; null if that can't be recorded. */
function withSpend(amount) {
  try { return E.result(E.saveEntry(S.data, E.newEntry({ date: S.today, amountMinor: amount, category: 'SHOPPING' }), S.today), E.monthOf(S.today), S.today); } catch { return null; }
}
const laterDays = (r) => Object.keys(r.futureAllowances).sort();

/**
 * cols: [{ date, now, over, badge, layers: [{ text, label, v }] (top first), swaps }], amounts in minor units.
 * A bar's height is the sum of its layers' v; a thin layer still gets enough room to be read.
 */
const BAR_H = 230; const LABEL_H = 62;
function chartHTML(cols, aria, line, head, turn) {
  const sum = (c) => c.layers.reduce((t, l) => t + Math.max(l.v ?? 0, 0), 0);
  const max = Math.max(1, ...cols.map(sum));
  const bars = cols.map((c) => {
    const layers = c.layers.map((l, i) => `<i class="s${i}${l.cls ? ` ${l.cls}` : ''}" style="flex:${Math.max(l.v ?? 0, 1)} 1 0"><b>${l.text}</b>${l.sub ? `<em>${esc(l.sub)}</em>` : ''}</i>`).join('');
    return `<div class="bc-c"><div class="bc-bar ${c.over ? 'bad' : 'good'}" style="height:${Math.max(60, Math.round((sum(c) / max) * BAR_H))}px"><span class="bc-pill">${rm(c.badge)}</span><div class="bc-segs">${layers}</div></div></div>`;
  }).join('');
  // Under each coming day: up to two round swap icons that overlap. A lit one is in use that day; tap to switch it on or off.
  const swapBtn = (c, s, k) => { const on = c.picked?.includes(s.id); return `<button class="bc-sw${on ? ' on' : ''}${s.fits === false ? ' off' : ''}" style="z-index:${on ? 3 : 2 - k}" data-act="ai-swap" data-turn="${turn}" data-date="${c.date}" data-id="${s.id}" aria-pressed="${Boolean(on)}" aria-label="${esc(`${s.cheaperName} instead of ${s.usualName}, saves ${E.cash(E.swapSaving(s))}`)}">${swapIcon(s, 15)}</button>`; };
  const labels = cols.map((c) => `<div class="bc-l"><span class="bc-ic${(c.cands ?? []).length > 2 ? ' n3' : ''}">${(c.cands ?? []).map((sw, k) => swapBtn(c, sw, k)).join('') || '<i></i>'}</span><b>${c.now ? 'Today' : md(c.date)}</b></div>`).join('');
  return `<div class="bc" role="img" aria-label="${esc(aria)}">
    <div class="bc-head"><span class="bc-chip">${head.chip}</span><b>${head.strong}</b><em>${head.soft}</em><button class="bc-info" data-act="ai-info" aria-label="What the chart shows"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.6" r=".6" fill="currentColor"/></svg></button></div>
    <div class="bc-scroll"><div class="bc-in">
      <div class="bc-plot" style="height:${BAR_H + 22}px">${bars}</div>
      <div class="bc-labels" style="height:${LABEL_H}px">${labels}</div></div></div></div>`;
}

function verdictHTML(t, i) {
  const r = E.result(S.data, E.monthOf(S.today), S.today);
  const fits = t.amount <= r.todayRemaining; const after = r.remaining - t.amount;
  const plan = fits ? null : E.payback(S.data, t.amount, S.today, t.pick);
  const full = plan && plan.days.length > 0 && plan.short === 0; // every sen of the overspend can be paid back over the next days
  const data = `data-n="${esc(t.name)}" data-a="${t.amount}" data-turn="${i}"`;
  const goal = `<button class="btn ${full ? 'text' : 'ink'}" data-act="ai-goal" ${data}${full ? ' style="color:var(--ink)"' : ''}>Set as goal</button>`;
  const actions = `<div class="pill-row" style="margin-top:14px;flex-wrap:wrap">${full
    ? `<button class="btn ink" data-act="ai-payback" ${data}>Buy it, pay back over ${dayCount(plan.days.length)}</button>${goal}`
    : `${goal}<button class="btn text" data-act="ai-bought" ${data} style="color:var(--ink)">I bought it</button>`}</div>`;
  const title = `<div class="vz-eyebrow">${esc(t.name)} · ${E.cash(t.amount)}</div><h4>${fits ? 'Fits today’s budget' : after >= 0 ? 'Maybe wait a little' : 'Hold off this month'}</h4>${t.memo ? `<p class="muted small">${esc(t.memo)}</p>` : ''}`;
  const over = after < 0 ? `<p>That’s ${E.cash(-after)} over this month’s budget and would eat into your savings.</p>` : '';

  if (plan && plan.options.length) {
    // Today: your usual day plus the extra. Each coming day: your usual day, with what is deducted for this purchase under it.
    const cols = [{ now: true, over: true, badge: plan.total, layers: [{ text: signed(plan.over), label: 'EXTRA', v: plan.over }, { text: rm(plan.total - plan.over), label: 'USUAL', v: plan.total - plan.over }] },
      ...plan.options.slice(0, SHOWN - 1).map((c) => ({ date: c.date, badge: c.now, cands: c.cands, picked: c.swaps.map((sw) => sw.id),
        // A swap for one of your fixed bills adds its own block under the day: how much that bill goes down by. The day's own money is untouched.
        layers: [{ text: rm(c.was), label: 'USUAL', v: c.now }, ...(c.cut > 0 ? [{ text: signed(-c.cut), label: 'DEDUCTED', v: c.cut }] : []),
          ...c.swaps.filter((sw) => sw.fromBill).map((sw) => ({ text: signed(-E.swapSaving(sw)), sub: String(sw.usualName).trim().split(/\s+/)[0].slice(0, 9).toUpperCase(), label: sw.usualName, v: E.swapSaving(sw), cls: 'bc-bill' }))] }))];
    const avg = Math.round(plan.covered / plan.days.length);
    const used = plan.days.some((c) => c.swaps.length);
    const big = `RM ${rm(plan.total - plan.over)} + ${rm(plan.over)} = RM ${rm(plan.total)}`;
    const small = used ? `Swap in cheaper options over ${next(plan.days.length)} to make up the ${E.cash(plan.covered)}.`
      : `${full ? 'Pay it back over' : 'Trim'} ${next(plan.days.length)}: about ${E.cash(avg)} less a day.`;
    const head = { chip: 'PLAN', strong: dayCount(plan.days.length), soft: 'to pay back' };
    // A swap that matches one of your fixed bills (a Breakfast bill → the breakfast swap), priced against that bill. Tapping only previews it.
    // Once tapped it says what changes: "Breakfast RM 10.00 → RM 6.88 on 11/06"; before that it explains what the icon would do.
    const lit = new Map();
    for (const o of plan.options) for (const sw of o.swaps) if (sw.fromBill) lit.set(sw.id, { sw, dates: [...(lit.get(sw.id)?.dates ?? []), md(o.date)] });
    const billSwap = plan.options.flatMap((o) => o.cands).find((c) => c.fromBill);
    const billNote = lit.size ? `<p class="muted small" style="margin:10px 0 0">${[...lit.values()].map(({ sw, dates }) => `<b>${esc(sw.usualName)}</b> ${E.cash(sw.usualMinor)} → ${E.cash(sw.cheaperMinor)} on ${dates.join(', ')} (−${E.cash(E.swapSaving(sw))} a day)`).join('<br>')}<br>Nothing changes until you buy.</p>`
      : billSwap ? `<p class="muted small" style="margin:10px 0 0">From your ${esc(billSwap.usualName)} bill (${E.cash(billSwap.usualMinor)} a day): ${esc(billSwap.cheaperName)} is ${E.cash(billSwap.cheaperMinor)}, so it saves ${E.cash(E.swapSaving(billSwap))}. Tap its icon under a date to use it that day. Nothing changes until you buy.</p>` : '';
    return `<div class="verdict">${title}<div class="vz-big">${big}</div><div class="vz-sub">${small}</div>
      ${chartHTML(cols, `${big}. ${small}`, plan.usual, head, i)}${billNote}
      ${plan.short > 0 ? `<p>${E.cash(plan.short)} more can’t be paid back from the days left.</p>` : ''}${over}${actions}</div>`;
  }
  const sim = withSpend(t.amount); const days = laterDays(r);
  if (!sim || !days.length) return `<div class="verdict">${title}<div class="vz-big">${E.cash(r.todayRemaining - t.amount)} left today</div>${over}${actions}</div>`;

  // Fits today: today is what you have spent plus this purchase; the coming days barely move.
  const cuts = days.map((date) => { const was = Math.max(r.dayShares[date] ?? 0, 0); const now = Math.max(sim.futureAllowances[date] ?? 0, 0); return { date, was, now, cut: Math.max(was - now, 0) }; });
  const avgCut = Math.round(cuts.reduce((s, c) => s + c.cut, 0) / cuts.length);
  const left = Math.max(r.todayRemaining, 0);
  const cols = [{ now: true, badge: r.spentToday + t.amount, layers: [{ text: signed(t.amount), label: 'THIS', v: t.amount }, ...(r.spentToday > 0 ? [{ text: rm(r.spentToday), label: 'SPENT', v: r.spentToday }] : [])] },
    ...cuts.slice(0, SHOWN - 1).map((c) => ({ date: c.date, badge: c.now, layers: [{ text: rm(c.was), label: 'USUAL', v: c.now }, ...(c.cut > 0 ? [{ text: signed(-c.cut), label: 'DEDUCTED', v: c.cut }] : [])] }))];
  const big = `${E.cash(Math.max(left - t.amount, 0))} left today`;
  const small = avgCut > 0 ? `About ${E.cash(avgCut)} less a day for ${next(cuts.length)}.` : `Nothing changes for ${next(cuts.length)}.`;
  const head = { chip: 'NEXT', strong: dayCount(Math.min(cuts.length, SHOWN - 1)), soft: 'after buying' };
  return `<div class="verdict">${title}<div class="vz-big">${big}</div><div class="vz-sub">${small}</div>
    ${chartHTML(cols, `${big}. ${small}`, Math.max(r.todayAllowance, 0), head)}${actions}</div>`;
}

/** Unspent today: how much looser each coming day gets because today's money rolls forward. */
function surplusHTML() {
  const r = E.result(S.data, E.monthOf(S.today), S.today); const days = laterDays(r);
  const extra = days.map((date) => ({ date, base: Math.max(r.dayShares[date] ?? 0, 0), plus: Math.max((r.futureAllowances[date] ?? 0) - (r.dayShares[date] ?? 0), 0) }));
  const avg = extra.length ? Math.round(extra.reduce((s, c) => s + c.plus, 0) / extra.length) : 0;
  const left = Math.max(r.todayRemaining, 0);
  const cols = [{ now: true, badge: r.spentToday, layers: [{ text: rm(left), label: 'LEFT', v: left }, { text: rm(r.spentToday), label: 'SPENT', v: r.spentToday }].filter((l) => l.v > 0) },
    ...extra.slice(0, SHOWN - 1).map((c) => ({ date: c.date, badge: c.base + c.plus, layers: [{ text: rm(c.base), label: 'USUAL', v: c.base }, ...(c.plus > 0 ? [{ text: signed(c.plus), label: 'EXTRA', v: c.plus }] : [])] }))];
  const big = avg > 0 ? `About ${E.cash(avg)} more a day` : `${E.cash(r.todayRemaining)} left today`;
  const small = avg > 0 ? `Today’s ${E.cash(r.todayRemaining)} unspent is shared over ${next(extra.length)}.` : 'Spend it today, or it rolls into tomorrow.';
  const head = { chip: 'NEXT', strong: dayCount(Math.min(extra.length, SHOWN - 1)), soft: 'with today’s leftover' };
  return `<div class="verdict"><div class="vz-eyebrow">Today · ${E.cash(r.todayAllowance)} planned</div><h4>${E.cash(r.todayRemaining)} unspent</h4>
    <div class="vz-big">${big}</div><div class="vz-sub">${small}</div>
    ${chartHTML(cols, `${big}. ${small}`, Math.max(r.todayAllowance, 0), head)}</div>`;
}

/** The conversation reads like a page, not a chat: "Question 1" and the question in big type, then the answer under it, with no bubbles. */
const questionNo = (i) => S.chat.slice(0, i + 1).filter((t) => t.kind === 'me').length;
const turnHTML = (t, i) => (t.kind === 'me' ? `<div class="q"><small>Question ${questionNo(i)}</small><p>${esc(t.text)}</p></div>`
  : t.kind === 'note' ? `<p class="a">${esc(t.text)}</p>` : t.kind === 'surplus' ? surplusHTML() : t.kind === 'rec' ? recordedHTML(t)
  : t.kind === 'receipt' ? receiptHTML(t, i) : verdictHTML(t, i));

/** What the vision model read from a photo. Nothing is saved until you check it and press save: a photo can be misread. */
function receiptHTML(t, i) {
  const cat = t.category[0] + t.category.slice(1).toLowerCase();
  const lines = t.items.slice(0, 6).map((it) => `${esc(it.name)} ${E.cash(it.minor)}`).join('<br>') + (t.items.length > 6 ? '<br>…' : '');
  return `<div class="verdict"><div class="vz-eyebrow">Receipt${t.merchant ? ` · ${esc(t.merchant)}` : ''} · ${cat} · ${md(t.date)}</div><h4>${E.cash(t.amountMinor)}</h4>
    ${lines ? `<p class="muted small">${lines}</p>` : ''}
    ${t.mismatch ? `<p class="muted small">The items add up to ${E.cash(t.itemsMinor)}, not the total. Tax or a service charge can explain that, so check it.</p>` : ''}
    ${t.dateKnown ? '' : '<p class="muted small">I couldn’t read the date, so it says today. Change it if needed.</p>'}
    <p class="muted small">Read from a photo, so it can be wrong. Check the amount, then save.</p>
    <div class="pill-row" style="margin-top:14px"><button class="btn ink" data-act="ai-receipt" data-turn="${i}">Check and save</button></div></div>`;
}
export const receiptAt = (i) => (S.chat[i]?.kind === 'receipt' ? S.chat[i] : null);

/** What was just written to your history, with how much today has left, and a way to take it back. */
function recordedHTML(t) {
  const cat = t.category[0] + t.category.slice(1).toLowerCase();
  if (t.undone) return `<p class="a">Removed ${esc(t.name || cat)} · ${E.cash(t.amount)} from your history.</p>`;
  const when = t.date === S.today ? '' : ` · ${md(t.date)}`;
  const left = t.left >= 0 ? `${E.cash(t.left)} left today.` : `${E.cash(-t.left)} over today’s allowance.`;
  return `<div class="verdict"><div class="vz-eyebrow">Recorded · ${cat}${when}</div><h4>${E.cash(t.amount)}${t.name ? ` · ${esc(t.name)}` : ''}</h4><p>${left}</p>
    <div class="pill-row" style="margin-top:14px"><button class="btn text" data-act="ai-undo" data-id="${esc(t.id)}" style="color:var(--ink)">Undo</button></div></div>`;
}

export function view() {
  const nick = S.data.settings.nickname;
  const html = `<div class="ai-top"><button class="ghost" data-act="back" aria-label="Back">${icon('ChevronLeft', 28)}</button><span>Budget assistant</span>
      <button class="ghost" data-act="goals" aria-label="Wish list">${icon('ChatHistory', 28)}</button></div>
    <div class="ai-scroll" id="scroll">
      <div class="tiger" id="tiger" role="img" aria-label="Budget assistant tiger"><img src="img/tiger_mascot.webp" alt=""></div>
      <div style="text-align:center"><div class="muted" style="font-size:18px">Hello ${nick ? esc(nick) : 'there'}</div>
        <h1>How can I help<br><span class="acc">you today?</span></h1></div>
      <div class="td" aria-label="Things you can do"><div class="td-h">Things you can do</div>
        <button class="td-row" data-act="ai-try" data-q="Spent RM 3 on coffee"><span class="td-ic">${icon('Receipt', 22)}</span><span class="td-tx"><b>Record what you spent</b><small>Say it like “spent RM 3 on coffee”, or in 中文.</small></span></button>
        <button class="td-row" data-act="ai-afford"><span class="td-ic">${icon('ShoppingBag', 22)}</span><span class="td-tx"><b>Can I afford this today?</b><small>See what today’s budget has left for it.</small></span></button>
        <button class="td-row" data-act="ai-try" data-q="Sneakers RM 120"><span class="td-ic">${icon('SwapHoriz', 22)}</span><span class="td-tx"><b>Pay an overspend back</b><small>Spread it over the next days with cheaper swaps.</small></span></button>
        <button class="td-row" data-act="ai-try" data-q="Movie RM 25"><span class="td-ic">${icon('Target', 22)}</span><span class="td-tx"><b>Turn a want into a goal</b><small>Save up for it instead of buying it now.</small></span></button></div>
      <div id="chat" style="align-self:stretch;display:flex;flex-direction:column;gap:26px">${S.chat.map(turnHTML).join('')}</div>
      <div class="muted small" id="aistate">${aiStateText()}</div></div>
    <div class="ai-input"><form id="aiform" autocomplete="off"><button type="button" class="ghost" data-act="ai-camera" aria-label="Read a receipt photo">${icon('Camera', 28)}</button>
      <input type="file" id="aifile" accept="image/*" capture="environment" hidden>
      <input id="aiq" placeholder="Ask anything..." aria-label="Ask the budget assistant" enterkeyhint="send"><button type="button" class="ghost" data-act="ai-voice" aria-label="Voice input">${icon('Waveform', 26)}</button>
      <button class="send" aria-label="Send">${icon('ArrowUp', 26)}</button></form></div>`;

  return { html, cls: 'ai', mount(page, { animate } = {}) {
    const input = page.querySelector('#aiq'); const chat = page.querySelector('#chat'); const scroll = page.querySelector('#scroll');
    const add = (t) => { S.chat.push(t); chat.insertAdjacentHTML('beforeend', turnHTML(t, S.chat.length - 1)); setTimeout(() => scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' }), 80); return S.chat.length - 1; };
    page.__addTurn = add;
    // The AI model, when it was turned on in Settings, starts loading in the background; the line under the chat says how it is going.
    llm.listen('ai', () => { const el = page.querySelector('#aistate'); if (el) el.textContent = aiStateText(); });
    startAI(); // the error, if any, shows in that line, and the rules keep working
    const file = page.querySelector('#aifile');
    file.addEventListener('change', () => { const f = file.files?.[0]; file.value = ''; if (f && !thinking) receiptFrom(f); });
    if (animate === false) scroll.scrollTop = scroll.scrollHeight; // redrawn after recording something: stay at the newest answer, not the top
    page.querySelector('#aiform').addEventListener('submit', (e) => {
      e.preventDefault(); const text = input.value.trim(); if (!text || thinking) return; // one question at a time while the model thinks
      add({ kind: 'me', text });
      input.value = ''; input.blur();
      respond(text).catch((err) => push({ kind: 'note', text: err.message }));
    });
    page.querySelector('#tiger').addEventListener('click', (e) => { const img = e.currentTarget.querySelector('img'); img.style.animation = 'none'; void img.offsetWidth; img.style.animation = ''; });
    page.__chatAdd = add;
  } };
}

/** Adds an answer to the page that is showing now (the page is redrawn after anything is saved, so never hold on to an old one). */
const push = (turn) => document.getElementById('page')?.__addTurn?.(turn);
/** Called from app.js for the quick-question chip and the unavailable inputs. */
export function say(kind, text) { push({ kind, text }); }

// ---------- understanding a sentence ----------
const CAT_ZH = { FOOD: '餐饮', TRANSPORT: '交通', SHOPPING: '购物', FUN: '娱乐', HEALTH: '健康', LIVING: '生活', OTHER: '其他' };
const PERIOD = { today: ['today', '今天'], yesterday: ['yesterday', '昨天'], week: ['in the last 7 days', '最近 7 天'], month: ['this month', '这个月'] };
const HELP = ['I can record what you spent (“Spent RM 3 on coffee”), check a purchase (“Sneakers RM 120”), tell you what’s left today, or add up your spending (“How much did I spend on food this month?”). Say “undo” to take back the last thing I recorded.',
  '我可以帮你记账（“今天花了3块买咖啡”）、判断能不能买（“买球鞋 120块”）、告诉你今天还剩多少，或者统计花费（“这个月吃饭花了多少”）。说“撤销”可以取消我刚记的那笔。'];

/** Starts whichever AI was turned on in Settings (once per visit). */
export function startAI() {
  if (!S.prefs.ai || llm.state.status !== 'off') return;
  (S.prefs.ai === 'ollama' ? llm.loadOllama(S.prefs.ollama?.url, S.prefs.ollama) : llm.load()).catch(() => {});
}

/** The small line under the chat: which kind of understanding is in use. Nothing here ever leaves your own devices. */
function aiStateText() {
  const st = llm.state;
  return st.status === 'ready' ? (st.backend === 'ollama' ? `AI is on: ${st.model} on your computer through Ollama${st.vision ? `, receipts with ${st.vision}` : ', no receipt reading yet'}.` : 'AI is on. It runs on this device.')
    : st.status === 'loading' ? `Starting the AI… ${Math.round(st.progress * 100)}%. Built-in rules answer meanwhile.`
    : st.status === 'error' ? 'The on-device AI couldn’t start, so built-in rules are answering. Details are in Settings.'
    : 'Estimates run on your device using your own budget. Settings can turn on a small on-device AI.';
}
/** Takes a turn out again (the “Thinking…” line). It is the last turn, because nothing new is accepted while the model thinks. */
function drop(turn) {
  const i = S.chat.indexOf(turn); if (i < 0) return;
  S.chat.splice(i, 1); document.getElementById('chat')?.children[i]?.remove();
}
let thinking = false;

/** Reads what you typed and does it. Two readers: the rules, and (when the AI is on) a small model on this device. A record is only
 *  written when both agree it is one (see llm.combine); the rules alone answer when the AI is off. Nothing is sent anywhere. */
async function respond(text) {
  const zh = isChinese(text); const tr = (en, cn) => (zh ? cn : en);
  const note = (en, cn) => push({ kind: 'note', text: tr(en, cn) });
  const rules = interpret(text, S.today);
  let model = null;
  if (llm.ready()) {
    const wait = { kind: 'note', text: tr('Thinking…', '思考中…') };
    thinking = true; push(wait);
    // Retrieval first: your own past entries that look like this sentence go to the model as context.
    try { model = await llm.understand(text, S.today, undefined, hint(recall(S.data, text))); } finally { thinking = false; drop(wait); } // null on any trouble
  }
  const intent = llm.combine(rules, model);
  // Nothing in the words said which category: use the one you gave the same thing before.
  if (intent?.type === 'expense' && intent.category === 'OTHER') intent.category = recall(S.data, intent.name || text)?.category ?? 'OTHER';
  switch (intent?.type) {
    case 'chat': return intent.reply ? push({ kind: 'note', text: intent.reply }) : note(...HELP);
    case 'expense': {
      const entry = E.newEntry({ date: intent.date, amountMinor: intent.amount, category: intent.category, note: intent.name });
      try { commit((d) => E.saveEntry(d, entry, S.today), ''); } catch (err) { return note(err.message, `记不了：${err.message}`); }
      (S.ui.aiLog ??= []).push(entry.id);
      const left = E.result(S.data, E.monthOf(S.today), S.today).todayRemaining;
      return push({ kind: 'rec', id: entry.id, name: intent.name, amount: intent.amount, category: intent.category, date: intent.date, left });
    }
    case 'check': return push({ kind: 'check', name: intent.name, amount: intent.amount, memo: describe(recall(S.data, intent.name)) });
    case 'status': return showStatus(zh);
    case 'spending': {
      const { total, count } = spendingTotal(S.data, intent.period, intent.category, S.today); const [when, whenZh] = PERIOD[intent.period];
      const cat = intent.category ? intent.category[0] + intent.category.slice(1).toLowerCase() : '';
      if (!count) return note(`Nothing recorded${cat ? ` for ${cat}` : ''} ${when}.`, `${whenZh}${cat ? CAT_ZH[intent.category] : ''}还没有记录。`);
      return note(`You spent ${E.cash(total)}${cat ? ` on ${cat}` : ''} ${when} (${count} ${count === 1 ? 'entry' : 'entries'}).`, `${whenZh}${cat ? CAT_ZH[intent.category] : ''}一共花了 ${E.cash(total)}（${count} 笔）。`);
    }
    case 'undo': {
      const id = S.ui.aiLog?.at(-1);
      if (!id) return note('Nothing to undo yet. I can only take back what I recorded in this chat.', '没有可以撤销的记录。我只能撤销在这个对话里记下的内容。');
      removeRecorded(id); return note('Taken back.', '已撤销。');
    }
    case 'goal': goalFrom(intent.name, intent.amount); return note(`Set “${intent.name}” (${E.cash(intent.amount)}) as a goal. You’ll find it on the Goals page.`, `已把“${intent.name}”（${E.cash(intent.amount)}）设为目标，可以在 Goals 页面看到。`);
    case 'wish': wishFrom(intent.name, intent.amount); return note(`Added “${intent.name}” (${E.cash(intent.amount)}) to your wish list.`, `已把“${intent.name}”（${E.cash(intent.amount)}）加入愿望清单。`);
    default: return note(...HELP);
  }
}

/** The leftover-today chart, or a plain line when nothing is left. */
function showStatus(zh) {
  const r = E.result(S.data, E.monthOf(S.today), S.today);
  const note = (en, cn) => push({ kind: 'note', text: zh ? cn : en });
  if (r.todayRemaining > 0) {
    push({ kind: 'surplus' });
    note('Tell me what you want and its price, and I’ll show what it does to the days ahead.', '告诉我你想买什么和价格，我会显示它对之后几天的影响。');
  } else if (r.todayRemaining === 0) note('Today’s allowance is used up. Tell me what you want and its price, and I’ll show what it does to the days ahead.', '今天的额度已经用完了。告诉我你想买什么和价格，我会显示它对之后几天的影响。');
  else note(`You’re ${E.cash(-r.todayRemaining)} over today’s allowance, so it’s worth waiting until tomorrow.`, `今天已经超支 ${E.cash(-r.todayRemaining)}，建议等到明天再买。`);
}
// ---------- receipt photos ----------
/** A photo shrunk to at most 1280 px on its long side, as base64 JPEG: vision models read that fine, and it is quick to send. */
async function photoToBase64(file, max = 1280) {
  const bmp = await createImageBitmap(file); const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height); bmp.close?.();
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}
/** The camera button: opens the camera or photo picker, or says what is missing. */
export function pickReceipt() {
  if (llm.canReadReceipts()) return document.getElementById('aifile')?.click();
  say('note', llm.state.status === 'ready' && llm.state.backend === 'ollama'
    ? 'Ollama is connected but has no vision model. In a terminal run “ollama pull qwen2.5vl:3b”, then reconnect in Settings.'
    : 'Reading a receipt photo needs a vision model. In Settings, connect Ollama on your computer and pull one (“ollama pull qwen2.5vl:3b”). Until then, type the item and its price.');
}
async function receiptFrom(file) {
  push({ kind: 'me', text: 'Receipt photo' });
  const wait = { kind: 'note', text: 'Reading the receipt… on a laptop graphics card this can take one to three minutes.' };
  thinking = true; push(wait);
  try { const receipt = await llm.readReceipt(await photoToBase64(file), S.today); drop(wait); push({ kind: 'receipt', ...receipt }); }
  catch (err) { drop(wait); push({ kind: 'note', text: err.message }); } finally { thinking = false; }
}

export function askAfford() { push({ kind: 'me', text: 'Can I afford this today?' }); showStatus(false); }

/** Takes back something the assistant recorded: deletes the entry and turns its card into a line saying so. */
export function removeRecorded(id) {
  S.ui.aiLog = (S.ui.aiLog ?? []).filter((x) => x !== id);
  const card = S.chat.find((t) => t.kind === 'rec' && t.id === id); if (card) card.undone = true;
  if (S.data.entries.some((e) => e.id === id)) commit((d) => E.deleteEntry(d, id), 'Removed'); else render({ keepAnimations: true });
}
/** Switches a swap on or off for one day on the chart, then redraws that answer with the new amounts. */
export function toggleSwap(turn, date, id) {
  const t = S.chat[turn]; if (!t) return;
  const plan = E.payback(S.data, t.amount, S.today, t.pick);
  const pick = t.pick ?? Object.fromEntries(plan.options.map((o) => [o.date, o.swaps.map((sw) => sw.id)])); // start from what was suggested
  const now = pick[date] ?? [];
  pick[date] = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
  t.pick = pick;
  const el = document.getElementById('chat')?.children[turn];
  if (el) { el.outerHTML = turnHTML(t, turn); const fresh = document.getElementById('chat').children[turn]; if (fresh) fresh.style.animation = 'none'; } // no replay of the entrance on each tap
}

/** Records the purchase and lowers the next few days by the planned amounts, in one step. */
export function buyAndPayBack(name, amount, turn) {
  const pick = S.chat[turn]?.pick; // the swaps you tapped on the chart, if any
  commit((d) => {
    const plan = E.payback(d, amount, S.today, pick);
    let out = E.saveEntry(d, E.newEntry({ date: S.today, amountMinor: amount, category: 'SHOPPING', note: name }), S.today);
    for (const c of plan?.days ?? []) if (c.cut > 0) out = E.setPlan(out, c.date, c.now, S.today); // a day that only swaps a bill keeps its own money
    // Remember which swaps were chosen for which days (by name, so deleting a swap later doesn't change history).
    if (plan?.days.length) out = E.addPayback(out, { id: E.id(), date: S.today, name, amountMinor: amount,
      days: plan.days.map((c) => ({ date: c.date, cutMinor: c.cut, swaps: c.swaps.map((s) => ({ name: s.cheaperName, usual: s.usualName, icon: s.icon, savingMinor: E.swapSaving(s) })) })) });
    return out;
  }, 'Added. The next few days are adjusted to match');
}

// ---------- voice input ----------
let listening = null;
/** Tap to start, tap again to stop. What you say fills the box and is sent when you stop talking, like “sneakers 120 ringgit”. */
export function voice(btn) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return say('note', 'This browser can’t do voice input. Use the microphone on your keyboard, or type the item and its price.');
  if (listening) return listening.stop();
  const page = document.getElementById('page'); const input = page?.querySelector('#aiq'); const form = page?.querySelector('#aiform');
  if (!input || !form) return;
  const rec = new Rec(); let heard = ''; let failed = false;
  rec.lang = document.documentElement.lang === 'en' ? 'en-MY' : navigator.language || 'en-US';
  rec.interimResults = true; rec.continuous = false;
  rec.onstart = () => { btn.classList.add('listening'); input.placeholder = 'Listening…'; };
  rec.onresult = (e) => { heard = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim(); input.value = heard; input.dispatchEvent(new Event('input')); };
  rec.onerror = (e) => {
    failed = true;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') say('note', 'Microphone is off for this page. Allow it in your browser settings, or use the microphone on your keyboard. (It can’t work from a home-screen shortcut.)');
    else if (e.error !== 'aborted') say('note', e.error === 'no-speech' ? 'I didn’t hear anything. Tap the microphone and try again.' : 'Voice input stopped. Try again, or type it.');
  };
  rec.onend = () => {
    listening = null; btn.classList.remove('listening'); input.placeholder = 'Ask anything...';
    if (heard && !failed) form.requestSubmit();
  };
  listening = rec;
  try { rec.start(); } catch { listening = null; say('note', 'Couldn’t start the microphone. Try again.'); }
}

/** Turns the thing into a savings goal for its price, so it shows up on the Goals page. */
/** Puts an example into the box and opens the keyboard, so one tap turns an idea into a question you can edit and send. */
export function tryPrompt(text) {
  const input = document.getElementById('aiq'); if (!input) return;
  input.value = text; input.focus(); try { input.setSelectionRange(0, 0); } catch { /* not every input type allows it */ }
}
export const goalFrom = (name, amount) => commit((d) => ({ ...d, goals: [...d.goals, { id: E.id(), name, targetMinor: amount, deadline: '', color: 0, archived: false }] }), 'Set as a goal');
export const wishFrom =(name, amount) => commit((d) => ({ ...d, wishes: [...d.wishes, { id: E.id(), name, priceMinor: amount, date: S.today }] }), 'Added to your wish list');
