// Memory: looking things up in your own past entries (the retrieval half of RAG, over your history).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { tokens, recall, describe, hint } from '../js/memory.js';

const entry = (note, amountMinor, category, date = '2026-11-01', extra = {}) => E.newEntry({ note, amountMinor, category, date, ...extra });
const data = { entries: [
  entry('Chocolate', 400, 'FOOD', '2026-10-20'), entry('Chocolate bar', 500, 'FOOD', '2026-11-02'), entry('Chocolate', 600, 'FOOD', '2026-11-05'),
  entry('Bubble tea', 900, 'FOOD'), entry('Green tea', 350, 'FOOD'), entry('Grab', 1500, 'TRANSPORT'), entry('咖啡', 350, 'FOOD'), entry('Phone case', 1800, 'SHOPPING'),
  entry('Salary bonus', 5000, 'OTHER', '2026-11-01', { type: 'INCOME' }), entry('', 700, 'FOOD'),
] };

test('tokens: Latin words of three letters or more, Chinese in pairs', () => {
  assert.deepEqual([...tokens('Spent on Bubble Tea!')].sort(), ['bubble', 'spent', 'tea']);
  assert.deepEqual([...tokens('买咖啡')].sort(), ['买咖', '咖啡']);
  assert.deepEqual([...tokens('茶')], ['茶']);
  assert.equal(tokens('').size, 0);
});

test('recall finds the same thing you bought before: category, typical price, how often', () => {
  const m = recall(data, 'chocolate');
  assert.equal(m.category, 'FOOD');
  assert.equal(m.typicalMinor, 500); // median of 400, 500, 600
  assert.equal(m.minMinor, 400); assert.equal(m.maxMinor, 600);
  assert.equal(m.count, 3);
  assert.equal(m.last, '2026-11-05');
});

test('only the closest matches count: "bubble tea" finds bubble tea, not every tea', () => {
  const m = recall(data, 'bubble tea');
  assert.equal(m.count, 1); assert.equal(m.typicalMinor, 900);
});

test('it works in Chinese, inside a longer sentence', () => {
  const m = recall(data, '今天买了咖啡');
  assert.equal(m.category, 'FOOD'); assert.equal(m.typicalMinor, 350);
});

test('nothing similar, income, and empty notes give nothing', () => {
  assert.equal(recall(data, 'sneakers'), null);
  assert.equal(recall(data, 'salary'), null); // income is not spending
  assert.equal(recall(data, ''), null);
  assert.equal(recall({ entries: [] }, 'chocolate'), null);
});

test('describe and hint turn a match into one line', () => {
  const m = recall(data, 'chocolate');
  assert.match(describe(m), /usually pay about RM 5\.00 for Chocolate \(from RM 4\.00 to RM 6\.00\): 3 times, last on 11\/05\./);
  assert.equal(hint(m), 'Chocolate / Chocolate bar -> FOOD, usually 5.00 (3x)');
  assert.equal(describe(null), ''); assert.equal(hint(null), '');
  assert.match(describe(recall(data, 'phone case')), /1 time, last on 11\/01/);
});
