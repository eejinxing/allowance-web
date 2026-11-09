// The total-finding rules of the on-device receipt reader, tested on rows of text as the model reads them (the model itself is scored on real photos by ml/score.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { findTotal, amountsIn, decode, cutRows, CHARS } from '../js/receiptscan.js';

const rows = (...t) => t.map((text) => ({ text, conf: 0.9 }));

test('amountsIn reads money in the usual shapes and ignores other numbers', () => {
  assert.deepEqual(amountsIn('TOTAL $99.59'), [9959]);
  assert.deepEqual(amountsIn('GRAND TOTAL RM 1,234.50'), [123450]);
  assert.deepEqual(amountsIn('JUMLAH 12,50'), [1250]);
  assert.deepEqual(amountsIn('TOTAL £14.40'), [1440]);
  assert.deepEqual(amountsIn('TEL: 813 932-0562 TC# 0432 2121'), []);
  assert.deepEqual(amountsIn('TOTAL: 32:13'), []);              // a duration, not money
  assert.deepEqual(amountsIn('TAX 1 7.000 % 0.26'), [26]);      // 7.000 is not 7.00
});

test('the TOTAL row wins over subtotal, cash and change', () => {
  const t = findTotal(rows('BREAD 2.88 N', 'SUBTOTAL 46.04', 'TAX 1 7.000 % 0.26', 'TOTAL 46.30', 'DEBIT TEND 50.00', 'CHANGE DUE 3.70'));
  assert.equal(t.cents, 4630); assert.equal(t.source, 'total');
});

test('the value printed on several TOTAL rows is the one chosen', () => {
  const t = findTotal(rows('TOTAL 46.30', 'ACCOUNT : 5259', '46.30 TOTAL PURCHASE', 'TOTAL SAVINGS 1.20'));
  assert.equal(t.cents, 4630);
});

test('"TOTAL ITEMS 4" and "ITEM COUNT" are not the total', () => {
  const t = findTotal(rows('ITEM COUNT: 10', 'TOTAL ITEMS 4', 'TOTAL £14.40', 'CREDIT £14.40'));
  assert.equal(t.cents, 1440);
});

test('a receipt that prints only SUB TOTAL is read from that row', () => {
  const t = findTotal(rows('Lorem ipsum $9.20', 'SUB TOTAL $107.60', 'CASH $200.00', 'CHANGE $92.40'));
  assert.equal(t.cents, 10760); assert.equal(t.source, 'subtotal');
});

test('with no total row at all, the biggest amount that is not cash or change is offered, and marked as a guess', () => {
  const t = findTotal(rows('NASI LEMAK 7.50', 'TEH TARIK 2.50', 'CASH 20.00', 'CHANGE 10.00'));
  assert.equal(t.cents, 750); assert.equal(t.source, 'largest');
});

test('a whole-number total is read only from a row that says TOTAL', () => {
  assert.equal(findTotal(rows('ITEM COUNT: 10', 'TOTAL: 557'))?.cents, 55700);
  assert.equal(findTotal(rows('ORDER #0001', 'CARD #: **** 2021'))?.cents ?? null, null);
});

test('no money, no answer', () => { assert.equal(findTotal(rows('THANK YOU', 'TOTAL: 32:13')), null); assert.equal(findTotal([]), null); });

test('decode is greedy CTC: repeats collapse only across a blank, and confidence is the weakest kept character', () => {
  const C = CHARS.length + 1, T = 6, s = new Float32Array(T * C).fill(-9);
  const at = (t, c, v = 9) => { s[t * C + c] = v; };
  const id = (ch) => CHARS.indexOf(ch) + 1;
  at(0, id('4')); at(1, id('4')); at(2, 0); at(3, id('4')); at(4, id('.')); at(5, 0);
  const r = decode(s, T, C); assert.equal(r.text, '44.'); assert.ok(r.conf > 0.99);
});

test('cutRows finds the rows of dark text on a light page and skips a barcode', () => {
  const w = 720, h = 260, g = new Uint8ClampedArray(w * h).fill(235);
  const bar = (y0, y1, x0, x1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if ((x >> 1) % 2 === 0) g[y * w + x] = 30; };
  bar(20, 40, 40, 400); bar(70, 90, 40, 300); bar(120, 140, 300, 680);          // three text-like rows
  for (let y = 170; y < 235; y++) for (let x = 100; x < 600; x++) if (Math.floor(x / 3) % 2 === 0) g[y * w + x] = 20;  // a barcode, 65 high
  const b = cutRows(g, w, h);
  assert.equal(b.length, 3);
  assert.ok(b[0][0] <= 20 && b[0][1] >= 40 && b[0][2] <= 40 && b[0][3] >= 400);
});
