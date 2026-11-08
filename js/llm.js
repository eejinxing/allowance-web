// The on-device AI. Two free backends, same interface, so everything above this file doesn't care which one is running:
//   - "browser": a small model (Qwen2.5 1.5B) inside the page through WebGPU and the WebLLM library, downloaded once (about 1 GB).
//     Works on a phone with a recent browser.
//   - "ollama": a model served by Ollama on your own computer (http://localhost:11434). Bigger models, much faster, and the only way
//     here to read receipt photos (needs a vision model such as qwen2.5vl). Best on the computer that runs Ollama.
// Free by design: no account, no API key, no quota, nothing leaves your own devices.
//
// What the model does and does not do:
//   - It READS the sentence and fills in a fixed form (what the person wants, the item, the category, the day). Constrained
//     decoding makes the output valid JSON every time.
//   - It never touches an amount. Amounts are read from the text by the rules in nlu.js, and if the sentence has no readable
//     price the answer is thrown away. So a small model that gets it wrong can mislabel a purchase, but it can't invent money.
//   - If the model is off, still loading, slow, or answers nonsense, the caller falls back to the plain rules.
// This file has no DOM and no state.js, so it can be tested in Node with a fake engine.
import * as E from './engine.js';
import { findAmount, guessCategory, nameFrom, dateIn, FAR_PAST } from './nlu.js';

const WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.87/+esm'; // pinned on purpose; the service worker keeps it for offline use
const MODELS = { f16: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', f32: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC' }; // f32 for GPUs without shader-f16
const THINK_MS = 25_000;

// ---------- the form the model fills in ----------
const ACTIONS = ['record_expense', 'check_purchase', 'status', 'spending', 'undo', 'set_goal', 'add_wish', 'chat'];
const PERIODS = ['today', 'yesterday', 'week', 'month'];
export const SCHEMA = { type: 'object', additionalProperties: false, required: ['action', 'item', 'category', 'days_ago', 'period', 'reply'], properties: {
  action: { type: 'string', enum: ACTIONS },
  item: { type: 'string', maxLength: 40 },
  category: { type: 'string', enum: [...E.CATEGORIES, 'NONE'] },
  days_ago: { type: 'integer' },
  period: { type: 'string', enum: PERIODS },
  reply: { type: 'string', maxLength: 160 } } };

export const systemPrompt = (today, hints = '') => `You read messages for a budgeting app. The currency is Malaysian ringgit (RM). Answer with one JSON object and nothing else. Today is ${today}.
action is one of:
- record_expense: the user says they already spent or paid money ("spent RM3 on coffee", "我今天花了3块买咖啡").
- check_purchase: the user asks if they can afford or should buy something, or just names an item with a price ("Sneakers RM 120", "can I buy a phone for 2000?").
- status: asks how much they can still spend today, or about their budget.
- spending: asks how much they spent (set period to today, yesterday, week or month; set category if one is named).
- undo: wants to cancel or undo the last record.
- set_goal: wants to save up for something.
- add_wish: wants to add something to a wish list.
- chat: anything else, like a greeting or a question about the app. Put one short friendly sentence in reply, in the user's language, and never state any amount of their money.
item is the thing bought, in a few words in the user's language, or "". category is FOOD, TRANSPORT, SHOPPING, FUN, HEALTH, LIVING, OTHER or NONE. days_ago is 0 for today, 1 for yesterday, 2 for the day before. period only matters for spending, otherwise "today". reply is only for chat, otherwise "".
Examples:
"spent RM3 on coffee" -> {"action":"record_expense","item":"Coffee","category":"FOOD","days_ago":0,"period":"today","reply":""}
"昨天打车花了18块" -> {"action":"record_expense","item":"打车","category":"TRANSPORT","days_ago":1,"period":"today","reply":""}
"Sneakers RM 120" -> {"action":"check_purchase","item":"Sneakers","category":"SHOPPING","days_ago":0,"period":"today","reply":""}
"how much did I spend on food this month" -> {"action":"spending","item":"","category":"FOOD","days_ago":0,"period":"month","reply":""}
"今天还能花多少" -> {"action":"status","item":"","category":"NONE","days_ago":0,"period":"today","reply":""}
"oops, delete that" -> {"action":"undo","item":"","category":"NONE","days_ago":0,"period":"today","reply":""}
"hi" -> {"action":"chat","item":"","category":"NONE","days_ago":0,"period":"today","reply":"Hi! Tell me what you spent, or what you want to buy."}${hints ? `
The user's own past entries that look related (prefer their category for the same thing): ${hints}` : ''}`;

const clean = (s, max = 40) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cap = (s) => (s && /[a-z]/i.test(s[0]) ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The model's form → the same intents nlu.js produces, or null when it can't be trusted.
 * The amount comes from the text, never from the model; no readable price means no money action.
 */
export function toIntent(form, text, today) {
  if (!form || typeof form !== 'object' || !ACTIONS.includes(form.action)) return null;
  const money = findAmount(text);
  const item = cap(clean(form.item)) || (money ? cap(nameFrom(money.rest)) : '');
  const category = E.CATEGORIES.includes(form.category) ? form.category : null;
  switch (form.action) {
    case 'record_expense': {
      if (!money) return null;
      // The day is the rules' call too: today, unless the words say yesterday / the day before (the rules know those), or point further back (then the model's count is used).
      const seen = dateIn(text, today);
      const ago = Number.isInteger(form.days_ago) && form.days_ago >= 0 && form.days_ago <= 31 ? form.days_ago : 0;
      const date = seen !== today ? seen : FAR_PAST.test(text) ? E.addDays(today, -ago) : today;
      return { type: 'expense', amount: money.amount, name: item, category: category ?? guessCategory(text) ?? 'OTHER', date };
    }
    case 'check_purchase': return money ? { type: 'check', amount: money.amount, name: item || 'this' } : null;
    case 'set_goal': return money ? { type: 'goal', amount: money.amount, name: item || 'My goal' } : null;
    case 'add_wish': return money ? { type: 'wish', amount: money.amount, name: item || 'Something' } : null;
    case 'status': return { type: 'status' };
    case 'undo': return { type: 'undo' };
    case 'spending': return { type: 'spending', period: PERIODS.includes(form.period) ? form.period : 'month', category: category ?? guessCategory(text) };
    default: { const reply = clean(form.reply, 160); return reply ? { type: 'chat', reply } : null; } // chat
  }
}

/** Asks the model what the sentence means. Null when it isn't ready, is too slow, or answers something unusable. */
export async function understand(text, today, eng = engine, hints = '') {
  if (!eng) return null;
  const ask = eng.chat.completions.create({ messages: [{ role: 'system', content: systemPrompt(today, hints) }, { role: 'user', content: text }],
    temperature: 0, max_tokens: 120, response_format: { type: 'json_object', schema: JSON.stringify(SCHEMA) } });
  let timer; const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), THINK_MS); });
  try {
    const reply = await Promise.race([ask, late]); if (!reply) return null;
    return toIntent(JSON.parse(reply.choices[0].message.content), text, today);
  } catch { return null; } finally { clearTimeout(timer); }
}

// ---------- loading the model ----------
export const state = { status: 'off', backend: '', progress: 0, text: '', error: '', model: '', vision: '', models: [] }; // status: off | loading | ready | error
const listeners = new Map();
const set = (patch) => { Object.assign(state, patch); for (const fn of listeners.values()) { try { fn(state); } catch { /* a page that is gone */ } } };
/** One listener per key (a page asks again each time it is drawn). */
export const listen = (key, fn) => { listeners.set(key, fn); };

let engine = null; let loading = null; let ollamaBase = ''; let visionModel = '';
export const ready = () => state.status === 'ready' && Boolean(engine);
/** True when a model that can read pictures is connected (Ollama with a vision model). */
export const canReadReceipts = () => ready() && state.backend === 'ollama' && Boolean(visionModel);

/** Whether this browser can run the model at all: it needs WebGPU. */
export async function support() {
  if (typeof navigator === 'undefined' || !navigator.gpu) return { ok: false, reason: 'no WebGPU in this browser' };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter ? { ok: true, f16: adapter.features.has('shader-f16') } : { ok: false, reason: 'no graphics adapter available' };
  } catch (e) { return { ok: false, reason: String(e?.message ?? e) }; }
}

/** Downloads (first time) and starts the model. Safe to call again: it returns the same engine or the same load in progress. */
export function load() {
  if (engine) return Promise.resolve(engine);
  if (loading) return loading;
  loading = (async () => {
    const sup = await support(); if (!sup.ok) throw new Error(sup.reason);
    const model = sup.f16 ? MODELS.f16 : MODELS.f32;
    set({ status: 'loading', backend: 'browser', progress: 0, text: 'Starting…', error: '', model, vision: '', models: [] });
    const web = await import(WEBLLM);
    engine = await web.CreateMLCEngine(model, { initProgressCallback: (p) => set({ progress: p.progress ?? 0, text: p.text ?? '' }) });
    set({ status: 'ready', progress: 1, text: '' });
    return engine;
  })().catch((e) => { engine = null; set({ status: 'error', error: String(e?.message ?? e) }); throw e; }).finally(() => { loading = null; });
  return loading;
}

/** Plugs in any engine with WebLLM's chat.completions.create, as if the model had loaded. For tests and demos with a stand-in. */
export function useEngine(eng) { engine = eng; set(eng ? { status: 'ready', backend: 'browser', progress: 1, text: '', error: '', model: 'stand-in' } : { status: 'off' }); }

/** Stops the browser model and deletes what was downloaded (the browser's WebLLM caches), so the space comes back. */
export async function remove() {
  const eng = engine; engine = null;
  try { await eng?.unload?.(); } catch { /* already gone */ }
  try { for (const key of await caches.keys()) if (key.startsWith('webllm')) await caches.delete(key); } catch { /* no Cache Storage */ }
  set({ status: 'off', backend: '', progress: 0, text: '', error: '', model: '', vision: '', models: [] });
}

// ---------- Ollama, on your own computer ----------
export const OLLAMA_URL = 'http://localhost:11434';
const VISION_NAME = /vl\b|vision|llava|gemma3|minicpm-v|moondream|granite3\.2-vision/i;
const baseOf = (url) => String(url || OLLAMA_URL).trim().replace(/\/+$/, '');
const post = (url, body, ms) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });

/** The models Ollama has: [{ name, size, vision }]. Throws a readable error when Ollama can't be reached. */
export async function ollamaModels(url) {
  let res;
  try { res = await fetch(`${baseOf(url)}/api/tags`, { signal: AbortSignal.timeout(4000) }); } catch {
    throw new Error(`Can’t reach Ollama at ${baseOf(url)}. Is it running? (A phone also needs OLLAMA_HOST=0.0.0.0, and an http page.)`);
  }
  if (!res.ok) throw new Error(`Ollama answered ${res.status}.`);
  const { models = [] } = await res.json();
  return models.map((m) => ({ name: m.name, size: m.size ?? 0,
    vision: Array.isArray(m.capabilities) ? m.capabilities.includes('vision') : VISION_NAME.test(m.name),
    embed: /embed/i.test(m.name) || (Array.isArray(m.capabilities) && m.capabilities.includes('embedding') && !m.capabilities.includes('completion')) }));
}
/** Which models to use: text = qwen2.5 first (fast, and it follows JSON forms well), then the smallest other text model; vision = the first that can see. */
export function pickModels(models, want = {}) {
  const by = (name) => models.find((m) => m.name === name);
  const text = models.filter((m) => !m.vision && !m.embed);
  const rank = (m) => (/qwen2\.5/i.test(m.name) ? 0 : /llama3|gemma|phi|mistral/i.test(m.name) ? 1 : /qwen3/i.test(m.name) ? 2 : 3);
  const chosen = (want.model && by(want.model) && !by(want.model).embed ? by(want.model) : null) ?? [...text].sort((a, b) => rank(a) - rank(b) || a.size - b.size)[0] ?? null;
  const seeing = models.filter((m) => m.vision);
  const eyes = (want.vision && by(want.vision)?.vision ? by(want.vision) : null) ?? [...seeing].sort((a, b) => /qwen2\.5vl/i.test(a.name) ? -1 : /qwen2\.5vl/i.test(b.name) ? 1 : a.size - b.size)[0] ?? null;
  return { text: chosen, vision: eyes };
}
/** Ollama's own words for what went wrong ({ "error": "…" }), or a plain status line. */
async function ollamaError(res) { let msg = ''; try { msg = String((await res.json()).error ?? ''); } catch { /* no body */ } return msg || `Ollama answered ${res.status}.`; }
/** An engine with the same shape as WebLLM's, so understand() works on either. */
export function ollamaEngine(base, model) {
  return { chat: { completions: { async create(req) {
    const body = { model, stream: false, keep_alive: '30m', think: false, messages: req.messages, options: { temperature: req.temperature ?? 0, num_predict: req.max_tokens ?? 160 } };
    if (req.response_format?.schema) body.format = JSON.parse(req.response_format.schema);
    const res = await post(`${base}/api/chat`, body, 120_000);
    if (!res.ok) throw new Error(await ollamaError(res));
    const json = await res.json();
    return { choices: [{ message: { content: json.message?.content ?? '' } }] };
  } } } };
}
/** Connects to Ollama and loads the model into memory first (that can take a minute or two the first time). Same one-at-a-time rule as load(). */
export function loadOllama(url, want = {}) {
  if (loading) return loading;
  const base = baseOf(url);
  loading = (async () => {
    set({ status: 'loading', backend: 'ollama', progress: 0.05, text: 'Looking for Ollama…', error: '', vision: '', models: [] });
    const models = await ollamaModels(base);
    const { text, vision } = pickModels(models, want);
    if (!text) throw new Error('Ollama has no text model yet. In a terminal run: ollama pull qwen2.5:3b');
    set({ progress: 0.2, text: `Loading ${text.name} into memory. The first time can take a minute or two…`, model: text.name });
    const warm = await post(`${base}/api/generate`, { model: text.name, stream: false, keep_alive: '30m' }, 300_000); // an empty prompt just loads the model
    if (!warm.ok) throw new Error(`Ollama couldn’t load ${text.name} (${warm.status}).`);
    engine = ollamaEngine(base, text.name); ollamaBase = base; visionModel = vision?.name ?? '';
    set({ status: 'ready', progress: 1, text: '', model: text.name, vision: visionModel, models: models.map((m) => m.name) });
    return engine;
  })().catch((e) => { engine = null; visionModel = ''; set({ status: 'error', error: String(e?.message ?? e) }); throw e; }).finally(() => { loading = null; });
  return loading;
}
/** Lets go of Ollama (the models stay on your computer; Ollama frees the memory by itself). */
export function disconnect() { engine = null; visionModel = ''; ollamaBase = ''; set({ status: 'off', backend: '', progress: 0, text: '', error: '', model: '', vision: '', models: [] }); }

// ---------- receipts ----------
export const RECEIPT_SCHEMA = { type: 'object', additionalProperties: false, required: ['merchant', 'date', 'total', 'category', 'items'], properties: {
  merchant: { type: 'string', maxLength: 60 },
  date: { type: 'string' },
  total: { type: 'number' },
  category: { type: 'string', enum: E.CATEGORIES },
  items: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['name', 'price'], properties: { name: { type: 'string', maxLength: 40 }, price: { type: 'number' } } } } } };
export const receiptPrompt = (today) => `Read this shop receipt. Answer with one JSON object and nothing else. Today is ${today}. Currency is Malaysian ringgit (RM).
merchant: the shop name. date: the purchase date as YYYY-MM-DD, or "" if you can't see one. total: the final amount PAID including tax and service charge; not a subtotal, not the cash handed over, not the change. category: FOOD, TRANSPORT, SHOPPING, FUN, HEALTH, LIVING or OTHER. items: up to 12 lines of what was bought, each with its name and price. Use 0 for total if you cannot read it. Never guess a number you can't see.`;

/** The vision model's form → a receipt the person can check, or throws when there is no usable total. Nothing is saved from here. */
export function toReceipt(form, today) {
  const total = Number(form?.total);
  if (!Number.isFinite(total) || total <= 0 || total >= 1e7) throw new Error('I couldn’t find a total on that receipt. Try a sharper, straight-on photo, or type it.');
  const amountMinor = Math.round(total * 100);
  const named = (Array.isArray(form.items) ? form.items : []).map((i) => i?.name).filter((n) => typeof n === 'string');
  const dateKnown = typeof form.date === 'string' && E.isISO(form.date) && form.date <= today && form.date >= E.addDays(today, -400);
  const items = (Array.isArray(form.items) ? form.items : []).map((i) => ({ name: clean(i?.name), minor: Math.round(Number(i?.price) * 100) }))
    .filter((i) => i.name && Number.isFinite(i.minor) && i.minor > 0).slice(0, 12);
  const itemsMinor = items.reduce((s, i) => s + i.minor, 0);
  // What was bought says more than a small model's guess: bread and chocolate are Food whatever category it picked. The model's pick is the fallback.
  const category = guessCategory(`${clean(form.merchant, 60)} ${named.join(' ')}`) ?? (E.CATEGORIES.includes(form.category) ? form.category : 'OTHER');
  return { merchant: clean(form.merchant, 60), date: dateKnown ? form.date : today, dateKnown, amountMinor, category,
    items, itemsMinor, mismatch: items.length > 0 && Math.abs(itemsMinor - amountMinor) > Math.max(50, amountMinor * 0.15) };
}
/** One request to the vision model. `extra` is added to Ollama's options (e.g. num_gpu: 0 to stay off the GPU). */
async function askVision(imageBase64, today, extra = {}) {
  // keep_alive 0: hand the memory back straight away, so the text model can come back (a laptop GPU can't hold both).
  const res = await post(`${ollamaBase}/api/chat`, { model: visionModel, stream: false, keep_alive: 0, think: false, format: RECEIPT_SCHEMA,
    // num_ctx 3072 is enough for a 1280 px photo (about 1400 image tokens) plus the question and the answer. The default is bigger, which pushes layers off a small GPU: measured 95 s → 48 s to read the picture.
    options: { temperature: 0, num_predict: 500, num_ctx: 3072, ...extra },
    messages: [{ role: 'user', content: receiptPrompt(today), images: [imageBase64] }] }, 420_000);
  if (!res.ok) { const msg = await ollamaError(res); throw Object.assign(new Error(/memory/i.test(msg) ? 'There isn’t enough memory for the vision model. Close programs that use the graphics card (games, video, other AI tools) and try again.' : `Ollama couldn’t read the photo: ${msg}`), { oom: /memory/i.test(msg) }); }
  let form; try { form = JSON.parse((await res.json()).message?.content ?? ''); } catch { throw new Error('The vision model didn’t return a readable answer. Try again.'); }
  return toReceipt(form, today);
}
/** Reads a receipt photo (base64 JPEG, no prefix) with the vision model on Ollama. It can take a few minutes on a laptop GPU. */
export async function readReceipt(imageBase64, today) {
  if (!canReadReceipts()) throw new Error('No vision model is connected.');
  // The text model may be holding the graphics memory the vision model needs (that crashed it with "out of memory"): let it go first.
  await post(`${ollamaBase}/api/generate`, { model: state.model, stream: false, keep_alive: 0 }, 20_000).catch(() => {});
  try {
    try { return await askVision(imageBase64, today); } catch (e) { if (!e.oom) throw e; return await askVision(imageBase64, today, { num_gpu: 0 }); } // still no room: slower, but on the processor
  } finally {
    post(`${ollamaBase}/api/generate`, { model: state.model, stream: false, keep_alive: '30m' }, 300_000).catch(() => {}); // bring the text model back in the background
  }
}
