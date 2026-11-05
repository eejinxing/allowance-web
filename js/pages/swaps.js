// Swaps: the cheaper options you keep (the bus instead of the train), as a grid of dark tiles on yellow, each with a label and a big flat icon.
// The assistant draws on these when you overspend, and what it chose each time is listed underneath.
import * as E from '../engine.js';
import { S } from '../state.js';
import { icon, swapIcon } from '../icons.js';
import { esc, countUp, CAT_ICONS, dayLong } from '../ui.js';

/** One dark tile per swap: the cheaper option top-left, what it saves under it, the category's icon big at the bottom-left. */
function tile(s, i) {
  return `<button class="sw-tile rise" style="--i:${i + 1}" data-act="swap" data-id="${s.id}" aria-label="${esc(`Edit ${s.cheaperName} instead of ${s.usualName}`)}">
    <span><b>${esc(s.cheaperName)}</b><small>instead of ${esc(s.usualName)}</small><small class="sv">saves ${E.cash(E.swapSaving(s))}</small></span>
    ${swapIcon(s, 56)}</button>`;
}

export function view() {
  const d = S.data; const month = E.monthOf(S.today);
  const swaps = d.swaps ?? [];
  const paybacks = [...(d.budgets.find((b) => b.month === month)?.paybacks ?? [])].reverse();

  const html = `<div class="sw-root">
  <div class="sw-grid">
    ${swaps.map(tile).join('')}
    <button class="sw-tile sw-add rise" style="--i:${swaps.length + 1}" data-act="swap" data-id="" aria-label="Add a swap"><span><b>Add a swap</b><small>your own cheaper option</small></span>${icon('Add', 56)}</button>
  </div>
  ${paybacks.length ? `<div class="sw-sec rise" style="--i:${swaps.length + 3}">PAID BACK</div><div class="sw-list">${paybacks.slice(0, 6).map((p, i) => {
    const used = [...new Map(p.days.flatMap((x) => x.swaps).map((w) => [w.name, w])).values()].slice(0, 3).map((w) => swapIcon({ cheaperName: w.name, usualName: w.usual ?? '' }, 20)).join('');
    return `<div class="sw-tile sw-wide sw-pb rise" style="--i:${swaps.length + 4 + i}"><span><b>${esc(p.name)}</b><small>${esc(dayLong(p.date))} · over ${p.days.length} ${p.days.length === 1 ? 'day' : 'days'}</small></span><span class="sw-em">${used}</span><strong>${E.cash(p.amountMinor)}</strong></div>`;
  }).join('')}</div>` : ''}
  </div>`;

  return { html, cls: 'swp', mount(page, { animate }) { if (animate) countUp(page); } };
}
