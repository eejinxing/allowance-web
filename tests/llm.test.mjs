// The on-device AI layer, tested with a fake engine (no model is downloaded). What matters here is the guard rails:
// the model's form becomes an intent, amounts always come from the text, and anything unusable falls back to null.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toIntent, understand, systemPrompt, SCHEMA } from '../js/llm.js';

const today = '2026-11-08';
const form = (over = {}) => ({ action: 'chat', item: '', category: 'NONE', days_ago: 0, period: 'today', reply: '', ...over });
/** An engine that answers with whatever it is given, and remembers what it was asked. */
const fake = (content) => {
  const eng = { asked: null, chat: { completions: { create(req) { eng.asked = req; return Promise.resolve({ choices: [{ message: { content } }] }); } } } };
  return eng;
};

test('a recorded expense takes its amount from the text and its other fields from the form', () => {
  assert.deepEqual(toIntent(form({ action: 'record_expense', item: 'coffee', category: 'FOOD' }), 'spent RM3 on coffee', today),
    { type: 'expense', amount: 300, name: 'Coffee', category: 'FOOD', date: today });
  assert.deepEqual(toIntent(form({ action: 'record_expense', item: '打车', category: 'TRANSPORT', days_ago: 1 }), '昨天打车花了18块', today),
    { type: 'expense', amount: 1800, name: '打车', category: 'TRANSPORT', date: '2026-11-07' });
});

test('the model can never change an amount: it is not even in the form, and a made-up one is ignored', () => {
  assert.equal('amount' in SCHEMA.properties, false);
  const sneaky = toIntent({ ...form({ action: 'check_purchase', item: 'Sneakers' }), amount: 1 }, 'Sneakers RM 120', today);
  assert.equal(sneaky.amount, 12000);
});

test('no readable price means no money action', () => {
  for (const action of ['record_expense', 'check_purchase', 'set_goal', 'add_wish']) assert.equal(toIntent(form({ action, item: 'coffee' }), 'I bought some coffee', today), null);
});

test('questions about the budget need no price', () => {
  assert.deepEqual(toIntent(form({ action: 'status' }), '今天还能花多少', today), { type: 'status' });
  assert.deepEqual(toIntent(form({ action: 'undo' }), 'oops delete that', today), { type: 'undo' });
  assert.deepEqual(toIntent(form({ action: 'spending', category: 'FOOD', period: 'week' }), 'food this week?', today), { type: 'spending', period: 'week', category: 'FOOD' });
});

test('a bad category, day or period is repaired instead of trusted', () => {
  assert.equal(toIntent(form({ action: 'record_expense', category: 'NONE' }), 'spent RM 3 on kopi', today).category, 'FOOD'); // from the words
  assert.equal(toIntent(form({ action: 'record_expense', category: 'NONE' }), 'spent RM 3 on a thing', today).category, 'OTHER');
  assert.equal(toIntent(form({ action: 'record_expense', days_ago: 400 }), 'spent RM 3', today).date, today);
  // the model once read "earlier" as yesterday: with no date word in the sentence, the day is today whatever it says
  assert.equal(toIntent(form({ action: 'record_expense', item: 'bubble tea', days_ago: 1 }), 'earlier I grabbed a bubble tea, 9 bucks', today).date, today);
  assert.equal(toIntent(form({ action: 'record_expense', days_ago: 3 }), 'spent RM 12 on lunch 3 days ago', today).date, '2026-11-05'); // an explicit "3 days ago": the model's count is used
  assert.equal(toIntent(form({ action: 'record_expense', days_ago: 0 }), '昨天打车花了18块', today).date, '2026-11-07'); // yesterday is the rules' word, whatever the model says
  assert.equal(toIntent(form({ action: 'record_expense', days_ago: 5 }), '上周五买了书 30块', today).date, '2026-10-30'); // 上周五 is worked out by the rules (Friday of last Monday-to-Sunday week), whatever the model says
  assert.equal(toIntent(form({ action: 'record_expense', days_ago: -2 }), 'spent RM 3', today).date, today);
  assert.equal(toIntent(form({ action: 'spending', period: 'decade' }), 'how much did I spend', today).period, 'month');
});

test('chat keeps only a short reply, and an empty reply is no answer', () => {
  assert.deepEqual(toIntent(form({ reply: 'Hi! Tell me what you spent.' }), 'hi', today), { type: 'chat', reply: 'Hi! Tell me what you spent.' });
  assert.deepEqual(toIntent(form({ reply: '   ' }), 'hi', today), { type: 'chat', reply: '' }); // the model said "no action needed"; it just has nothing to say
  assert.equal(toIntent(form({ reply: 'x'.repeat(500) }), 'hi', today).reply.length, 160);
});

test('junk is rejected', () => {
  assert.equal(toIntent(null, 'x', today), null);
  assert.equal(toIntent({ action: 'launch_missiles' }, 'x', today), null);
  assert.equal(toIntent('record_expense', 'spent 3', today), null);
});

test('understand sends the sentence and the form to the engine and returns the intent', async () => {
  const eng = fake(JSON.stringify(form({ action: 'record_expense', item: 'coffee', category: 'FOOD' })));
  assert.deepEqual(await understand('spent RM3 on coffee', today, eng), { type: 'expense', amount: 300, name: 'Coffee', category: 'FOOD', date: today });
  assert.equal(eng.asked.temperature, 0);
  assert.equal(eng.asked.messages[1].content, 'spent RM3 on coffee');
  assert.equal(eng.asked.messages[0].content, systemPrompt(today));
  assert.equal(JSON.parse(eng.asked.response_format.schema).properties.action.enum.includes('record_expense'), true);
});

test('understand returns null (so the rules take over) when there is no engine, broken JSON, or an engine that throws', async () => {
  assert.equal(await understand('spent RM3', today, null), null);
  assert.equal(await understand('spent RM3', today, fake('not json at all')), null);
  assert.equal(await understand('spent RM3', today, { chat: { completions: { create: () => Promise.reject(new Error('GPU lost')) } } }), null);
});

// ---------- hints from your own history ----------
test('hints from past entries reach the model, and are left out when there are none', () => {
  assert.equal(systemPrompt(today), systemPrompt(today, ''));
  assert.match(systemPrompt(today, 'Chocolate -> FOOD, usually 5.00 (3x)'), /past entries that look related.*Chocolate -> FOOD/s);
  assert.equal(systemPrompt(today).includes('past entries'), false);
});

// ---------- Ollama ----------
import { pickModels, ollamaEngine, toReceipt, receiptPrompt, RECEIPT_SCHEMA } from '../js/llm.js';
const models = [
  { name: 'qwen3:4b', size: 2.5e9, vision: false, embed: false }, { name: 'qwen2.5:3b', size: 1.9e9, vision: false, embed: false },
  { name: 'nomic-embed-text:latest', size: 0.3e9, vision: false, embed: true }, { name: 'qwen2.5vl:3b', size: 3.2e9, vision: true, embed: false }, { name: 'llava:7b', size: 4.7e9, vision: true, embed: false } ];

test('pickModels prefers qwen2.5 for text, never an embedding model, and the qwen vision model for pictures', () => {
  const { text, vision } = pickModels(models);
  assert.equal(text.name, 'qwen2.5:3b'); assert.equal(vision.name, 'qwen2.5vl:3b');
  assert.equal(pickModels(models, { model: 'qwen3:4b' }).text.name, 'qwen3:4b'); // a saved choice wins
  assert.equal(pickModels(models, { model: 'nomic-embed-text:latest' }).text.name, 'qwen2.5:3b'); // but not an embedding model
  assert.equal(pickModels(models, { vision: 'llava:7b' }).vision.name, 'llava:7b');
  assert.deepEqual(pickModels([models[1]]), { text: models[1], vision: null });
  assert.deepEqual(pickModels([]), { text: null, vision: null });
});

test('the Ollama engine speaks Ollama but answers like WebLLM, so understand() works on both', async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ message: { content: JSON.stringify(form({ action: 'record_expense', item: '巧克力', category: 'FOOD' })) } }) }; };
  try {
    const eng = ollamaEngine('http://localhost:11434', 'qwen2.5:3b');
    assert.deepEqual(await understand('今天我花了8块钱买巧克力', today, eng), { type: 'expense', amount: 800, name: '巧克力', category: 'FOOD', date: today });
    const sent = seen[0];
    assert.equal(sent.url, 'http://localhost:11434/api/chat');
    assert.equal(sent.body.model, 'qwen2.5:3b'); assert.equal(sent.body.stream, false); assert.equal(sent.body.think, false);
    assert.equal(sent.body.options.temperature, 0);
    assert.deepEqual(sent.body.format, SCHEMA); // the form travels as Ollama's `format`
    assert.equal(sent.body.messages[1].content, '今天我花了8块钱买巧克力');
  } finally { globalThis.fetch = realFetch; }
});

test('a failing Ollama is not an answer: understand() returns null so the rules take over', async () => {
  const realFetch = globalThis.fetch; globalThis.fetch = async () => ({ ok: false, status: 500 });
  try { assert.equal(await understand('spent RM3', today, ollamaEngine('http://localhost:11434', 'm')), null); } finally { globalThis.fetch = realFetch; }
});

// ---------- receipts ----------
test('toReceipt keeps what is readable and repairs what is not', () => {
  const r = toReceipt({ merchant: '  99 Speedmart ', date: '2026-11-06', total: 23.4, category: 'FOOD', items: [{ name: 'Milk', price: 8.9 }, { name: 'Bread', price: 4.5 }, { name: '', price: 3 }, { name: 'Free', price: 0 }] }, today);
  assert.deepEqual({ ...r, items: r.items.length }, { merchant: '99 Speedmart', date: '2026-11-06', dateKnown: true, amountMinor: 2340, category: 'FOOD', items: 2, itemsMinor: 1340, mismatch: true });
  const loose = toReceipt({ merchant: '', date: 'yesterday-ish', total: 12, category: 'NOPE', items: [] }, today);
  assert.deepEqual([loose.date, loose.dateKnown, loose.category, loose.mismatch], [today, false, 'OTHER', false]);
  assert.equal(toReceipt({ total: 10, date: '2030-01-01' }, today).dateKnown, false); // the future is not a purchase date
  assert.equal(toReceipt({ total: 10, date: '2020-01-01' }, today).dateKnown, false); // nor a date years ago
});

test('a receipt without a usable total is refused, never guessed', () => {
  for (const total of [0, -5, NaN, undefined, 'abc', 1e9]) assert.throws(() => toReceipt({ total, items: [] }, today), /couldn’t find a total/);
});

test('small gaps between items and the total are not flagged, big ones are', () => {
  const total = 20.0;
  assert.equal(toReceipt({ total, items: [{ name: 'a', price: 19.5 }] }, today).mismatch, false);
  assert.equal(toReceipt({ total, items: [{ name: 'a', price: 10 }] }, today).mismatch, true);
});

test('the receipt prompt and schema ask for a total paid, in the fixed form', () => {
  assert.match(receiptPrompt(today), /final amount PAID.*not a subtotal.*not the change/s);
  assert.deepEqual(RECEIPT_SCHEMA.required, ['merchant', 'date', 'total', 'category', 'items']);
});

test('a receipt’s category follows what was bought, with the model’s pick as the fallback', () => {
  const food = toReceipt({ merchant: '99 SPEEDMART', total: 33.5, category: 'SHOPPING', items: [{ name: 'MILO 1KG', price: 17.9 }, { name: 'GARDENIA BREAD', price: 4.5 }] }, today);
  assert.equal(food.category, 'FOOD'); // "bread" says Food, the model said Shopping
  assert.equal(toReceipt({ merchant: 'PETRONAS', total: 60, category: 'TRANSPORT', items: [{ name: 'RON95', price: 60 }] }, today).category, 'TRANSPORT'); // nothing in the words: the model's pick stays
  assert.equal(toReceipt({ merchant: 'X', total: 5, category: 'NOPE', items: [{ name: 'thing', price: 5 }] }, today).category, 'OTHER');
});

// ---------- reading a receipt through Ollama (fetch is faked; the order of the calls is what matters) ----------
import { loadOllama, readReceipt, canReadReceipts } from '../js/llm.js';
const goodReceipt = { merchant: 'Shop', date: '2026-11-06', total: 12.5, category: 'FOOD', items: [{ name: 'Bread', price: 12.5 }] };
/** Fakes Ollama: `chatReplies` are used in order for vision chats. Returns the calls it saw. */
function fakeOllama(chatReplies) {
  const calls = []; const real = globalThis.fetch; let n = 0;
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname; const body = init.body ? JSON.parse(init.body) : null; calls.push({ path, body });
    if (path === '/api/tags') return { ok: true, json: async () => ({ models: [{ name: 'qwen2.5:3b', size: 1.9e9, capabilities: ['completion'] }, { name: 'qwen2.5vl:3b', size: 3.2e9, capabilities: ['completion', 'vision'] }] }) };
    if (path === '/api/generate') return { ok: true, json: async () => ({}) };
    const reply = chatReplies[Math.min(n++, chatReplies.length - 1)];
    return reply.error ? { ok: false, status: 500, json: async () => ({ error: reply.error }) } : { ok: true, json: async () => ({ message: { content: JSON.stringify(reply) } }) };
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const tick = () => new Promise((r) => setTimeout(r, 10));

test('reading a receipt frees the text model first, hands the memory back after, and brings the text model back', async () => {
  const f = fakeOllama([goodReceipt]);
  try {
    await loadOllama('http://localhost:11434'); assert.equal(canReadReceipts(), true);
    f.calls.length = 0;
    const r = await readReceipt('QUJD', today); await tick();
    assert.equal(r.amountMinor, 1250);
    const seq = f.calls.map((c) => `${c.path} ${c.body.model} keep_alive=${c.body.keep_alive}`);
    assert.deepEqual(seq, ['/api/generate qwen2.5:3b keep_alive=0', '/api/chat qwen2.5vl:3b keep_alive=0', '/api/generate qwen2.5:3b keep_alive=30m']);
    const chat = f.calls[1].body;
    assert.equal(chat.messages[0].images[0], 'QUJD'); assert.deepEqual(chat.format, RECEIPT_SCHEMA); assert.equal(chat.options.temperature, 0);
  } finally { f.restore(); }
});

test('"out of memory" is retried once on the processor instead of failing', async () => {
  const f = fakeOllama([{ error: 'llama-server reported out-of-memory during start' }, goodReceipt]);
  try {
    await loadOllama('http://localhost:11434'); f.calls.length = 0;
    assert.equal((await readReceipt('QUJD', today)).amountMinor, 1250);
    const chats = f.calls.filter((c) => c.path === '/api/chat');
    assert.equal(chats.length, 2); assert.equal(chats[0].body.options.num_gpu, undefined); assert.equal(chats[1].body.options.num_gpu, 0);
  } finally { f.restore(); }
});

test('when there is no memory even then, the message says what to do; other errors carry Ollama’s own words', async () => {
  let f = fakeOllama([{ error: 'out of memory' }]);
  try { await loadOllama('http://localhost:11434'); await assert.rejects(readReceipt('QUJD', today), /isn’t enough memory.*Close programs/); } finally { f.restore(); }
  f = fakeOllama([{ error: 'model requires more system memory than is available' }].map(() => ({ error: 'unsupported image format' })));
  try { await loadOllama('http://localhost:11434'); await assert.rejects(readReceipt('QUJD', today), /couldn’t read the photo: unsupported image format/); } finally { f.restore(); }
});

// ---------- combine: two readers, one decision ----------
import { combine } from '../js/llm.js';
const exp = (amount = 300) => ({ type: 'expense', amount, name: 'Coffee', category: 'FOOD', date: today });
const chk = (weak) => ({ type: 'check', amount: 300, name: 'Coffee', ...(weak ? { weak: true } : {}) });

test('combine: a record is written only when both readers say it is one', () => {
  assert.deepEqual(combine(exp(), exp()), exp());                                                   // both agree: write
  assert.deepEqual(combine(chk(true), exp()), { type: 'check', amount: 300, name: 'Coffee' });      // "Sneakers 450": the model alone can't write
  assert.deepEqual(combine(exp(), chk()), { type: 'check', amount: 300, name: 'Coffee' });          // the rules alone can't either
  assert.deepEqual(combine(exp(), { type: 'chat', reply: 'Nice!' }), { type: 'chat', reply: 'Nice!' }); // the model says it isn't spending: no write
  assert.deepEqual(combine(null, exp()), { type: 'check', amount: 300, name: 'Coffee' });           // the rules saw nothing to record
  assert.equal(combine(exp(), { type: 'status' }).type, 'status');
});

test('combine: with no model the rules decide alone, as they always did', () => {
  assert.deepEqual(combine(exp(), null), exp());
  assert.equal(combine(null, null), null);
});

test('combine: a specific rule match wins; the weak default can be overruled by the model', () => {
  assert.deepEqual(combine({ type: 'status' }, { type: 'spending', period: 'today', category: null }), { type: 'status' });
  assert.deepEqual(combine({ type: 'undo' }, { type: 'chat', reply: '' }), { type: 'undo' });
  assert.deepEqual(combine(chk(false), { type: 'chat', reply: '' }), chk(false));                    // an explicit question stays a check
  assert.deepEqual(combine(chk(true), { type: 'chat', reply: '' }), { type: 'chat', reply: '' });    // "item price" the model says is not a purchase: nothing happens
  assert.deepEqual(combine(null, { type: 'status' }), { type: 'status' });                           // the rules had nothing; the model fills in
});

test('a spending question gets its period from the rules, never from the model', () => {
  assert.equal(toIntent(form({ action: 'spending', period: 'today' }), 'how much have I spent on food', today).period, 'month');
  assert.equal(toIntent(form({ action: 'spending', period: 'month' }), 'what did I spend yesterday', today).period, 'yesterday');
  assert.equal(toIntent(form({ action: 'spending', period: 'month' }), 'berapa belanja minggu ini', today).period, 'week');
});

test('the words decide the category before the model does, and the model is the fallback', () => {
  assert.equal(toIntent(form({ action: 'record_expense', item: 'Netflix', category: 'OTHER' }), 'subscribed to Netflix RM 55', today).category, 'FUN'); // the model said Other
  assert.equal(toIntent(form({ action: 'record_expense', item: 'thing', category: 'HEALTH' }), 'spent RM 20 on a thing', today).category, 'HEALTH'); // no keyword: the model's pick
  assert.equal(toIntent(form({ action: 'record_expense', item: 'thing', category: 'NONE' }), 'spent RM 20 on a thing', today).category, 'OTHER');   // neither: Other
});
