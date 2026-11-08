// Memory: what you usually buy and pay, found by looking things up in your OWN past entries.
// This is retrieval over your history, the same idea as RAG: fetch the relevant records first, then let them inform the answer
// (the category for a new entry, "you usually pay about RM 4 for this", and hints handed to the language model).
// It is a plain word match, not embeddings: with a few hundred entries that is accurate and instant, and it needs no extra model.
// Pure functions, no DOM.
import * as E from './engine.js';

const SPEND = ['EXPENSE', 'BILL_PAYMENT'];
/** Latin words of 3+ letters, and Chinese characters in pairs (so 咖啡 matches 咖啡, and 买咖啡 still reaches 咖啡). */
export function tokens(text) {
  const t = String(text ?? '').toLowerCase(); const out = new Set();
  for (const w of t.match(/[a-z]{3,}/g) ?? []) out.add(w);
  for (const run of t.match(/[㐀-鿿]+/g) ?? []) {
    if (run.length === 1) out.add(run);
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  }
  return out;
}
const median = (list) => { const s = [...list].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

/**
 * The past entries that look like `text`, summarised: { category, typicalMinor, minMinor, maxMinor, count, last, names } or null.
 * Only entries that share the most words with the text count, so "bubble tea" finds your bubble teas, not every "tea".
 */
export function recall(data, text) {
  const want = tokens(text); if (!want.size) return null;
  const scored = [];
  for (const e of data.entries) {
    if (!SPEND.includes(e.type) || !e.note) continue;
    const have = tokens(e.note); let hit = 0; for (const w of have) if (want.has(w)) hit++;
    if (hit > 0) scored.push({ e, hit });
  }
  if (!scored.length) return null;
  const top = Math.max(...scored.map((s) => s.hit));
  const rows = scored.filter((s) => s.hit === top).map((s) => s.e);
  const votes = {}; for (const e of rows) votes[e.category] = (votes[e.category] ?? 0) + 1;
  const category = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  const amounts = rows.map((e) => e.amountMinor);
  return { category, typicalMinor: median(amounts), minMinor: Math.min(...amounts), maxMinor: Math.max(...amounts), count: rows.length,
    last: rows.map((e) => e.date).sort().at(-1), names: [...new Set(rows.map((e) => e.note))].slice(0, 3) };
}

/** One readable line, or '' when there is nothing to say. */
export function describe(m) {
  if (!m) return '';
  const range = m.count > 1 && m.minMinor !== m.maxMinor ? ` (from ${E.cash(m.minMinor)} to ${E.cash(m.maxMinor)})` : '';
  return `You usually pay about ${E.cash(m.typicalMinor)} for ${m.names[0]}${range}: ${m.count} time${m.count === 1 ? '' : 's'}, last on ${m.last.slice(5, 7)}/${m.last.slice(8)}.`;
}

/** The same facts as one line of context for the language model. '' when there are none. */
export function hint(m) {
  return m ? `${m.names.join(' / ')} -> ${m.category}, usually ${E.decimal(m.typicalMinor)} (${m.count}x)` : '';
}
