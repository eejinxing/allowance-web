// The local language reader: what each kind of sentence turns into. No AI service is involved, so these are exact.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { interpret, findAmount, guessCategory, spendingTotal, isChinese } from '../js/nlu.js';

const today = '2026-11-08';
const read = (text) => interpret(text, today);

test('recording: "spent RM3 on coffee" is an expense of 3.00 in Food, dated today', () => {
  assert.deepEqual(read('spent RM3 on coffee'), { type: 'expense', amount: 300, name: 'Coffee', category: 'FOOD', date: today });
  assert.deepEqual(read('I paid RM 12.50 for Grab'), { type: 'expense', amount: 1250, name: 'Grab', category: 'TRANSPORT', date: today });
  assert.deepEqual(read('bought bubble tea 8.90'), { type: 'expense', amount: 890, name: 'Bubble tea', category: 'FOOD', date: today });
});

test('recording in Chinese: 块, 毛, Chinese numerals and the date words', () => {
  assert.deepEqual(read('我今天花了3块买咖啡'), { type: 'expense', amount: 300, name: '咖啡', category: 'FOOD', date: today });
  assert.equal(read('花了三块五买奶茶').amount, 350);
  assert.equal(read('午餐花了十二块').amount, 1200);
  assert.equal(read('买了电影票 25令吉').amount, 2500);
  assert.equal(read('昨天打车花了18块').date, '2026-11-07');
  assert.equal(read('前天吃了饭 9块').date, '2026-11-06');
});

test('a written currency wins over a stray number, and sen are sen', () => {
  assert.equal(findAmount('had 2 coffees for RM 7').amount, 700);
  assert.equal(findAmount('50 sen').amount, 50);
  assert.equal(findAmount('50仙').amount, 50);
  assert.equal(findAmount('RM 1,200').amount, 120000);
  assert.equal(findAmount('rm12,50').amount, 1250);
  assert.equal(findAmount('no price here'), null);
});

test('a purchase check: questions, wanting, or just "item price"', () => {
  assert.deepEqual(read('Sneakers RM 120'), { type: 'check', amount: 12000, name: 'Sneakers' });
  assert.deepEqual(read('Can I afford sneakers RM 120?'), { type: 'check', amount: 12000, name: 'Sneakers' });
  assert.equal(read('I want a new phone RM 3000').type, 'check');
  assert.equal(read('我想买耳机 200块').type, 'check');
  assert.equal(read('买得起这个游戏吗 80块').type, 'check');
});

test('questions about the numbers need no amount', () => {
  assert.deepEqual(read('how much is left today?'), { type: 'status' });
  assert.deepEqual(read('how much can I spend today'), { type: 'status' });
  assert.deepEqual(read('今天还剩多少'), { type: 'status' });
  assert.deepEqual(read('how much did I spend on food this month'), { type: 'spending', period: 'month', category: 'FOOD' });
  assert.deepEqual(read('how much did I spend today?'), { type: 'spending', period: 'today', category: null });
  assert.deepEqual(read('这周花了多少'), { type: 'spending', period: 'week', category: null });
});

test('an amount in the sentence makes "can I spend" a purchase, not a status question', () => {
  assert.equal(read('can I spend RM 50 today?').type, 'check');
});

test('goals, wishes and undo', () => {
  assert.deepEqual(read('save for a Japan trip RM 5000'), { type: 'goal', amount: 500000, name: 'Japan trip' });
  assert.deepEqual(read('add AirPods RM 999 to my wish list'), { type: 'wish', amount: 99900, name: 'AirPods' });
  assert.deepEqual(read('undo'), { type: 'undo' });
  assert.deepEqual(read('撤销'), { type: 'undo' });
  assert.deepEqual(read('delete the last one'), { type: 'undo' });
});

test('what it does not understand stays null, and never invents an amount', () => {
  assert.equal(read(''), null);
  assert.equal(read('hello there'), null);
  assert.equal(read('spent a lot on coffee'), null);
  assert.equal(read('今天心情不错'), null);
});

test('categories: the longest keyword wins, nothing matched is null', () => {
  assert.equal(guessCategory('grab food'), 'FOOD');
  assert.equal(guessCategory('grab to office'), 'TRANSPORT');
  assert.equal(guessCategory('watsons vitamins'), 'HEALTH');
  assert.equal(guessCategory('monthly rent'), 'LIVING');
  assert.equal(guessCategory('a surprise'), null);
});

test('isChinese tells which language to answer in', () => {
  assert.equal(isChinese('花了3块'), true);
  assert.equal(isChinese('spent 3'), false);
});

test('spendingTotal adds up the right entries and skips family-paid ones', () => {
  const entry = (date, amountMinor, category, extra = {}) => E.newEntry({ date, amountMinor, category, ...extra });
  const data = { entries: [entry(today, 300, 'FOOD'), entry(today, 1000, 'TRANSPORT'), entry('2026-11-07', 500, 'FOOD'), entry('2026-11-02', 700, 'FOOD'),
    entry('2026-10-30', 900, 'FOOD'), entry(today, 4000, 'FOOD', { family: true })] };
  assert.deepEqual(spendingTotal(data, 'today', null, today), { total: 1300, count: 2 });
  assert.deepEqual(spendingTotal(data, 'yesterday', null, today), { total: 500, count: 1 });
  assert.deepEqual(spendingTotal(data, 'week', null, today), { total: 2500, count: 4 }); // 11-02 to 11-08 is seven days; 10-30 is out
  assert.deepEqual(spendingTotal(data, 'month', 'FOOD', today), { total: 1500, count: 3 });
});

test('the chocolate sentences: record it, or ask whether you can buy it, with a clean item name', () => {
  assert.deepEqual(read('今天我花了8块钱买巧克力'), { type: 'expense', amount: 800, name: '巧克力', category: 'FOOD', date: today });
  assert.deepEqual(read('你看一下我8块钱可不可以买巧克力'), { type: 'check', amount: 800, name: '巧克力' });
  assert.deepEqual(read('我8块钱可不可以买巧克力'), { type: 'check', amount: 800, name: '巧克力' });
  assert.deepEqual(read('can I buy chocolate for 8 ringgit?'), { type: 'check', amount: 800, name: 'Chocolate' });
});
