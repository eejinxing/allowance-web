// Measures the assistant against the labelled sentences in cases.mjs.
//   node eval/run.mjs                  rules only (instant, deterministic)
//   node eval/run.mjs --llm            rules + the real model on Ollama, the way the app runs it (needs Ollama and qwen2.5:3b)
//   node eval/run.mjs --set=dev|held|fresh|fresh2|fresh3|all   which sets to score (default: dev and held)
//   node eval/run.mjs --show           also list every wrong answer
// What it reports, in plain words:
//   precision  of everything it did as X, how much really was X      (low = it acts when it shouldn't)
//   recall     of everything that really was X, how much it found    (low = it misses things)
//   bad writes records it would SAVE that are wrong in amount, day, or that were never a record at all. The number that matters most.
//   false actions   sentences that need no action (small talk, a number that is not money) where it did something anyway = "hallucinated action"
import { interpret } from '../js/nlu.js';
import * as llm from '../js/llm.js';
import { DEV, HELD_OUT, FRESH, FRESH2, FRESH3, TODAY, PROMPT_EXAMPLES } from './cases.mjs';

const args = process.argv.slice(2);
const USE_LLM = args.includes('--llm'); const SHOW = args.includes('--show');
const which = (args.find((a) => a.startsWith('--set=')) ?? '--set=default').split('=')[1];
const MONEY = ['expense', 'check', 'goal', 'wish'];
const TYPES = ['expense', 'check', 'status', 'spending', 'undo', 'goal', 'wish', 'none'];
const daysAgo = (date) => Math.round((Date.parse(TODAY) - Date.parse(date)) / 86_400_000);

/** An intent from the app → the same shape the labels use. */
function shape(i) {
  if (!i || i.type === 'chat') return { t: 'none' };
  const p = { t: i.type };
  if ('amount' in i) p.a = i.amount;
  if (i.type === 'expense') { p.c = i.category; p.d = daysAgo(i.date); }
  if (i.type === 'spending') { p.p = i.period; p.c = i.category ?? undefined; }
  return p;
}
const rulesOnly = (text) => shape(interpret(text, TODAY));

// The real model, exactly as the app uses it: both readers look, and llm.combine decides (a record needs both to agree).
let engine = null;
async function withModel(text) {
  const asked = await llm.understand(text, TODAY, engine);
  return { pred: shape(llm.combine(interpret(text, TODAY), asked)), modelUsed: asked !== null };
}
async function connect() {
  const models = await llm.ollamaModels(llm.OLLAMA_URL); const { text } = llm.pickModels(models);
  if (!text) throw new Error('Ollama has no text model');
  engine = llm.ollamaEngine(llm.OLLAMA_URL, text.name);
  process.stdout.write(`model: ${text.name}  (loading it into memory first…)\n`);
  await fetch(`${llm.OLLAMA_URL}/api/generate`, { method: 'POST', body: JSON.stringify({ model: text.name, keep_alive: '30m', stream: false }), signal: AbortSignal.timeout(300_000) });
  return text.name;
}

/** Does a prediction match what was labelled? Only the fields the label gives are compared. */
function judge(pred, [, type, want]) {
  const typeOk = pred.t === type;
  const wrong = [];
  if (typeOk) for (const k of ['a', 'c', 'd', 'p']) if (k in want && want[k] !== undefined && pred[k] !== want[k]) wrong.push(`${k}: got ${pred[k]}, wanted ${want[k]}`);
  return { typeOk, fullOk: typeOk && wrong.length === 0, wrong };
}

async function score(name, cases, predict) {
  const rows = [];
  for (const c of cases) { const out = await predict(c[0]); rows.push({ c, ...(out.pred ? out : { pred: out }) }); }
  const tally = Object.fromEntries(TYPES.map((t) => [t, { tp: 0, fp: 0, fn: 0 }]));
  let typeOk = 0; let fullOk = 0; const misses = [];
  let writesPredicted = 0; let badWrites = 0; let writesWanted = 0; let writesFound = 0; let negatives = 0; let falseActions = 0;
  for (const r of rows) {
    const [, type] = r.c; const j = judge(r.pred, r.c);
    typeOk += j.typeOk; fullOk += j.fullOk;
    for (const t of TYPES) { if (r.pred.t === t && type === t) tally[t].tp++; else if (r.pred.t === t) tally[t].fp++; else if (type === t) tally[t].fn++; }
    if (type === 'expense') { writesWanted++; if (j.typeOk) writesFound++; }
    if (r.pred.t === 'expense') { writesPredicted++; if (!(j.fullOk || (j.typeOk && j.wrong.every((w) => w.startsWith('c:'))))) badWrites++; } // a wrong category is fixable in one tap; a wrong amount, day, or a phantom record is not
    if (type === 'none') { negatives++; if (r.pred.t !== 'none') falseActions++; }
    if (!j.fullOk) misses.push({ text: r.c[0], want: type, got: r.pred.t, why: j.typeOk ? j.wrong.join('; ') : 'wrong kind of action' });
  }
  const f = (n, d) => (d === 0 ? '  n/a' : `${(100 * n / d).toFixed(0).padStart(4)}%`);
  const per = TYPES.map((t) => { const { tp, fp, fn } = tally[t]; const p = tp + fp ? tp / (tp + fp) : null; const r = tp + fn ? tp / (tp + fn) : null; return { t, tp, fp, fn, p, r, f1: p && r ? 2 * p * r / (p + r) : p === null && r === null ? null : 0 }; });
  const scored = per.filter((x) => x.f1 !== null); const macro = scored.reduce((s, x) => s + x.f1, 0) / scored.length;
  return { name, n: rows.length, acc: typeOk / rows.length, full: fullOk / rows.length, macro, per, misses, writesPredicted, badWrites, writesWanted, writesFound, negatives, falseActions, f,
    modelUsed: rows.filter((r) => r.modelUsed).length };
}

function print(r) {
  const { f } = r; const pc = (x) => (x === null ? '  n/a' : `${(100 * x).toFixed(0).padStart(4)}%`);
  console.log(`\n=== ${r.name}  (${r.n} sentences) ===`);
  console.log(`right kind of action ${pc(r.acc)}   right kind AND right details ${pc(r.full)}   macro-F1 ${pc(r.macro)}${USE_LLM ? `   model answered ${r.modelUsed}/${r.n}` : ''}`);
  console.log('kind        precision  recall   found/wanted');
  for (const x of r.per) if (x.tp + x.fn + x.fp > 0) console.log(`${x.t.padEnd(10)}   ${pc(x.p)}    ${pc(x.r)}    ${x.tp}/${x.tp + x.fn}${x.fp ? `   (${x.fp} wrongly)` : ''}`);
  console.log(`records it would save: ${r.writesPredicted}, of which wrong (amount, day or not a record): ${r.badWrites}  -> write precision ${f(r.writesPredicted - r.badWrites, r.writesPredicted)}`);
  console.log(`records that were there to find: ${r.writesWanted}, found as a record: ${r.writesFound}  -> write recall ${f(r.writesFound, r.writesWanted)}`);
  console.log(`do-nothing sentences: ${r.negatives}, acted anyway: ${r.falseActions}  -> false-action rate ${f(r.falseActions, r.negatives)}`);
  if (SHOW) for (const m of r.misses) console.log(`   x ${JSON.stringify(m.text)}  wanted ${m.want}, got ${m.got}${m.why ? `  (${m.why})` : ''}`);
}

const sets = { dev: ['DEV (what it was built around)', DEV], held: ['HELD-OUT (new wording; used for fixes after round 1)', HELD_OUT], fresh: ['FRESH (used for fixes after round 1)', FRESH], fresh2: ['FRESH2 (used for fixes after its round)', FRESH2], fresh3: ['FRESH3 (CLEAN: sealed before the last fixes)', FRESH3] };
const pick = which === 'all' ? ['dev', 'held', 'fresh', 'fresh2', 'fresh3'] : which === 'default' ? ['dev', 'held'] : [which];
let predict = async (t) => rulesOnly(t);
if (USE_LLM) { const m = await connect(); predict = withModel; console.log(`pipeline: rules + model, a record needs both to agree (${m})`); } else console.log('pipeline: rules only');
const results = [];
for (const k of pick) {
  const [label, cases] = sets[k];
  // the model's own prompt examples are not fair to score
  const use = USE_LLM ? cases.filter(([t]) => !PROMPT_EXAMPLES.includes(t)) : cases;
  const r = await score(label, use, predict); results.push(r); print(r);
}
if (results.length >= 2 && results[0].name.startsWith('DEV') && results[1].name.startsWith('HELD')) {
  const [d, h] = results; const pp = (x) => `${(100 * x).toFixed(0)}%`;
  console.log(`\n=== over/under-fitting read ===\nmacro-F1  dev ${pp(d.macro)}  vs  held-out ${pp(h.macro)}   gap ${((d.macro - h.macro) * 100).toFixed(0)} points`);
  console.log(h.macro < 0.8 && d.macro < 0.8 ? 'both low: underfitting (it doesn’t know enough ways of saying things)' : d.macro - h.macro > 0.1 ? 'big gap: overfitting (it works on the sentences it was built around, much less on new wording)' : 'small gap: no sign of overfitting');
}
