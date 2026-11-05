// Demo data: open the app with ?demo in the address to try it with about six weeks of made-up spending.
// Nothing is saved in demo mode, so your real data is never touched.
import * as E from './engine.js';

/** Small seeded random generator, so the demo looks the same every time. */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const NOTES = {
  FOOD: ['Nasi lemak', 'Kopi O', 'Chicken rice', 'Bubble tea', 'Mamak supper', 'Lunch with friends', 'Roti canai', 'Grab Food', 'Groceries'],
  TRANSPORT: ['Grab ride', 'LRT', 'Petrol', 'Parking', 'Bus'],
  SHOPPING: ['Uniqlo', 'Shopee', 'Watsons', 'Stationery', 'Phone case'],
  FUN: ['Movie', 'Bowling', 'Steam game', 'Karaoke'],
  HEALTH: ['Pharmacy', 'Clinic'],
  OTHER: ['Laundry', 'Haircut', 'Gift'],
};
const RANGE = { FOOD: [250, 2200], TRANSPORT: [150, 1500], SHOPPING: [1200, 9000], FUN: [900, 3800], HEALTH: [600, 3000], OTHER: [300, 2500] };

/** Three past chats with the budget assistant, so the AI page has something to show. */
export const demoChat = () => [
  { kind: 'me', text: 'Sneakers RM 120' }, { kind: 'check', name: 'Sneakers', amount: 12000 },
  { kind: 'me', text: 'Can I buy bubble tea RM 9?' }, { kind: 'check', name: 'Bubble tea', amount: 900 },
  { kind: 'me', text: 'How much can I spend this weekend?' },
  { kind: 'note', text: 'This weekend you have about RM 85 a day to spend. Tell me what you have in mind, like “Movie RM 25”, and I’ll check it.' },
];

export function demoData(today) {
  const r = rng(20261031);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const between = (lo, hi) => Math.round((lo + r() * (hi - lo)) / 10) * 10;
  const started = `${E.addMonths(E.monthOf(today), -1)}-01`;
  const accounts = [
    { id: 'demo-bank', name: 'Maybank', type: 'BANK', openingMinor: 620000, color: 0, archived: false },
    { id: 'demo-tng', name: 'Touch ’n Go', type: 'EWALLET', openingMinor: 420000, color: 1, archived: false },
    { id: 'demo-cash', name: 'Cash', type: 'CASH', openingMinor: 210000, color: 2, archived: false },
  ];
  let d = { ...E.emptyData(), accounts,
    goals: [{ id: 'demo-g1', name: 'Japan trip', targetMinor: 500000, deadline: '', color: 0, archived: false },
      { id: 'demo-g2', name: 'New phone', targetMinor: 380000, deadline: '', color: 5, archived: false }],
    funds: [{ id: 'demo-f1', name: 'AirPods', priceMinor: 99900, deadline: '', color: 5, boughtOn: null, archived: false }] };
  const settings = { nickname: 'Demo', incomeMinor: 380000, incomeFrequency: 'MONTHLY', savingsMinor: 20000, started, weights: Array(7).fill(1), weightMode: 'EVEN' };
  const bills = [{ id: 'demo-b1', name: 'Phone', amountMinor: 3800, frequency: 'MONTHLY', family: false }, { id: 'demo-b2', name: 'Spotify', amountMinor: 1590, frequency: 'MONTHLY', family: false }];
  d = E.configure({ ...d, settings: { ...settings } }, settings, bills, started);

  // Busy days in clusters, like real life: a coffee and a ride in the morning, a few things around lunch,
  // snacks in the afternoon and a burst in the evening. Most are small, a few are bigger.
  const entries = [];
  for (let day = started; day <= today; day = E.addDays(day, 1)) {
    const weekend = E.dow(day) >= 6;
    const burst = (from, span, n) => Array.from({ length: n }, () => from + r() * span);
    const hours = [
      ...burst(weekend ? 10 : 7.5, 2, 1 + Math.floor(r() * 2)),
      ...burst(12, 2.5, 1 + Math.floor(r() * 3)),
      ...burst(15, 3, Math.floor(r() * 3)),
      ...burst(18, 4.5, 2 + Math.floor(r() * (weekend ? 4 : 3))),
    ];
    for (const h of hours) {
      const roll = r();
      const cat = roll < 0.58 ? 'FOOD' : roll < 0.78 ? 'TRANSPORT' : roll < 0.88 ? 'SHOPPING' : roll < 0.95 ? 'FUN' : roll < 0.98 ? 'HEALTH' : 'OTHER';
      const [y, m, dd] = day.split('-').map(Number);
      const at = new Date(y, m - 1, dd, Math.floor(h), Math.floor((h % 1) * 60)).getTime();
      if (day === today && at > Date.now()) continue; // nothing from later today
      const family = cat === 'FOOD' && r() < 0.12;
      entries.push(E.newEntry({ id: E.id(), date: day, amountMinor: between(...RANGE[cat]), type: 'EXPENSE', category: cat, note: pick(NOTES[cat]),
        accountId: family ? null : pick(['demo-bank', 'demo-tng', 'demo-tng', 'demo-cash']), family, createdAt: at }));
    }
  }
  d = { ...d, entries: [...d.entries, ...entries] };
  d = E.goalMove(d, 'demo-g1', 125000, false, started);
  d = E.goalMove(d, 'demo-g2', 64000, false, E.addDays(started, 10));
  d = E.fundMove(d, 'demo-f1', 42000, false, E.addDays(started, 3));
  return E.ensureMonths(d, today);
}
