// Goals: concentric progress rings and goal cards.
import * as E from '../engine.js';
import { S } from '../state.js';
import { icon } from '../icons.js';
import { esc, amountHTML, countUp, progress, animateBars, emptyCard } from '../ui.js';
import { goalRings, goalColors, animateRings } from '../charts.js';
import { dotsIcon } from '../parts.js';

export function view() {
  const d = S.data; const goals = d.goals.filter((g) => !g.archived);
  const saved = Object.fromEntries(goals.map((g) => [g.id, E.goalSaved(d, g.id)]));
  const colors = goalColors(goals);
  const filter = goals.find((g) => g.id === S.ui.goalFilter);
  const shown = filter ? [filter] : goals;
  const total = shown.reduce((s, g) => s + saved[g.id], 0);
  const cell = (g) => {
    const done = saved[g.id] >= g.targetMinor;
    return `<button class="gcard" data-act="goal" data-id="${g.id}"><div class="row" style="height:28px"><span class="bar" style="background:${colors[goals.indexOf(g)]}"></span>
      ${done ? `<span class="reached">${icon('Check', 14)} Reached</span>` : ''}</div>
      <div class="nm ell">${esc(g.name)}</div>${amountHTML(saved[g.id], 'amt')}<div class="of">of ${E.cash(g.targetMinor).replace('.00', '')}</div>
      ${progress(saved[g.id] / g.targetMinor, done)}</button>`;
  };
  const rows = [...shown.map(cell), `<button class="gcard gadd2" data-act="new-goal" aria-label="Add goal"><span class="gadd-ic">${icon('Add', 22)}</span><span class="nm">Add goal</span><span class="of">Save up for something new</span></button>`];
  const html = `<header class="hdr" style="padding-bottom:26px"><div class="hdr-row"><button class="ghost" data-act="back" aria-label="Back" style="margin-left:-12px">${icon('ChevronLeft', 28)}</button>
      <div class="hdr-title">Goals</div><button class="ghost" data-act="settings" aria-label="Settings" style="margin-right:-12px">${dotsIcon()}</button></div>
    <div class="row" style="align-items:flex-start;padding-top:4px"><div class="grow"><div class="hdr-sub" style="font-size:18px;color:var(--text);opacity:.8">${filter ? 'Saved' : 'Total saved'}</div>
        ${amountHTML(total, 'big-amount')}</div>
      <div style="position:relative"><button class="pillsel" id="gf" aria-haspopup="menu"><span class="ell">${filter ? esc(filter.name) : 'All goals'}</span>${icon('ChevronDown', 22)}</button>
        <div class="menu" id="gmenu" hidden><button data-g="">All goals</button>${goals.map((g) => `<button data-g="${g.id}">${esc(g.name)}</button>`).join('')}</div></div></div>
    <div class="rings">${goalRings(shown.slice(0, 3).map((g) => ({ color: colors[goals.indexOf(g)], frac: saved[g.id] / g.targetMinor })))}
      <div class="mid"><b style="font-size:17px">Your goals</b><span class="muted" style="font-size:13px">Keep saving</span></div></div>
    <div class="legend">${shown.slice(0, 3).map((g) => `<span><i style="background:${colors[goals.indexOf(g)]}"></i>${esc(g.name)}</span>`).join('')}</div></header>
  ${goals.length ? '' : emptyCard('Give your savings a name', 'A trip, an emergency fund, or whatever you’re saving up for next.', 'Create a goal', 'new-goal')}
  <div class="goal-cards rise" style="--i:1">${rows.join('')}</div>
  <p class="muted small" style="margin-top:14px">Goals track money you’ve already saved. They don’t change your daily budget or move money between accounts.</p>`;

  return { html, mount(page, { animate, rerender }) {
    animateRings(page); animateBars(page);
    const menu = page.querySelector('#gmenu');
    page.querySelector('#gf').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', () => { menu.hidden = true; }, { once: true });
    menu.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (!b) return; S.ui.goalFilter = b.dataset.g || null; rerender(); });
    if (animate) countUp(page);
  } };
}
