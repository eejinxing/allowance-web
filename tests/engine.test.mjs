// Ported from the Kotlin BudgetCalculatorTest / LedgerEngineTest so the web engine is held to the same numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';

const month = '2026-10';
const today = '2026-10-22'; // ten days left, including today
const budget = (over = {}) => ({ month, startDate: '2026-10-01', incomeMinor: 30_000, billsMinor: 0, savingsMinor: 0, weights: Array(7).fill(1), plans: {}, ...over });
const expense = (amount = 1_200, date = today, extra = {}) => ({ date, amount, kind: 'EXPENSE', self: true, ...extra });
const total = (map) => Object.values(map).reduce((a, b) => a + b, 0);

test('a yearly income is stored as its monthly share, rounded half up and never zero', () => {
  assert.equal(E.monthlyFromYearly(1_440_000), 120_000);
  assert.equal(E.monthlyFromYearly(1_000_001), 83_333);
  assert.equal(E.monthlyFromYearly(1_000_006), 83_334);
  assert.equal(E.monthlyFromYearly(1), 1);
});

test('300 ringgit over ten days gives 30 today and 18 after lunch', () => {
  const r = E.calculate(budget(), [expense()], today);
  assert.equal(r.todayAllowance, 3_000);
  assert.equal(r.todayRemaining, 1_800);
  assert.equal(r.remaining, 28_800);
  assert.equal(total(r.futureAllowances), r.remaining);
});

test('prior spending and reserves reduce the pool', () => {
  const r = E.calculate(budget({ incomeMinor: 100_000, billsMinor: 20_000, savingsMinor: 20_000 }), [expense(30_000, '2026-10-21')], today);
  assert.equal(r.spendable, 60_000);
  assert.equal(r.todayAllowance, 3_000);
});

test('a planned day gets exactly its plan and the rest spreads over other days', () => {
  const r = E.calculate(budget({ plans: { '2026-10-24': 10_000 } }), [], today);
  assert.equal(r.futureAllowances['2026-10-24'], 10_000);
  assert.equal(total(r.futureAllowances), 30_000);
  assert.equal(r.todayAllowance, 2_223); // 20 000 / 9 with the remainder going to the earliest days
});

test('a zero plan is a no-spend day', () => {
  const r = E.calculate(budget({ plans: { '2026-10-25': 0 } }), [], today);
  assert.equal(r.futureAllowances['2026-10-25'], 0);
  assert.equal(total(r.futureAllowances), 30_000);
});

test('plans larger than the money left are scaled down and nothing else gets an allowance', () => {
  const r = E.calculate(budget({ plans: { '2026-10-23': 40_000, '2026-10-24': 20_000 } }), [], today);
  assert.equal(r.futureAllowances['2026-10-23'], 20_000);
  assert.equal(r.futureAllowances['2026-10-24'], 10_000);
  assert.equal(r.todayAllowance, 0);
});

test('day shares split what is left without counting today twice', () => {
  const r = E.calculate(budget(), [expense()], today);
  assert.equal(r.dayShares[today], 3_000);
  assert.equal(total(r.dayShares), r.remaining + r.spentToday);
  const over = E.calculate(budget(), [expense(5_000)], today);
  const later = Object.fromEntries(Object.entries(over.dayShares).filter(([d]) => d > today));
  assert.equal(total(later), over.remaining);
});

test('family spending, bill payments and scheduled income do not touch the daily pool', () => {
  const entries = [
    { id: 'a', date: today, amountMinor: 900, type: 'EXPENSE', family: true },
    { id: 'b', date: today, amountMinor: 900, type: 'BILL_PAYMENT', family: false },
    { id: 'c', date: today, amountMinor: 900, type: 'SCHEDULED_INCOME', family: false, reservedMinor: 0 },
    { id: 'd', date: today, amountMinor: 900, type: 'TRANSFER', family: false, reservedMinor: 0 },
  ];
  const r = E.calculate(budget(), E.toTransactions(entries), today);
  assert.equal(r.remaining, 30_000);
});

function base() {
  return E.configure(E.emptyData(), { nickname: 'Jin', incomeMinor: 120_000, incomeFrequency: 'MONTHLY', savingsMinor: 20_000, weights: Array(7).fill(1), weightMode: 'EVEN' }, [], today);
}
const withAccounts = (d) => ({ ...d, accounts: [{ id: 'bank', name: 'Bank', type: 'BANK', openingMinor: 100_000, color: 0, archived: false }, { id: 'cash', name: 'Cash', type: 'CASH', openingMinor: 10_000, color: 0, archived: false }] });

test('setup budgets the whole month, even when starting mid-month', () => {
  const data = E.configure(E.emptyData(), { nickname: '', incomeMinor: 310_000, incomeFrequency: 'MONTHLY', savingsMinor: 31_000, weights: Array(7).fill(1), weightMode: 'EVEN' },
    [{ id: 'phone', name: 'Phone', amountMinor: 3_800, frequency: 'MONTHLY', family: false }, { id: 'rent', name: 'Rent', amountMinor: 65_000, frequency: 'MONTHLY', family: true }], '2026-10-23');
  const b = data.budgets[0];
  assert.equal(b.startDate, '2026-10-01');
  assert.equal(b.incomeMinor, 310_000);
  assert.equal(b.savingsMinor, 31_000);
  assert.equal(b.billsMinor, 3_800);
});

test('days earlier in the setup month can be logged and count against the budget', () => {
  const s = { nickname: '', incomeMinor: 310_000, incomeFrequency: 'MONTHLY', savingsMinor: 0, weights: Array(7).fill(1), weightMode: 'EVEN' };
  let d = E.configure(E.emptyData(), s, [], '2026-10-23');
  const before = E.result(d, '2026-10', '2026-10-23').remaining;
  d = E.saveEntry(d, E.newEntry({ date: '2026-10-01', amountMinor: 10_000 }), '2026-10-23');
  assert.equal(E.result(d, '2026-10', '2026-10-23').remaining, before - 10_000);
  assert.throws(() => E.saveEntry(d, E.newEntry({ date: '2026-09-30', amountMinor: 100 }), '2026-10-23'), /before your budget started/);
});

test('a budget saved with a prorated first month is widened to the whole month', () => {
  const s = { nickname: '', incomeMinor: 310_000, incomeFrequency: 'MONTHLY', savingsMinor: 31_000, weights: Array(7).fill(1), weightMode: 'EVEN' };
  const fresh = E.configure(E.emptyData(), s, [], '2026-10-23');
  const legacy = { ...fresh, budgets: [{ ...fresh.budgets[0], startDate: '2026-10-23', incomeMinor: 90_000, savingsMinor: 9_000, plans: { '2026-10-25': 5_000 } }] };
  const fixed = E.ensureMonths(legacy, '2026-10-23').budgets[0];
  assert.equal(fixed.startDate, '2026-10-01');
  assert.equal(fixed.incomeMinor, 310_000);
  assert.deepEqual(fixed.plans, { '2026-10-25': 5_000 });
});

test('frequency conversion uses actual active days', () => {
  assert.equal(E.periodAmount(100, 'DAILY', 31), 3_100);
  assert.equal(E.periodAmount(7_000, 'WEEKLY', 31), 31_000);
  assert.equal(E.periodAmount(1_000, 'MONTHLY', 9), 1_000);
});

test('a logged expense lowers today and the account balance', () => {
  let d = withAccounts(base());
  const before = E.result(d, month, today).todayRemaining;
  d = E.saveEntry(d, E.newEntry({ date: today, amountMinor: 1_250, accountId: 'bank' }), today);
  assert.equal(E.accountBalance(d, d.accounts[0]), 98_750);
  assert.equal(E.result(d, month, today).todayRemaining, before - 1_250);
  d = E.deleteEntry(d, d.entries[0].id);
  assert.equal(E.accountBalance(d, d.accounts[0]), 100_000);
});

test('transfers move money without touching the budget; adjustments leave a difference', () => {
  let d = withAccounts(base());
  const remaining = E.result(d, month, today).remaining;
  d = E.transfer(d, 'bank', 'cash', 500, today);
  assert.equal(E.accountBalance(d, d.accounts[0]), 99_500);
  assert.equal(E.accountBalance(d, d.accounts[1]), 10_500);
  assert.equal(E.result(d, month, today).remaining, remaining);
  d = E.setBalance(d, 'bank', 98_000, today);
  assert.equal(E.accountBalance(d, d.accounts[0]), 98_000);
});

test('fund purchase uses saved money first and releases the leftover', () => {
  let d = { ...withAccounts(base()), funds: [{ id: 'shoes', name: 'Shoes', priceMinor: 10_000, deadline: '', color: 0, boughtOn: null, archived: false }] };
  d = E.fundMove(d, 'shoes', 5_000, false, today);
  assert.equal(E.fundSaved(d, 'shoes'), 5_000);
  d = E.buyFund(d, 'shoes', 8_000, 'bank', today);
  assert.equal(E.accountBalance(d, d.accounts[0]), 92_000);
  assert.equal(E.fundSaved(d, 'shoes'), 0);
  assert.throws(() => E.fundMove(d, 'shoes', 100, false, today));
});

test('goal deposits and withdrawals track saved money', () => {
  let d = { ...base(), goals: [{ id: 'trip', name: 'Trip', targetMinor: 500_000, deadline: '', color: 0, archived: false }] };
  d = E.goalMove(d, 'trip', 7_000, false, today);
  assert.equal(E.goalSaved(d, 'trip'), 7_000);
  assert.throws(() => E.goalMove(d, 'trip', 8_000, true, today), /Not enough saved/);
});

test('day plans persist through budget edits and reach the calculator', () => {
  const planned = E.setPlan(base(), E.addDays(today, 2), 5_000, today);
  const edited = E.configure(planned, { ...planned.settings, incomeMinor: 150_000 }, [], today);
  assert.deepEqual(edited.budgets.find((b) => b.month === month).plans, { [E.addDays(today, 2)]: 5_000 });
  assert.equal(E.result(edited, month, today).futureAllowances[E.addDays(today, 2)], 5_000);
  const cleared = E.setPlan(edited, E.addDays(today, 2), null, today);
  assert.deepEqual(cleared.budgets.find((b) => b.month === month).plans, {});
});

test('past days cannot be planned', () => {
  assert.throws(() => E.setPlan(base(), E.addDays(today, -1), 1_000, today), /today or a later day/);
});

test('habit weights follow the weekday you spend most on', () => {
  const start = E.addDays(today, -28);
  const data0 = E.configure(E.emptyData(), { nickname: 'Jin', incomeMinor: 120_000, incomeFrequency: 'MONTHLY', savingsMinor: 0, weights: Array(7).fill(1), weightMode: 'HABIT' }, [], today);
  const d = { ...data0, settings: { ...data0.settings, started: start } };
  const friday = (n) => { let x = E.addDays(start, n * 7); while (E.dow(x) !== 5) x = E.addDays(x, 1); return x; };
  const entries = [0, 1, 2, 3].map((i) => E.newEntry({ id: `f${i}`, date: friday(i), amountMinor: 4_000 }));
  entries.push(E.newEntry({ id: 'm', date: E.addDays(start, 0), amountMinor: 500 }));
  const weights = E.habitWeights({ ...d, entries }, today);
  assert.equal(Math.max(...weights), weights[4]);
  assert.ok(weights.every((w) => w >= 3 && w <= 30));
  assert.deepEqual(E.habitWeights(d, today), Array(7).fill(10));
});

test('backups round-trip and tolerate older files', () => {
  const d = E.setPlan(base(), E.addDays(today, 1), 2_000, today);
  const again = E.decodeBackup(JSON.stringify(d), today);
  assert.deepEqual(again.budgets, d.budgets);
  const old = JSON.parse(JSON.stringify(d));
  delete old.settings.weightMode; old.budgets.forEach((b) => delete b.plans);
  assert.equal(E.decodeBackup(JSON.stringify(old), today).settings.weightMode, 'EVEN');
  assert.throws(() => E.decodeBackup('{"version":2}', today));
});

test('csv protects against spreadsheet formulas', () => {
  const d = { ...withAccounts(base()) };
  const out = E.csv({ ...d, entries: [E.newEntry({ date: today, amountMinor: 100, note: '=SUM(A1)', accountId: 'bank' })] });
  assert.match(out, /"'=SUM\(A1\)"/);
});

test('money parsing rejects more than two decimals', () => {
  assert.equal(E.parseMoney('12.5'), 1250);
  assert.equal(E.parseMoney('1,200'), 120000);
  assert.throws(() => E.parseMoney('1.234'));
  assert.equal(E.cash(123456), 'RM 1,234.56');
  assert.equal(E.cash(-5), '-RM 0.05');
});

test('an overspend is paid back about RM 1 a day over the next days, and a purchase that fits needs no payback', () => {
  const settings = { nickname: '', incomeMinor: 30_000, incomeFrequency: 'MONTHLY', savingsMinor: 0, started: '2026-10-01', weights: Array(7).fill(1), weightMode: 'EVEN' };
  let data = E.ensureMonths({ ...E.emptyData(), settings, swaps: [] }, today); // no swaps: the plain RM 1 a day trim
  const allowance = E.result(data, month, today).todayAllowance;
  assert.equal(E.payback(data, 500, today), null); // fits inside today's allowance
  data = E.saveEntry(data, E.newEntry({ date: today, amountMinor: allowance, category: 'FOOD' }), today);
  const p = E.payback(data, 800, today);
  assert.equal(p.over, 800);
  assert.equal(p.days.length, 8);
  assert.ok(p.days.every((d) => d.cut === 100));
  assert.equal(p.short, 0);
  assert.equal(p.total, allowance + 800);
});

test('with swaps, an overspend is paid back by cheaper options first and the leftover is trimmed', () => {
  const settings = { nickname: '', incomeMinor: 30_000, incomeFrequency: 'MONTHLY', savingsMinor: 0, started: '2026-10-01', weights: Array(7).fill(1), weightMode: 'EVEN' };
  let data = E.ensureMonths({ ...E.emptyData(), settings }, today);
  const allowance = E.result(data, month, today).todayAllowance;
  data = E.saveEntry(data, E.newEntry({ date: today, amountMinor: allowance, category: 'FOOD' }), today);
  const p = E.payback(data, 800, today);
  assert.ok(p.days[0].swaps.length > 0, 'the first day gets a swap');
  assert.ok(p.days.every((d) => d.swaps.length <= 2));
  assert.equal(p.short, 0);
  assert.equal(p.days.reduce((t, d) => t + d.cut, 0), 800); // swaps plus trim cover exactly what doesn't fit
  assert.ok(p.days.every((d) => d.now === d.was - d.cut && d.now >= 0));
  const saved = E.addPayback(data, { id: 'p1', date: today, name: 'x', amountMinor: 800, days: p.days.map((d) => ({ date: d.date, cutMinor: d.cut, swaps: d.swaps.map((s) => ({ name: s.cheaperName, icon: s.icon, savingMinor: E.swapSaving(s) })) })) });
  assert.equal(E.decodeBackup(JSON.stringify(saved), today).budgets.find((b) => b.month === month).paybacks.length, 1);
  const old = JSON.parse(JSON.stringify(saved)); delete old.swaps; old.budgets.forEach((b) => delete b.paybacks);
  assert.ok(E.decodeBackup(JSON.stringify(old), today).swaps.length > 0, 'an older backup gets the default swaps');
});

test('what family pays never changes your allowance or what is left', () => {
  const settings = { nickname: '', incomeMinor: 30_000, incomeFrequency: 'MONTHLY', savingsMinor: 0, started: '2026-10-01', weights: Array(7).fill(1), weightMode: 'EVEN' };
  const data = E.ensureMonths({ ...E.emptyData(), settings }, today);
  const before = E.result(data, month, today);
  const after = E.result(E.saveEntry(data, E.newEntry({ date: today, amountMinor: 5_000, category: 'FOOD', family: true }), today), month, today);
  assert.deepEqual(after, before);
});

test('a Breakfast bill lines up with the breakfast swap and is priced against the bill, only when the swap is cheaper', () => {
  const settings = { nickname: '', incomeMinor: 100_000, incomeFrequency: 'MONTHLY', savingsMinor: 0, started: '2026-10-01', weights: Array(7).fill(1), weightMode: 'EVEN' };
  const build = (billMinor) => {
    let data = E.ensureMonths({ ...E.emptyData(), settings, bills: [{ id: 'b', name: 'Breakfast', amountMinor: billMinor, frequency: 'DAILY', family: false }] }, today);
    return E.saveEntry(data, E.newEntry({ date: today, amountMinor: E.result(data, month, today).todayAllowance, category: 'FOOD' }), today);
  };
  // RM 6 breakfast bill: the bread swap (RM 2) is offered first, saving RM 4 (not the generic RM 6).
  const dear = build(600);
  const first = E.payback(dear, 800, today).options[0].cands[0];
  assert.equal(first.cheaperName, 'Bread at home');
  assert.equal(first.fromBill, true);
  assert.equal(first.usualName, 'Breakfast');
  assert.equal(E.swapSaving(first), 400);
  // RM 1.50 breakfast bill: bread (RM 2) isn't cheaper than what you already pay, so it is not offered.
  const cheap = build(150);
  assert.ok(!E.payback(cheap, 800, today).options.some((o) => o.cands.some((c) => c.cheaperName === 'Bread at home')));
  // Previewing a swap never changes your data: no bill, plan or entry is touched.
  const before = JSON.stringify(dear);
  E.payback(dear, 800, today, { [E.payback(dear, 800, today).options[0].date]: [first.id] });
  assert.equal(JSON.stringify(dear), before);
  assert.equal(dear.bills[0].amountMinor, 600);
});

test('a fixed bill paid by family is never taken from your budget, even if an old copy of the month still counts it', () => {
  const settings = { nickname: '', incomeMinor: 100_000, incomeFrequency: 'MONTHLY', savingsMinor: 30_000, started: '2026-10-01', weights: Array(7).fill(1), weightMode: 'EVEN' };
  const bills = [{ id: 'rent', name: 'Rent', amountMinor: 90_000, frequency: 'MONTHLY', family: true }];
  let data = E.ensureMonths({ ...E.emptyData(), settings, bills }, today);
  assert.equal(data.budgets.find((b) => b.month === month).billsMinor, 0);
  assert.equal(E.familyBillsMinor(bills, month), 90_000);
  // an old saved copy that still has the bill counted gets corrected the next time the data loads
  data = { ...data, budgets: data.budgets.map((b) => ({ ...b, billsMinor: 90_000 })) };
  const healed = E.ensureMonths(data, today);
  assert.equal(healed.budgets.find((b) => b.month === month).billsMinor, 0);
  assert.equal(E.result(healed, month, today).spendable, 70_000);
});

test('a daily bill is not charged on red or teal days, and marks stay exactly as set', () => {
  const settings = { nickname: '', incomeMinor: 100_000, incomeFrequency: 'MONTHLY', savingsMinor: 30_000, started: '2026-10-01', weights: Array(7).fill(1), weightMode: 'EVEN' };
  const bills = [{ id: 'food', name: 'Food', amountMinor: 3_000, frequency: 'DAILY', family: false }];
  let data = E.ensureMonths({ ...E.emptyData(), settings, bills }, today); // 22 Oct
  const stored = () => data.budgets.find((b) => b.month === month);
  assert.equal(E.billsFor(data, stored(), today), 31 * 3_000); // nothing marked: every day is charged
  data = E.setMark(E.setPlan(data, '2026-10-25', 0, today), '2026-10-25', 'RED', today);
  data = E.setMark(E.setPlan(data, '2026-10-26', 2_300, today), '2026-10-26', 'TEAL', today); // 23 ringgit typed on a teal day: still teal
  data = E.setMark(E.setPlan(data, '2026-10-27', 2_300, today), '2026-10-27', 'YELLOW', today); // yellow: bills counted
  data = E.setMark(data, '2026-10-05', 'RED', today); // a day that has gone
  assert.equal(stored().marks['2026-10-26'], 'TEAL');
  assert.equal(E.billsFor(data, stored(), today), 28 * 3_000); // red, teal and the past red are not charged; yellow is
  assert.equal(E.result(data, month, today).spendable, 100_000 - 28 * 3_000 - 30_000);
  data = E.setMark(data, '2026-10-05', null, today);
  assert.equal(E.billsFor(data, stored(), today), 29 * 3_000);
  assert.throws(() => E.setMark(data, '2026-10-05', 'BLUE', today));
  assert.equal(E.decodeBackup(JSON.stringify(data), today).budgets.find((b) => b.month === month).marks['2026-10-27'], 'YELLOW');
});

test('the swaps you pick replace the automatic ones, and the rest is shared out again', () => {
  const settings = { nickname: '', incomeMinor: 100_000, incomeFrequency: 'MONTHLY', savingsMinor: 0, started: '2026-10-01', weights: Array(7).fill(1), weightMode: 'EVEN' };
  let data = E.ensureMonths({ ...E.emptyData(), settings, bills: [{ id: 'f', name: 'Food', amountMinor: 1_000, frequency: 'DAILY', family: false }] }, today);
  const allowance = E.result(data, month, today).todayAllowance;
  data = E.saveEntry(data, E.newEntry({ date: today, amountMinor: allowance, category: 'FOOD' }), today);
  const auto = E.payback(data, 800, today);
  assert.equal(auto.options.length, 5);
  assert.ok(auto.options[0].cands.length > 0 && auto.options[0].cands.every((s) => s.category === 'FOOD' || s.category === 'TRANSPORT'));
  assert.equal(auto.options[0].cands[0].category, 'FOOD', 'a Food bill puts the food swaps first');
  const bread = auto.options[0].cands[0];
  // pick the one swap on the third day only: that day gives up its saving, the rest is trimmed over other days
  const day3 = auto.options[2].date;
  const picked = E.payback(data, 800, today, { [day3]: [bread.id] });
  const on3 = picked.days.find((d) => d.date === day3);
  assert.deepEqual(on3.swaps.map((s) => s.id), [bread.id]);
  assert.equal(picked.days.reduce((t, d) => t + d.cut, 0), Math.max(800, E.swapSaving(bread))); // swap plus trim cover what doesn't fit (a bigger swap simply gives back more)
  assert.equal(picked.short, 0);
  // picking nothing at all falls back on trimming only
  const none = E.payback(data, 800, today, {});
  assert.ok(none.days.every((d) => d.swaps.length === 0) && none.days.reduce((t, d) => t + d.cut, 0) === 800);
});
