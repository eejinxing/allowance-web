// Budget engine: a line-for-line port of the Android app's LedgerEngine + BudgetCalculator.
// Money is an integer number of sen (RM 1.00 = 100). Dates are ISO "YYYY-MM-DD" strings and all
// date maths runs in UTC, so a phone's time zone can never shift a day. Every function returns new
// data and never mutates its input, exactly like the Kotlin version.

export const CATEGORIES = ['FOOD', 'TRANSPORT', 'SHOPPING', 'FUN', 'LIVING', 'HEALTH', 'OTHER'];
const SPEND_TYPES = ['EXPENSE', 'BILL_PAYMENT', 'FUND_PURCHASE'];
const EDITABLE_TYPES = ['EXPENSE', 'INCOME', 'SCHEDULED_INCOME', 'BILL_PAYMENT'];
const MAX = 100_000_000_000;
export const HABIT_WEEKS = 8;
/** How a day is marked on the calendar. RED: nothing spent. TEAL: only the amount you spent, daily bills not counted. YELLOW: daily bills counted, plus what you spent. */
export const MARKS = ['RED', 'TEAL', 'YELLOW'];

export function require(condition, message = 'Something doesn’t look right. Check what you entered') {
  if (!condition) throw new Error(message);
}

// ---------- dates ----------
const DAY = 86_400_000;
const pad = (n) => String(n).padStart(2, '0');
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toISO = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (s, n) => toISO(parseISO(s) + n * DAY);
export const dow = (s) => { const d = new Date(parseISO(s)).getUTCDay(); return d === 0 ? 7 : d; }; // Monday = 1
export const monthOf = (s) => s.slice(0, 7);
export const daysInMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const endOfMonth = (ym) => `${ym}-${pad(daysInMonth(ym))}`;
export const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`; };
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / DAY);
export const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(parseISO(s)) === s;
export function todayISO(now = new Date()) { return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; }
function range(start, end) { const out = []; for (let d = start; d <= end; d = addDays(d, 1)) out.push(d); return out; }

export function id() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------- money ----------
const sum = (values) => values.reduce((a, b) => a + b, 0);
function scaled(amount, numerator, denominator) { // HALF_UP, away from zero, in exact integer maths
  const n = amount * numerator;
  const r = n % denominator;
  let q = (n - r) / denominator;
  if (Math.abs(r) * 2 >= denominator) q += Math.sign(n);
  return q;
}
export function parseMoney(text) {
  const t = String(text).trim().replace(/,/g, '');
  require(/^-?\d+(\.\d{1,2})?$/.test(t), 'Enter a valid amount with at most two decimals');
  const negative = t.startsWith('-');
  const [whole, frac = ''] = t.replace('-', '').split('.');
  const minor = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return negative ? -minor : minor;
}
export function positive(text) {
  const m = parseMoney(text);
  require(m > 0, 'Amount must be greater than zero');
  require(m <= MAX, 'Amount is out of range');
  return m;
}
export function zeroOrPositive(text) {
  const m = parseMoney(String(text).trim() === '' ? '0' : text);
  require(m >= 0, 'Amount can’t be negative');
  return m;
}
export const decimal = (minor) => { const n = Math.abs(minor); return (minor < 0 ? '-' : '') + Math.floor(n / 100) + '.' + pad(n % 100); };
export function cash(minor) {
  const n = Math.abs(minor);
  return (minor < 0 ? '-' : '') + 'RM ' + Math.floor(n / 100).toLocaleString('en-US') + '.' + pad(n % 100);
}

// ---------- budgets ----------
export function periodAmount(amount, frequency, days) {
  if (frequency === 'DAILY') return amount * days;
  if (frequency === 'WEEKLY') return scaled(amount, days, 7);
  if (frequency === 'MONTHLY') return amount;
  throw new Error('Invalid income or bill frequency');
}

/** Setup lets people enter a yearly income. The engine and backups only know daily, weekly and monthly, so it is stored as a month's share. */
export const monthlyFromYearly = (minor) => Math.max(1, Math.round(minor / 12));

/** The first day your budget covers: the 1st of the month you set it up in, so earlier days that month can still be logged. */
export const budgetFrom = (settings) => `${monthOf(settings.started)}-01`;

/** A month's budget always covers the whole month, even the month you started in. */
export function makeBudget(settings, bills, month) {
  const start = `${month}-01`;
  const dim = daysInMonth(month);
  const activeDays = dim;
  const income = settings.incomeFrequency === 'MONTHLY'
    ? scaled(settings.incomeMinor, activeDays, dim)
    : periodAmount(settings.incomeMinor, settings.incomeFrequency, activeDays);
  // Monthly bills are reserved in full.
  const fixed = sum(bills.filter((b) => !b.family).map((b) => periodAmount(b.amountMinor, b.frequency, activeDays)));
  return { month, startDate: start, incomeMinor: income, billsMinor: fixed,
    savingsMinor: scaled(settings.savingsMinor, activeDays, dim), weights: [...settings.weights], plans: {}, paybacks: [], marks: {} };
}

/** What family pays towards your fixed bills in a month. It is shown, but never taken from your budget. */
export const familyBillsMinor = (bills, month) => sum(bills.filter((b) => b.family).map((b) => periodAmount(b.amountMinor, b.frequency, daysInMonth(month))));

export function ensureMonths(data, today) {
  const settings = data.settings;
  if (!settings) return data;
  let month = monthOf(settings.started);
  const end = monthOf(today);
  const budgets = [...data.budgets];
  while (month <= end) {
    if (!budgets.some((b) => b.month === month)) budgets.push(makeBudget(settings, data.bills, month));
    month = addMonths(month, 1);
  }
  // This month and the coming ones always follow your current income, bills (family-paid ones excluded) and savings, so a stale copy can't linger.
  // Past months keep what they had. Plans and paybacks are kept.
  const now = monthOf(today);
  const fixed = budgets.map((b) => (b.month >= now ? { ...makeBudget(settings, data.bills, b.month), weights: b.weights, plans: b.plans || {}, paybacks: b.paybacks || [], marks: b.marks || {} } : b));
  return { ...data, budgets: fixed.sort((a, b) => (a.month < b.month ? -1 : 1)) };
}

/**
 * Days of a month on which a daily bill is not charged: the days marked red or teal. (A day with only a plan, from the old Plan a day
 * sheet, counts the same way: a plan of 0 as red, any other plan as teal.) Only this month and later months count; a month that is over keeps its bills.
 */
export function noSpendDays(data, month, today) {
  if (month < monthOf(today)) return 0;
  const budget = data.budgets.find((b) => b.month === month);
  const plans = budget?.plans || {}; const marks = budget?.marks || {};
  const from = budgetFrom(data.settings); let n = 0;
  for (let d = `${month}-01`; monthOf(d) === month; d = addDays(d, 1)) {
    if (d < from) continue;
    const mark = marks[d] ?? (d in plans ? (plans[d] === 0 ? 'RED' : 'TEAL') : null);
    if (mark === 'RED' || mark === 'TEAL') n++;
  }
  return n;
}
/** What you pay per day in daily bills (family-paid ones excluded). */
export const dailyBillsMinor = (bills) => sum(bills.filter((b) => !b.family && b.frequency === 'DAILY').map((b) => b.amountMinor));
/** This month's fixed bills with daily ones charged only on days that aren't no-spend days. */
export function billsFor(data, budget, today) {
  return Math.max(0, budget.billsMinor - dailyBillsMinor(data.bills) * noSpendDays(data, budget.month, today));
}

export function configure(data, settings, bills, today) {
  const started = data.settings?.started ?? today;
  const next = { ...settings, started };
  const month = monthOf(today);
  const old = data.budgets.find((b) => b.month === month);
  const rebuilt = { ...makeBudget(next, bills, month), plans: old?.plans ?? {}, paybacks: old?.paybacks ?? [], marks: old?.marks ?? {} };
  const out = ensureMonths({ ...data, settings: next, bills, budgets: [...data.budgets.filter((b) => b.month !== month), rebuilt] }, today);
  validate(out);
  return out;
}

// ---------- cheaper swaps ----------
/** A cheaper way to do something you already do, e.g. the bus instead of the train. Not tied to a month: one list for the whole app. */
export const swapSaving = (s) => s.usualMinor - s.cheaperMinor;
export const defaultSwaps = () => [
  { id: 'seed-train-bus', category: 'TRANSPORT', icon: '🚌', usualName: 'Train', usualMinor: 1000, cheaperName: 'Bus', cheaperMinor: 350 },
  { id: 'seed-ride-train', category: 'TRANSPORT', icon: '🚆', usualName: 'Grab ride', usualMinor: 1500, cheaperName: 'Train', cheaperMinor: 500 },
  { id: 'seed-breakfast-bread', category: 'FOOD', icon: '🍞', usualName: 'Café breakfast', usualMinor: 800, cheaperName: 'Bread at home', cheaperMinor: 200 },
  { id: 'seed-lunch-pack', category: 'FOOD', icon: '🍱', usualName: 'Lunch out', usualMinor: 1200, cheaperName: 'Packed lunch', cheaperMinor: 500 },
  { id: 'seed-tea-water', category: 'FOOD', icon: '💧', usualName: 'Bubble tea', usualMinor: 900, cheaperName: 'Water from home', cheaperMinor: 0 },
  { id: 'seed-coffee-home', category: 'FOOD', icon: '☕', usualName: 'Café coffee', usualMinor: 1000, cheaperName: 'Coffee at home', cheaperMinor: 200 },
];

// ---------- the daily allowance ----------
function allocate(pool, weights) { // largest remainder: every sen is assigned, including negative pools
  const dates = Object.keys(weights);
  const total = dates.reduce((s, d) => s + BigInt(weights[d]), 0n);
  const zeros = Object.fromEntries(dates.map((d) => [d, 0]));
  if (total === 0n) return zeros;
  const magnitude = BigInt(Math.abs(pool));
  const shares = dates.map((d) => { const prod = magnitude * BigInt(weights[d]); return { d, whole: prod / total, rem: prod % total }; });
  const remainderCount = Number(magnitude - shares.reduce((s, x) => s + x.whole, 0n));
  const bonus = new Set([...shares].sort((a, b) => (a.rem === b.rem ? (a.d < b.d ? -1 : 1) : a.rem > b.rem ? -1 : 1)).slice(0, remainderCount).map((x) => x.d));
  const out = {};
  for (const { d, whole } of shares) { const v = Number(whole) + (bonus.has(d) ? 1 : 0); out[d] = pool < 0 ? -v : v; }
  return out;
}

/** Planned dates get exactly their plan; the rest spreads over other dates by weekday weight. */
function distribute(budget, pool, dates) {
  const plans = budget.plans || {};
  const planned = {}; const free = {};
  for (const d of dates) { if (d in plans) planned[d] = plans[d]; else free[d] = budget.weights[dow(d) - 1]; }
  const planTotal = sum(Object.values(planned));
  const freeTotal = sum(Object.values(free));
  const zero = (obj) => Object.fromEntries(Object.keys(obj).map((k) => [k, 0]));
  let shares;
  if (pool >= planTotal && freeTotal > 0) shares = { ...planned, ...allocate(pool - planTotal, free) };
  else if (planTotal > 0) shares = { ...allocate(pool, planned), ...zero(free) };
  else if (freeTotal > 0) shares = { ...allocate(pool, free), ...zero(planned) };
  else shares = zero({ ...planned, ...free });
  return Object.fromEntries(dates.map((d) => [d, shares[d] ?? 0]));
}

export function toTransactions(entries) {
  return entries.flatMap((e) => {
    const base = { date: e.date, amount: e.amountMinor };
    switch (e.type) {
      case 'EXPENSE': return [{ ...base, kind: 'EXPENSE', self: !e.family }];
      case 'BILL_PAYMENT': return [{ ...base, kind: 'BILL', self: true }];
      case 'FUND_ALLOCATION': return [{ ...base, kind: 'FUND', self: true }];
      case 'FUND_PURCHASE': return e.amountMinor > e.reservedMinor ? [{ date: e.date, amount: e.amountMinor - e.reservedMinor, kind: 'EXPENSE', self: true }] : [];
      case 'FUND_RELEASE': case 'INCOME': return [{ ...base, kind: 'INCOME' }];
      default: return [];
    }
  });
}

export function calculate(budget, transactions, today) {
  const monthEnd = endOfMonth(budget.month);
  const entries = transactions.filter((t) => t.date >= budget.startDate && t.date <= today);
  const extra = sum(entries.filter((t) => t.kind === 'INCOME').map((t) => t.amount));
  const expenses = entries.filter((t) => (t.kind === 'EXPENSE' || t.kind === 'FUND') && t.self);
  const before = sum(expenses.filter((t) => t.date < today).map((t) => t.amount));
  const spentToday = sum(expenses.filter((t) => t.date === today).map((t) => t.amount));
  const spendable = budget.incomeMinor + extra - budget.billsMinor - budget.savingsMinor;
  const pool = spendable - before;
  const dates = range(today, monthEnd);
  const daily = distribute(budget, pool, dates)[today];
  // Today's unspent (or overspent) money rolls into the next days.
  const future = distribute(budget, pool - spentToday, dates.slice(1));
  const unallocated = pool - spentToday - sum(Object.values(future));
  // What each day gets of what is left, without counting today's unspent share twice.
  const dayShares = { [today]: daily, ...distribute(budget, pool - Math.max(daily, spentToday), dates.slice(1)) };
  return { spendable, spentBeforeToday: before, spentToday, remaining: pool - spentToday, todayAllowance: daily,
    todayRemaining: daily - spentToday, futureAllowances: future, unallocated, dayShares };
}

export function result(data, month, today) {
  const settings = data.settings;
  const stored = data.budgets.find((b) => b.month === month) ?? makeBudget(settings, data.bills, month);
  const current = month === monthOf(today);
  // The current month follows the chosen mode; Evenly means truly even, whatever older weights were saved.
  const weights = !current ? stored.weights : settings.weightMode === 'HABIT' ? habitWeights(data, today) : [1, 1, 1, 1, 1, 1, 1];
  const budget = { ...stored, weights, billsMinor: billsFor(data, stored, today) };
  let date = current ? today : endOfMonth(month);
  if (date < budget.startDate) date = budget.startDate;
  return calculate(budget, toTransactions(data.entries), date);
}

// ---------- habits and plans ----------
export function weekdayAverages(data, today) {
  const started = data.settings ? budgetFrom(data.settings) : today;
  const from = addDays(today, -7 * HABIT_WEEKS);
  const start = from > started ? from : started;
  const days = range(start, addDays(today, -1));
  const spent = {};
  for (const e of data.entries) if (!e.family && SPEND_TYPES.includes(e.type)) spent[e.date] = (spent[e.date] ?? 0) + e.amountMinor;
  return [1, 2, 3, 4, 5, 6, 7].map((wd) => {
    const match = days.filter((d) => dow(d) === wd);
    return match.length === 0 ? 0 : Math.trunc(sum(match.map((d) => spent[d] ?? 0)) / match.length);
  });
}

export function habitWeights(data, today) {
  const avg = weekdayAverages(data, today);
  const mean = sum(avg) / 7;
  if (mean <= 0) return Array(7).fill(10);
  return avg.map((a) => Math.min(30, Math.max(3, Math.round((a / mean) * 10))));
}

/** What a day today or later would get if it had no plan of its own: the amount offered when a no-spend day becomes a spend limit. */
export function suggestedFor(data, date, today) {
  const month = monthOf(date);
  const strip = (b) => (b.month === month ? { ...b, plans: Object.fromEntries(Object.entries(b.plans || {}).filter(([d]) => d !== date)) } : b);
  const free = { ...data, budgets: data.budgets.map(strip) };
  if (month === monthOf(today)) return result(free, month, today).dayShares[date] ?? 0;
  // A later month starts fresh, so look at it from its first day.
  const stored = free.budgets.find((b) => b.month === month) ?? makeBudget(data.settings, data.bills, month);
  const weights = data.settings.weightMode === 'HABIT' ? habitWeights(data, today) : [1, 1, 1, 1, 1, 1, 1];
  return calculate({ ...stored, weights, billsMinor: billsFor(data, stored, today) }, toTransactions(data.entries), `${month}-01`).dayShares[date] ?? 0;
}

/**
 * A day's own budget: what it gets with no plan of its own. For today and later that is the suggestion; for a day already
 * gone it is what that day was allowed, given everything spent before it.
 */
export function allowanceOn(data, date, today) {
  if (date >= today) return suggestedFor(data, date, today);
  const month = monthOf(date);
  const stored = data.budgets.find((b) => b.month === month) ?? makeBudget(data.settings, data.bills, month);
  const weights = month !== monthOf(today) ? stored.weights : data.settings.weightMode === 'HABIT' ? habitWeights(data, today) : [1, 1, 1, 1, 1, 1, 1];
  return calculate({ ...stored, weights, billsMinor: billsFor(data, stored, today) }, toTransactions(data.entries), date < stored.startDate ? stored.startDate : date).todayAllowance;
}

/** Spreads `rest` evenly over `days`, each taking at most its `room`; a day that runs out drops out and the others cover it. */
function spread(rest, days, room) {
  const cuts = Object.fromEntries(days.map((d) => [d, 0]));
  let open = days.filter((d) => room[d] > 0);
  while (rest > 0 && open.length) {
    const share = Math.floor(rest / open.length); let extra = rest - share * open.length;
    for (const d of open) {
      const give = Math.min(share + (extra > 0 ? 1 : 0), room[d] - cuts[d]); if (extra > 0) extra--;
      cuts[d] += give; rest -= give;
    }
    open = open.filter((d) => cuts[d] < room[d]);
  }
  return { cuts, rest };
}

/** Which category a name sounds like (a bill called Food, a swap called Bus). Used to line swaps up with the bills they could replace. */
export const guessCategory = (text) => (/\b(bus|train|mrt|lrt|grab|ride|taxi|cab|car|bike|petrol|parking|toll|ferry|flight|transport)\b/i.test(text) ? 'TRANSPORT'
  : /\b(shirt|shoe|shoes|clothes|bag|shop|shopee|lazada|mall|shopping)\b/i.test(text) ? 'SHOPPING'
  : /\b(movie|cinema|game|games|karaoke|bowling|concert|netflix|spotify|fun)\b/i.test(text) ? 'FUN' : 'FOOD');

const SWAP_STOP = new Set(['out', 'the', 'and', 'for', 'home', 'from', 'with', 'instead']);
const nameWords = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !SWAP_STOP.has(w));
/** What a bill costs per day, to set against a cheaper option: a daily bill as it is, a weekly one ÷ 7, a monthly one spread over the month. */
export const billPerDay = (bill, month) => (bill.frequency === 'DAILY' ? bill.amountMinor : bill.frequency === 'WEEKLY' ? Math.round(bill.amountMinor / 7) : Math.round(bill.amountMinor / daysInMonth(month)));
/**
 * A swap as it applies to your fixed bills: a Breakfast bill lines up with the breakfast swap and is priced against what that bill really costs.
 * Returns the swap with the bill's name and price as "usual" (so its saving is bill minus cheaper), the swap itself when no bill is like it,
 * and null when a bill is like it but the cheaper option isn't actually cheaper than the bill.
 */
export function swapForBills(swap, bills, month) {
  const words = nameWords(swap.usualName);
  const hits = bills.filter((b) => !b.family && nameWords(b.name).some((w) => words.includes(w)));
  if (!hits.length) return swap;
  const best = hits.map((b) => ({ b, price: billPerDay(b, month) })).filter((h) => h.price > swap.cheaperMinor).sort((a, c) => c.price - a.price)[0];
  return best ? { ...swap, usualName: best.b.name, usualMinor: best.price, fromBill: true } : null;
}

/**
 * Buying `amount` more today than today allows: a gentle way to pay the overspend back over the next days. Null when it fits today.
 * Swaps come first: the cheaper options you keep (the bus for the train), lined up with your fixed bills and the categories you spend most on,
 * up to two a day and never two from the same category. What is left is trimmed evenly, about RM 1 a day. With no swap that fits, it is only that trim.
 * `pick` ({ date: [swap ids] }) replaces the automatic choice with the swaps you tapped. Days that already have a plan are left alone, and no day gives up more than it has.
 * `options` are the next five days with the swaps that could go on each, so the chart can offer them.
 */
export function payback(data, amount, today, pick) {
  const month = monthOf(today);
  const r = result(data, month, today);
  const over = amount - Math.max(r.todayRemaining, 0);
  if (over <= 0) return null;
  const plans = data.budgets.find((b) => b.month === month)?.plans || {};
  const was = (d) => Math.max(r.dayShares[d] ?? 0, 0);
  const usable = Object.keys(r.futureAllowances).sort().filter((d) => !(d in plans) && was(d) > 0);

  // Swaps for the kinds of bills you have come first, then the categories you spend most on.
  const since = addDays(today, -7 * HABIT_WEEKS); const byCat = {};
  for (const e of data.entries) if (!e.family && SPEND_TYPES.includes(e.type) && e.date >= since) byCat[e.category] = (byCat[e.category] ?? 0) + e.amountMinor;
  const billCats = new Set((data.bills || []).filter((b) => !b.family).map((b) => guessCategory(b.name)));
  // A swap that matches one of your bills (breakfast → breakfast) goes first and is priced against that bill; only if it is really cheaper.
  const pool = (data.swaps || []).map((s) => swapForBills(s, data.bills || [], month)).filter((s) => s && swapSaving(s) > 0)
    .sort((a, b) => (Boolean(b.fromBill) - Boolean(a.fromBill)) || (billCats.has(b.category) - billCats.has(a.category)) || (byCat[b.category] ?? 0) - (byCat[a.category] ?? 0) || swapSaving(b) - swapSaving(a));
  const byId = Object.fromEntries(pool.map((s) => [s.id, s]));

  const swapsOn = {}; let rest = over;
  if (pick) {
    for (const date of usable) {
      let room = was(date); const got = [];
      for (const id of pick[date] || []) {
        const s = byId[id]; if (!s) continue;
        if (swapSaving(s) <= room && !got.some((g) => g.category === s.category)) { got.push(s); room -= swapSaving(s); }
      }
      if (got.length) { swapsOn[date] = got; rest -= got.reduce((t, s) => t + swapSaving(s), 0); }
    }
    rest = Math.max(rest, 0);
  } else {
    for (const date of usable) {
      if (rest <= 0) break;
      let room = was(date); const got = [];
      for (const s of pool) {
        const save = swapSaving(s);
        if (got.length < 2 && save <= rest && save <= room && !got.some((g) => g.category === s.category)) { got.push(s); rest -= save; room -= save; }
      }
      if (!got.length) break; // nothing fits any more; what is left is trimmed below
      swapsOn[date] = got;
    }
  }
  const swapDays = Object.keys(swapsOn).length;
  const swapSpan = Math.max(0, ...Object.keys(swapsOn).map((d) => usable.indexOf(d) + 1));
  const saved = (date) => (swapsOn[date] || []).reduce((t, s) => t + swapSaving(s), 0);
  // The leftover goes evenly over the swap days plus enough following days to keep it to about RM 1 each (3 to 14 days when there are no swaps).
  const span = Math.min(usable.length, 14, Math.max(swapSpan, rest > 0 ? Math.max(swapDays ? 1 : 3, Math.ceil(rest / 100)) : 0));
  const days = usable.slice(0, span);
  const trim = spread(rest, days, Object.fromEntries(days.map((d) => [d, was(d) - saved(d)])));
  const out = days.map((date) => {
    const cut = saved(date) + trim.cuts[date];
    return { date, was: was(date), swaps: swapsOn[date] || [], trim: trim.cuts[date], cut, now: was(date) - cut };
  }).filter((c) => c.cut > 0);
  const cands = []; for (const s of pool) if (cands.length < 2 && !cands.some((c) => c.category === s.category)) cands.push(s);
  const options = usable.slice(0, 5).map((date) => {
    const o = out.find((c) => c.date === date); const cut = o?.cut ?? 0;
    return { date, was: was(date), cut, now: was(date) - cut, swaps: swapsOn[date] || [], cands: cands.map((s) => ({ ...s, fits: swapSaving(s) <= was(date) })) };
  });
  return { over, usual: Math.max(r.todayAllowance, 0), total: r.spentToday + amount, days: out, options, covered: over - trim.rest, short: trim.rest };
}

/** Remembers a payback in the month it was made, so the swaps can be shown again on those days later. */
export function addPayback(data, record) {
  const month = monthOf(record.date);
  const budget = data.budgets.find((b) => b.month === month);
  if (!budget) return data;
  return { ...data, budgets: data.budgets.map((b) => (b === budget ? { ...b, paybacks: [...(b.paybacks || []), record] } : b)) };
}

/** Sets or clears a day's mark (RED, TEAL or YELLOW). The amount for the day is separate: a plan for coming days, spending you logged for past ones. */
export function setMark(data, date, mark, today) {
  require(mark === null || MARKS.includes(mark), 'Unknown mark');
  const month = monthOf(date);
  const ensured = ensureMonths(data, date > today ? date : today);
  const budget = ensured.budgets.find((b) => b.month === month) ?? makeBudget(ensured.settings, ensured.bills, month);
  const marks = { ...(budget.marks || {}) };
  if (mark === null) delete marks[date]; else marks[date] = mark;
  const out = { ...ensured, budgets: [...ensured.budgets.filter((b) => b.month !== month), { ...budget, marks }] };
  validate(out);
  return out;
}

export function setPlan(data, date, minor, today) {
  require(date >= today, 'You can only plan today or a later day');
  require(minor === null || (minor >= 0 && minor <= MAX), 'Enter an amount of zero or more');
  const month = monthOf(date);
  const ensured = ensureMonths(data, date > today ? date : today);
  const budget = ensured.budgets.find((b) => b.month === month) ?? makeBudget(ensured.settings, ensured.bills, month);
  const plans = { ...(budget.plans || {}) };
  if (minor === null) delete plans[date]; else plans[date] = minor;
  const out = { ...ensured, budgets: [...ensured.budgets.filter((b) => b.month !== month), { ...budget, plans }] };
  validate(out);
  return out;
}

// ---------- balances ----------
export function accountBalance(data, account) {
  return data.entries.reduce((balance, e) => {
    let delta = 0;
    if (e.type === 'TRANSFER' && e.toAccountId === account.id) delta = e.amountMinor;
    else if (e.accountId !== account.id) delta = 0;
    else if (['INCOME', 'SCHEDULED_INCOME', 'ADJUSTMENT'].includes(e.type)) delta = e.amountMinor;
    else if (e.type === 'EXPENSE' && !e.family) delta = -e.amountMinor;
    else if (['BILL_PAYMENT', 'TRANSFER', 'FUND_PURCHASE'].includes(e.type)) delta = -e.amountMinor;
    return balance + delta;
  }, account.openingMinor);
}

export function fundSaved(data, fundId) {
  return sum(data.entries.filter((e) => e.targetId === fundId).map((e) =>
    e.type === 'FUND_ALLOCATION' ? e.amountMinor : e.type === 'FUND_RELEASE' ? -e.amountMinor : e.type === 'FUND_PURCHASE' ? -e.reservedMinor : 0));
}

export function goalSaved(data, goalId) {
  return sum(data.entries.filter((e) => e.targetId === goalId).map((e) =>
    e.type === 'GOAL_DEPOSIT' ? e.amountMinor : e.type === 'GOAL_WITHDRAWAL' ? -e.amountMinor : 0));
}

// ---------- entries ----------
export function newEntry(fields) {
  return { id: id(), date: '', amountMinor: 0, type: 'EXPENSE', category: 'FOOD', note: '', accountId: null, toAccountId: null,
    family: false, targetId: null, reservedMinor: 0, createdAt: Date.now(), ...fields };
}

export function saveEntry(data, entry, today) {
  require(EDITABLE_TYPES.includes(entry.type));
  require(entry.amountMinor > 0, 'Enter an amount greater than zero');
  require(entry.date <= today, 'You can’t record a future transaction');
  require(entry.date >= budgetFrom(data.settings), 'That date is before your budget started');
  const previous = data.entries.find((e) => e.id === entry.id);
  require(!previous || EDITABLE_TYPES.includes(previous.type));
  const saved = entry.type === 'BILL_PAYMENT' ? { ...entry, category: 'LIVING' } : entry;
  const out = { ...data, entries: [...data.entries.filter((e) => e.id !== saved.id), saved] };
  validate(out);
  return out;
}

export function deleteEntry(data, entryId) {
  const entry = data.entries.find((e) => e.id === entryId);
  require(entry.type !== 'FUND_RELEASE' || !data.funds.some((f) => f.id === entry.targetId && f.boughtOn), 'Delete this fund’s purchase entry before changing its leftover');
  let next = { ...data, entries: data.entries.filter((e) => e.id !== entryId),
    funds: data.funds.map((f) => (entry.type === 'FUND_PURCHASE' && f.id === entry.targetId ? { ...f, boughtOn: null } : f)) };
  next = { ...next, funds: next.funds.map((f) => (f.archived && !f.boughtOn && fundSaved(next, f.id) > 0 ? { ...f, archived: false } : f)) };
  validate(next);
  return next;
}

export function transfer(data, from, to, amount, date) {
  require(from && to && from !== to, 'Choose two different accounts');
  require(amount > 0, 'Enter an amount greater than zero');
  require(data.accounts.some((a) => a.id === from && !a.archived) && data.accounts.some((a) => a.id === to && !a.archived));
  const out = { ...data, entries: [...data.entries, newEntry({ date, amountMinor: amount, type: 'TRANSFER', note: 'Account transfer', accountId: from, toAccountId: to })] };
  validate(out);
  return out;
}

export function setBalance(data, accountId, balance, date) {
  const account = data.accounts.find((a) => a.id === accountId);
  const delta = balance - accountBalance(data, account);
  if (delta === 0) return data;
  const out = { ...data, entries: [...data.entries, newEntry({ date, amountMinor: delta, type: 'ADJUSTMENT', note: 'Balance adjustment', accountId })] };
  validate(out);
  return out;
}

export function fundMove(data, fundId, amount, release, date) {
  const fund = data.funds.find((f) => f.id === fundId);
  require(!fund.archived && !fund.boughtOn);
  require(amount > 0, 'Enter an amount greater than zero');
  require(!release || fundSaved(data, fundId) >= amount, 'Not enough in this fund');
  const out = { ...data, entries: [...data.entries, newEntry({ date, amountMinor: amount, type: release ? 'FUND_RELEASE' : 'FUND_ALLOCATION',
    note: (release ? 'Released: ' : 'Set aside: ') + fund.name, targetId: fundId })] };
  validate(out);
  return out;
}

export function buyFund(data, fundId, amount, accountId, date) {
  const fund = data.funds.find((f) => f.id === fundId);
  require(!fund.archived && !fund.boughtOn);
  require(amount > 0, 'Enter an amount greater than zero');
  const saved = fundSaved(data, fundId);
  const used = Math.min(saved, amount);
  let entries = [...data.entries, newEntry({ date, amountMinor: amount, type: 'FUND_PURCHASE', category: 'SHOPPING', note: fund.name, accountId, targetId: fundId, reservedMinor: used })];
  // The leftover release can be removed only after the purchase is removed.
  if (saved > amount) entries = [...entries, newEntry({ date, amountMinor: saved - amount, type: 'FUND_RELEASE', note: `Leftover from ${fund.name}`, targetId: fundId })];
  const out = { ...data, entries, funds: data.funds.map((f) => (f.id === fundId ? { ...f, boughtOn: date } : f)) };
  validate(out);
  return out;
}

export function archiveFund(data, fundId, date) {
  const saved = fundSaved(data, fundId);
  const released = saved > 0 ? fundMove(data, fundId, saved, true, date) : data;
  return { ...released, funds: released.funds.map((f) => (f.id === fundId ? { ...f, archived: true } : f)) };
}

export function goalMove(data, goalId, amount, withdraw, date) {
  require(data.goals.some((g) => g.id === goalId && !g.archived));
  require(amount > 0, 'Enter an amount greater than zero');
  require(!withdraw || goalSaved(data, goalId) >= amount, 'Not enough saved in this goal');
  const out = { ...data, entries: [...data.entries, newEntry({ date, amountMinor: amount, type: withdraw ? 'GOAL_WITHDRAWAL' : 'GOAL_DEPOSIT',
    note: withdraw ? 'Taken from goal' : 'Saved to goal', targetId: goalId })] };
  validate(out);
  return out;
}

export function csv(data) {
  const cell = (value, protect) => {
    // Quoted CSV is still interpreted as a formula by spreadsheet software.
    const safe = protect && ['=', '+', '-', '@', '\t', '\r'].includes(value.trimStart()[0]) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const name = (id) => data.accounts.find((a) => a.id === id)?.name ?? '';
  const rows = [...data.entries].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1)).map((e) =>
    [e.date, e.type, decimal(e.amountMinor), 'MYR', e.category, e.note, name(e.accountId), name(e.toAccountId), String(e.family)]
      .map((v, i) => cell(v, i !== 2)).join(','));
  return '﻿date,type,amount,currency,category,note,account,to_account,family_paid\r\n' + rows.join('\r\n');
}

// ---------- backups ----------
export const emptyData = () => ({ version: 1, settings: null, bills: [], accounts: [], entries: [], goals: [], funds: [], wishes: [], budgets: [], swaps: defaultSwaps() });

/** Accepts data written by this app or by the Android app, filling in fields older files lack. */
export function normalize(raw) {
  require(raw && typeof raw === 'object' && raw.version === 1, 'This backup version isn’t supported');
  const d = { ...emptyData(), ...raw };
  for (const key of ['bills', 'accounts', 'entries', 'goals', 'funds', 'wishes', 'budgets', 'swaps']) require(Array.isArray(d[key]));
  if (d.settings) d.settings = { nickname: '', incomeFrequency: 'MONTHLY', savingsMinor: 0, weights: Array(7).fill(1), weightMode: 'EVEN', ...d.settings };
  d.budgets = d.budgets.map((b) => ({ plans: {}, paybacks: [], marks: {}, ...b }));
  d.entries = d.entries.map((e) => ({ category: 'FOOD', note: '', accountId: null, toAccountId: null, family: false, targetId: null, reservedMinor: 0, createdAt: 0, ...e }));
  return d;
}

export function decodeBackup(text, today) {
  require(text.length <= 10_000_000, 'Backup is larger than 10 MB');
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('This file isn’t a valid Allowance backup'); }
  const data = ensureMonths(normalize(raw), today);
  validate(data);
  return data;
}

// ---------- validation ----------
export function validate(data) {
  const s = data.settings;
  if (!s) {
    require(!data.entries.length && !data.accounts.length && !data.budgets.length && !data.funds.length && !data.goals.length && !data.bills.length && !data.wishes.length);
    return;
  }
  // One day of slack keeps stored data valid after travelling to an earlier time zone.
  const latest = addDays(todayISO(), 1);
  require(s.incomeMinor > 0 && s.incomeMinor <= 10_000_000_000 && s.savingsMinor >= 0 && s.savingsMinor <= MAX);
  require(['DAILY', 'WEEKLY', 'MONTHLY'].includes(s.incomeFrequency));
  require(['EVEN', 'HABIT'].includes(s.weightMode));
  require(isISO(s.started) && Number(s.started.slice(0, 4)) >= 2000 && Number(s.started.slice(0, 4)) <= 2100);
  require(s.started <= latest, 'Your budget can’t start in the future');
  const weights = (w) => require(w.length === 7 && w.every((x) => x >= 0 && x <= 100) && w.some((x) => x > 0), 'Give at least one day of the week an allowance');
  weights(s.weights);
  require(data.entries.length <= 50_000 && data.accounts.length <= 1_000 && data.bills.length <= 1_000 && data.funds.length <= 1_000
    && data.goals.length <= 1_000 && data.wishes.length <= 5_000 && data.budgets.length <= 2_000, 'Too many records for this version');
  const ids = (values) => require(values.every((v) => v) && new Set(values).size === values.length, 'Invalid or duplicate record ID');
  ids(data.entries.map((e) => e.id)); ids(data.accounts.map((a) => a.id)); ids(data.funds.map((f) => f.id));
  ids(data.swaps.map((w) => w.id)); ids(data.goals.map((g) => g.id)); ids(data.wishes.map((w) => w.id)); ids(data.bills.map((b) => b.id)); ids(data.budgets.map((b) => b.month));
  data.bills.forEach((b) => require(b.name.trim() && b.amountMinor >= 1 && b.amountMinor <= MAX && ['DAILY', 'WEEKLY', 'MONTHLY'].includes(b.frequency)));
  data.accounts.forEach((a) => require(a.name.trim() && Math.abs(a.openingMinor) <= MAX && ['BANK', 'EWALLET', 'CASH', 'CREDIT'].includes(a.type)));
  data.budgets.forEach((b) => {
    require(monthOf(b.startDate) === b.month);
    require(b.incomeMinor >= 0 && b.billsMinor >= 0 && b.savingsMinor >= 0);
    weights(b.weights);
    for (const [date, mark] of Object.entries(b.marks || {})) require(isISO(date) && monthOf(date) === b.month && MARKS.includes(mark), 'Invalid day mark');
    (b.paybacks || []).forEach((p) => {
      require(isISO(p.date) && monthOf(p.date) === b.month && p.amountMinor > 0 && Array.isArray(p.days), 'Invalid payback');
      p.days.forEach((x) => require(isISO(x.date) && monthOf(x.date) === b.month && x.cutMinor >= 0 && Array.isArray(x.swaps), 'Invalid payback day'));
    });
    for (const [date, minor] of Object.entries(b.plans || {})) require(monthOf(date) === b.month && minor >= 0 && minor <= MAX, 'Invalid day plan');
  });
  data.entries.forEach((e) => {
    require(isISO(e.date) && e.date >= budgetFrom(s));
    require(e.date <= latest, 'Transaction dates can’t be in the future');
    require(e.amountMinor > 0 || e.type === 'ADJUSTMENT', 'Transaction amounts must be greater than zero');
    require(Math.abs(e.amountMinor) <= MAX, 'Transaction amount is out of range');
    require(!e.family || e.type === 'EXPENSE');
    require(!e.accountId || data.accounts.some((a) => a.id === e.accountId));
    require(!e.toAccountId || data.accounts.some((a) => a.id === e.toAccountId));
    require(CATEGORIES.includes(e.category));
    require(e.reservedMinor >= 0 && (e.type !== 'FUND_PURCHASE' || e.reservedMinor <= e.amountMinor));
    if (e.type === 'TRANSFER') require(e.accountId && e.toAccountId && e.accountId !== e.toAccountId);
    if (['FUND_ALLOCATION', 'FUND_RELEASE', 'FUND_PURCHASE'].includes(e.type)) require(data.funds.some((f) => f.id === e.targetId));
    if (['GOAL_DEPOSIT', 'GOAL_WITHDRAWAL'].includes(e.type)) require(data.goals.some((g) => g.id === e.targetId));
  });
  data.funds.forEach((f) => {
    require(f.name.trim() && f.priceMinor >= 1 && f.priceMinor <= MAX);
    if (f.deadline) require(isISO(f.deadline));
    require(fundSaved(data, f.id) >= 0, 'Not enough in the fund. Handle the later releases or purchases first');
    require(data.entries.filter((e) => e.targetId === f.id && e.type === 'FUND_PURCHASE').length <= 1);
    require(Boolean(f.boughtOn) === data.entries.some((e) => e.targetId === f.id && e.type === 'FUND_PURCHASE'));
  });
  data.goals.forEach((g) => {
    require(g.name.trim() && g.targetMinor >= 1 && g.targetMinor <= MAX);
    if (g.deadline) require(isISO(g.deadline));
    require(goalSaved(data, g.id) >= 0, 'Not enough saved. Handle the later withdrawals first');
  });
  require(data.swaps.length <= 500, 'Too many swaps');
  data.swaps.forEach((w) => require(CATEGORIES.includes(w.category) && w.usualName.trim() && w.cheaperName.trim() && w.cheaperMinor >= 0 && w.usualMinor > w.cheaperMinor && w.usualMinor <= MAX
    && typeof w.icon === 'string' && w.icon.length <= 12, 'A swap needs two names and a cheaper price'));
  data.wishes.forEach((w) => require(w.name.trim() && w.priceMinor >= 1 && w.priceMinor <= MAX && isISO(w.date)));
}
