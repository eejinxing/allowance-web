// Small SVG charts (no library): smooth curves, the spending chart and goal rings.
import { cash } from './engine.js';
import { PALETTE } from './ui.js';

/** Smooth curve through points with flat tangents at every point, so it never overshoots. */
export function smoothPath(points) {
  if (!points.length) return '';
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (points.length === 1) return d + ` L${(points[0].x + 0.1).toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]; const b = points[i]; const mid = (a.x + b.x) / 2;
    d += ` C${mid.toFixed(1)} ${a.y.toFixed(1)} ${mid.toFixed(1)} ${b.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return d;
}

/** Light [1,2,1] smoothing so sparse days read as gentle waves instead of spikes. */
export function softened(values, passes = 2) {
  let out = values;
  if (values.length >= 3) for (let p = 0; p < passes; p++) { const v = out; out = v.map((x, i) => Math.trunc(((v[i - 1] ?? x) + 2 * x + (v[i + 1] ?? x)) / 4)); }
  return out;
}

/**
 * Two smooth series, one point per column (a day), with a soft band and a bubble on the chosen day.
 * Rendered at the real pixel width so text stays crisp.
 */
export function spendingChart({ self, family, selected, width, height = 232, animate = true, smooth = false }) {
  const n = self.length; const passes = smooth ? 2 : 1;
  const selfLine = softened(self, passes); const famLine = softened(family, passes);
  const max = Math.max(1, ...selfLine, ...famLine);
  const top = 54; const bottom = 16; const col = width / n;
  const y = (v) => top + (height - top - bottom) * (0.92 - (0.8 * v) / max);
  const pts = (vals) => [{ x: 0, y: y(vals[0]) }, ...vals.map((v, i) => ({ x: (i + 0.5) * col, y: y(v) })), { x: width, y: y(vals[vals.length - 1]) }];
  const x = (selected + 0.5) * col; const my = y(selfLine[selected]);
  const label = cash(self[selected]).replace('.00', '');
  const bw = label.length * 8.4 + 26; const bh = 32;
  const bx = Math.min(Math.max(0, x - bw / 2), width - bw); const by = Math.max(0, my - bh - 16);
  const band = Math.min(col * 0.7, 30);
  const cls = animate ? 'draw' : '';
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Spending chart. Tap or drag to change the day.">
    <defs><linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF27A" stop-opacity=".75"/><stop offset="1" stop-color="#FFF27A" stop-opacity="0"/></linearGradient>
    <linearGradient id="fa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".07"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <rect x="${x - band / 2}" y="${my}" width="${band}" height="${height - my}" fill="url(#sb)"/>
    <path d="${smoothPath(pts(famLine))} L${width} ${height} L0 ${height} Z" fill="url(#fa)"/>
    <path class="${cls}" d="${smoothPath(pts(famLine))}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <path class="${cls}" d="${smoothPath(pts(selfLine))}" fill="none" stroke="#D4CC00" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="${x}" cy="${my}" r="8" fill="#fff" stroke="#D4CC00" stroke-width="3"/>
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="#FFF59A"/>
    <text x="${bx + bw / 2}" y="${by + 21}" text-anchor="middle" font-size="14" font-weight="700" fill="#141414">${label}</text></svg>`;
}

/** Round a maximum up to a tidy axis value (1, 2, 2.5 or 5 × 10ⁿ). */
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)); const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/**
 * Dark line chart in yellow: value labels on the left, a soft band across the middle, a jagged line drawn from
 * closely spaced samples (spending in the 24 hours before each one), a gradient fill under it,
 * and the time still to come as a lighter panel. Day labels sit under each day; the chosen day gets a guide and a bubble.
 * curve: [[position in days, value]] where position 0 is the centre of the first day.
 */
export const LINE_PAD = 16;
export const LINE_AXIS = 38;
export function lineChart({ values, curve, cut, labels, selected, width, height = 250, animate = true }) {
  const n = values.length; const left = LINE_AXIS; const right = LINE_PAD; const top = 30; const base = height - 34;
  const max = niceMax(Math.max(1, ...curve.map((p) => p[1])) / 100) * 100;
  const x = (p) => left + ((p + 0.5) / n) * (width - left - right);
  const y = (v) => base - (Math.min(v, max) / max) * (base - top);
  const pts = curve.map(([p, v]) => [x(p), y(v)]);
  // straight segments between closely spaced samples give the lively, jagged line of a live tracker
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const end = pts[pts.length - 1] ?? [x(-0.5), base];
  const area = `${line} L${end[0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z`;
  const fmt = (minor) => { const r = minor / 100; return r >= 1000 ? `${+(r / 1000).toFixed(1)}k` : String(+r.toFixed(r < 10 && r % 1 ? 1 : 0)); };
  const axis = [max, max / 2, 0].map((t) => `<text x="2" y="${(y(t) + 4).toFixed(1)}" font-size="12" font-style="italic" fill="#141414" fill-opacity=".42">${fmt(t)}</text>`).join('');
  const band = `<rect x="${left - 6}" y="${y(max * 0.75).toFixed(1)}" width="${width - left + 6}" height="${(y(max * 0.25) - y(max * 0.75)).toFixed(1)}" fill="#FFD83D" fill-opacity=".07"/>`;
  const fx = x(cut);
  const future = cut < n - 0.5 ? (() => {
    const hrs = Math.round((n - 0.5 - cut) * 24); const days = Math.floor(hrs / 24); const my = y(max * 0.5);
    const left2 = days >= 1 ? `+${days} ${days === 1 ? 'day' : 'days'}` : `+${hrs} h`;
    return `<rect x="${fx.toFixed(1)}" y="${top - 10}" width="${(width - fx).toFixed(1)}" height="${base - top + 10}" fill="#141414" fill-opacity=".035"/>
      <line x1="${(fx + 6).toFixed(1)}" x2="${width}" y1="${my.toFixed(1)}" y2="${my.toFixed(1)}" stroke="#141414" stroke-opacity=".3" stroke-dasharray="1.5 5" stroke-linecap="round"/>
      ${width - fx > 92 ? `<text x="${(fx + 10).toFixed(1)}" y="${(my + 22).toFixed(1)}" font-size="13" font-style="italic" fill="#141414" fill-opacity=".38">${left2}</text>
      <text x="${(fx + 10).toFixed(1)}" y="${(my + 40).toFixed(1)}" font-size="14" font-style="italic" font-weight="600" fill="#141414" fill-opacity=".85">Still to come</text>` : ''}`;
  })() : '';
  // the chosen day: a guide at the centre of the day; the dot sits on the curve there
  const sel = Math.min(selected, n - 1); const sx = x(sel);
  const near = curve.reduce((best, p) => (Math.abs(p[0] - sel) < Math.abs(best[0] - sel) ? p : best), curve[0] ?? [sel, 0]);
  const onCurve = Math.abs(near[0] - sel) <= 0.5; const sy = y(near[1]);
  const label = cash(values[sel] ?? 0).replace('.00', '');
  const bw = label.length * 7.4 + 20; const bx = Math.min(Math.max(left - 4, sx - bw / 2), width - bw - 2);
  const text = labels.map((t, i) => (t ? `<text x="${x(i).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="12.5" font-style="italic" font-weight="${i === sel ? 700 : 500}" fill="#141414" fill-opacity="${i === sel ? 1 : 0.55}">${t}</text>` : '')).join('');
  const cls = animate ? 'draw' : '';
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Spending chart. Tap or drag to change the day.">
    <defs>
      <linearGradient id="lcL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E0A800"/><stop offset=".6" stop-color="#F5C400"/><stop offset="1" stop-color="#FFD83D"/></linearGradient>
      <linearGradient id="lcA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD83D" stop-opacity=".55"/><stop offset=".55" stop-color="#FFE57A" stop-opacity=".22"/><stop offset="1" stop-color="#FFF3B8" stop-opacity="0"/></linearGradient>
      <linearGradient id="lcG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <filter id="lcGlow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    ${band}${axis}${future}
    <path class="lc-area${animate ? ' in' : ''}" d="${area}" fill="url(#lcA)"/>
    <path class="${cls}" d="${line}" fill="none" stroke="url(#lcL)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" filter="url(#lcGlow)"/>
    ${onCurve ? `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="5.5" fill="#F5C400" stroke="#fff" stroke-width="2.5"/>` : ''}
    <rect x="${bx.toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="22" rx="11" fill="#141414"/>
    <text x="${(bx + bw / 2).toFixed(1)}" y="15.5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${label}</text>
    ${text}</svg>`;
}

/**
 * Tiny bar strip for one day, like a step counter: 24 hourly slots. A short dash for an hour with no spending,
 * a rounded yellow bar where money went out. Hours that haven't happened yet (later today) are dim grey dashes.
 */
export function dayBars(hours, upTo = 23) {
  const max = Math.max(1, ...hours); const w = 6; const gap = 1.6; const h = 44;
  const bars = hours.map((v, i) => {
    const bx = (i * (w + gap)).toFixed(1);
    if (!v) return `<rect x="${bx}" y="${h - 3}" width="${w}" height="3" rx="1.2" fill="${i <= upTo ? '#E8B800' : '#141414'}" fill-opacity="${i <= upTo ? 0.45 : 0.1}"/>`;
    const bh = Math.max(5, (v / max) * h);
    return `<rect class="db" style="--d:${i * 16}ms" x="${bx}" y="${(h - bh).toFixed(1)}" width="${w}" height="${bh.toFixed(1)}" rx="1.8" fill="#F5C400"/>`;
  }).join('');
  const tw = 24 * (w + gap) - gap;
  return `<svg class="dbars" width="${tw}" height="${h}" viewBox="0 0 ${tw} ${h}" aria-hidden="true">${bars}</svg>`;
}

/** Goal colours: each goal gets a distinct palette colour even when two picked the same one. */
export function goalColors(goals) {
  const used = [];
  for (const g of goals) {
    const wanted = PALETTE[((g.color % PALETTE.length) + PALETTE.length) % PALETTE.length];
    used.push(used.includes(wanted) ? PALETTE.find((c) => !used.includes(c)) ?? wanted : wanted);
  }
  return used;
}

/** Concentric goal rings that fill counter-clockwise from the top. */
export function goalRings(items) {
  const size = 254; const c = size / 2; const stroke = items.length <= 3 ? 18 : 15; const gap = stroke + 10;
  const list = items.length ? items : [{ color: PALETTE[0], frac: 0 }];
  let out = `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Goal progress rings">`;
  list.forEach((it, i) => {
    const r = size / 2 - stroke / 2 - 2 - i * gap;
    if (r <= stroke) return;
    const circ = 2 * Math.PI * r; const frac = Math.min(1, Math.max(0, it.frac));
    out += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".08" stroke-width="${stroke}"/>`;
    if (frac > 0.002) {
      out += `<g transform="translate(${c} ${c}) scale(-1 1) rotate(-90)"><circle class="ring" data-off="${circ * (1 - frac)}" r="${r}" fill="none" stroke="${it.color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" style="transition-delay:${i * 160}ms"/></g>`;
      const a = (-90 - 360 * frac) * Math.PI / 180;
      out += `<circle class="knob" cx="${c + r * Math.cos(a)}" cy="${c + r * Math.sin(a)}" r="${stroke * 0.26}" fill="#fff" stroke="#141414" stroke-opacity=".35" stroke-width="1.5" style="animation-delay:${900 + i * 160}ms"/>`;
    }
  });
  return out + '</svg>';
}
export function animateRings(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll('.ring').forEach((r) => { r.style.strokeDashoffset = r.dataset.off; })));
}

/**
 * Flow chart, like a process map: one block per category on the left whose height follows how much was spent there
 * (Food tall, Entertainment short), and one row per payment on the right. Every payment is a ribbon of the same fixed
 * width, drawn as a single stroke so it keeps that width all the way: straight out of its block, one bend, straight
 * to the right edge. The two biggest categories are solid colour; the rest are frosted glass laid over them.
 * cats: [{ cat, amount, color, bright, ic (svg string), label }] top to bottom
 * items: [{ cat, amount, name, sub }] (already escaped), grouped by category in the same order
 */
export function flowChart({ cats, items, width }) {
  const rowH = 64; const ribbon = 44; const nodeW = 40; const gap = 8; const minNode = 48;
  const H = Math.max(items.length * rowH, cats.length * (minNode + gap));
  // block heights in proportion to each category's total, never smaller than minNode
  const avail = H - gap * (cats.length - 1);
  const tot = cats.reduce((s, k) => s + k.amount, 0) || 1;
  let hs = cats.map((k) => Math.max(minNode, (k.amount / tot) * avail));
  for (let pass = 0; pass < 4; pass++) {
    const over = hs.reduce((s, h) => s + h, 0) - avail; if (over <= 0.5) break;
    const flex = hs.reduce((s, h) => s + (h > minNode ? h - minNode : 0), 0) || 1;
    hs = hs.map((h) => (h > minNode ? Math.max(minNode, h - over * ((h - minNode) / flex)) : h));
  }
  let yy = 0;
  const nodes = cats.map((k, i) => { const n = { ...k, y: yy, h: hs[i] }; yy += hs[i] + gap; return n; });
  const rowY = (i) => i * rowH + rowH / 2 + (H - items.length * rowH) / 2;
  const x0 = nodeW - 2; const xs1 = width * 0.2; const xs2 = width * 0.46; const xm = (xs1 + xs2) / 2;
  const f = (v) => v.toFixed(1);
  const solid = []; const glass = []; let labels = '';
  for (const n of nodes) {
    const mine = items.map((it, i) => ({ it, i })).filter((o) => o.it.cat === n.cat);
    // ribbons leave the block spread evenly over its height (they may overlap a little in a short block)
    const step = mine.length > 1 ? Math.min(ribbon, (n.h - ribbon) / (mine.length - 1)) : 0;
    const first = n.y + n.h / 2 - (step * (mine.length - 1)) / 2;
    mine.forEach(({ it, i }, j) => {
      const ya = first + j * step; const yb = rowY(i);
      const d = `M${f(x0)} ${f(ya)} L${f(xs1)} ${f(ya)} C${f(xm)} ${f(ya)} ${f(xm)} ${f(yb)} ${f(xs2)} ${f(yb)} L${width} ${f(yb)}`;
      const el = `<path class="fl-band" data-cat="${n.cat}" pathLength="1" style="--d:${i * 70}ms" d="${d}" fill="none" stroke="url(#flg-${n.cat})" stroke-width="${ribbon}"/>`;
      (n.bright ? solid : glass).push(el + (n.bright ? '' : `<path class="fl-band fl-shine" data-cat="${n.cat}" pathLength="1" style="--d:${i * 70}ms" d="${d}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" transform="translate(0 ${-ribbon / 2 + 1})"/>`));
      labels += `<g class="fl-lbl" data-cat="${n.cat}"><text x="${f(xs2 + 12)}" y="${f(yb - 3)}" font-size="14" font-weight="700" fill="#141414">${it.name}</text>`
        + `<text x="${f(xs2 + 12)}" y="${f(yb + 13)}" font-size="11.5" font-weight="500" fill="#141414" fill-opacity=".6">${it.sub}</text></g>`;
    });
  }
  const grads = nodes.map((n) => (n.bright
    ? `<linearGradient id="flg-${n.cat}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${n.color}" stop-opacity=".9"/><stop offset=".5" stop-color="${n.color}" stop-opacity=".75"/><stop offset="1" stop-color="${n.color}"/></linearGradient>`
    : `<linearGradient id="flg-${n.cat}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#EDE7D3" stop-opacity=".9"/><stop offset=".5" stop-color="#F6F2E6" stop-opacity=".62"/><stop offset="1" stop-color="#EFEADB" stop-opacity=".8"/></linearGradient>`)).join('');
  const nodeEls = nodes.map((n) => `<g class="fl-node" data-cat="${n.cat}" role="button" aria-label="${n.label}">`
    + `<rect x="0" y="${f(n.y)}" width="${nodeW}" height="${f(n.h)}" rx="${f(Math.min(14, n.h / 2))}" fill="${n.bright ? n.color : '#EFEADB'}"/>`
    + `<rect x="1" y="${f(n.y + 1)}" width="${nodeW - 2}" height="${f(Math.min(n.h - 2, 18))}" rx="${f(Math.min(13, n.h / 2))}" fill="#fff" fill-opacity=".35"/>`
    + n.ic.replace('<svg ', `<svg x="${f(nodeW / 2 - 9)}" y="${f(n.y + n.h / 2 - 9)}" width="18" height="18" `) + '</g>').join('');
  // solid ribbons first, frosted ones on top of them (so they read like glass over colour), then blocks and labels
  return `<svg class="fl" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="Spending by category: each category joined to its payments"><defs>${grads}</defs>${solid.join('')}${glass.join('')}${nodeEls}${labels}</svg>`;
}
