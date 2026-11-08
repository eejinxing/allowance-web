// Every bottom sheet that edits data. Each one validates through the engine, so a rule violation
// shows up as an inline message instead of a silent failure.
import * as E from './engine.js';
import { S, commit, toast } from './state.js';
import { icon } from './icons.js';
import { goalColors } from './charts.js';
import { openSheet, confirmDialog, esc, CAT_NAMES, FREQS, ACCOUNT_TYPES, TYPE_NAMES, dayLong, dayShort } from './ui.js';

const today = () => S.today;
const EDITABLE = ['EXPENSE', 'INCOME', 'SCHEDULED_INCOME', 'BILL_PAYMENT'];
const accountOpts = (withNone = true) => [...(withNone ? [['', 'Don’t track an account']] : []), ...S.data.accounts.filter((a) => !a.archived).map((a) => [a.id, a.name])];

async function removeWith(close, { title, text, confirm = 'Delete' }, action, message) {
  if (!(await confirmDialog({ title, text, confirm }))) return;
  try { action(); close(); if (message) toast(message); } catch (e) { toast(e.message); }
}

// ---------- entries ----------
export function openEntry(id, preset = {}) {
  const orig = id ? S.data.entries.find((e) => e.id === id) : null;
  if (orig && !EDITABLE.includes(orig.type)) return openDetails(orig);
  const fields = [
    { k: 'type', t: 'chips', v: orig?.type ?? 'EXPENSE', opts: [['EXPENSE', 'Expense'], ['INCOME', 'Extra income'], ['SCHEDULED_INCOME', 'Scheduled income'], ['BILL_PAYMENT', 'Bill payment']] },
    { k: 'amount', t: 'money', label: 'Amount (RM)', v: orig ? E.decimal(orig.amountMinor) : preset.amount ? E.decimal(preset.amount) : '' },
    { k: 'category', t: 'chips', v: orig?.category ?? preset.category ?? 'FOOD', opts: Object.entries(CAT_NAMES), show: (v) => v.type === 'EXPENSE' },
    { k: 'family', t: 'switch', label: 'Paid by family', v: orig?.family ?? false, show: (v) => v.type === 'EXPENSE' },
    { t: 'note', show: (v) => v.type === 'SCHEDULED_INCOME' || v.type === 'BILL_PAYMENT',
      text: (v) => (v.type === 'SCHEDULED_INCOME' ? 'Already counted in your budgeted income. This only updates the receiving account and doesn’t raise your daily budget.'
        : 'Only for bills already set aside in your budget, so they aren’t taken from your daily budget twice.') },
    { k: 'note', t: 'text', label: 'Note', v: orig?.note ?? preset.note ?? '' },
    { k: 'date', t: 'date', label: 'Date', v: orig?.date ?? preset.date ?? today(), max: today(), min: E.budgetFrom(S.data.settings) },
    { k: 'account', t: 'chips', v: orig?.accountId ?? '', label: (v) => (v.type.includes('INCOME') ? 'Receiving account' : 'Paying account'),
      opts: () => accountOpts(), show: (v) => !(v.family && v.type === 'EXPENSE') },
    ...(orig ? [{ t: 'btn', id: 'del', label: 'Delete entry', danger: true, onClick: (_v, ctx) => removeWith(ctx.close, { title: 'Delete this entry?', text: 'Your budget and account balances will be recalculated. If later fund activity depends on this entry, handle that first.' },
      () => commit((d) => E.deleteEntry(d, orig.id), null), 'Entry deleted') }] : []),
  ];
  openSheet({ title: orig ? 'Edit entry' : 'New entry', fields, onSave: (v) => {
    const expense = v.type === 'EXPENSE';
    const entry = E.newEntry({ id: orig?.id ?? E.id(), date: v.date || today(), amountMinor: E.positive(v.amount), type: v.type, category: v.category || 'FOOD',
      note: v.note.trim(), accountId: expense && v.family ? null : v.account || null, family: expense && v.family, createdAt: orig?.createdAt ?? Date.now() });
    commit((d) => E.saveEntry(d, entry, today()), orig ? 'Entry updated' : 'Entry added');
  } });
}

function openDetails(entry) {
  const acct = (id) => S.data.accounts.find((a) => a.id === id)?.name;
  const fields = [
    { t: 'html', html: () => `<p class="t-title" style="margin:0 0 6px">${esc(TYPE_NAMES[entry.type])}</p><p style="font-size:30px;font-weight:700;margin:0 0 8px">${E.cash(entry.amountMinor)}</p>
      <p class="muted" style="margin:0">${dayLong(entry.date)}${entry.note ? ` · ${esc(entry.note)}` : ''}</p>
      ${acct(entry.accountId) ? `<p style="margin:6px 0 0">Account: ${esc(acct(entry.accountId))}</p>` : ''}${acct(entry.toAccountId) ? `<p style="margin:6px 0 0">To: ${esc(acct(entry.toAccountId))}</p>` : ''}
      ${entry.type === 'FUND_PURCHASE' ? `<p style="margin:6px 0 0">Paid from fund: ${E.cash(entry.reservedMinor)}</p>` : ''}` },
    { t: 'note', text: () => 'This entry is linked to an account, fund or goal. Deleting it restores those balances too.' },
    { t: 'btn', id: 'del', label: 'Delete entry', danger: true, onClick: (_v, ctx) => removeWith(ctx.close, { title: 'Delete this entry?', text: 'Your budget and account balances will be recalculated.' },
      () => commit((d) => E.deleteEntry(d, entry.id), null), 'Entry deleted') },
  ];
  openSheet({ title: 'Transaction details', fields, noSave: true });
}

// ---------- accounts ----------
export function openAccount(id) {
  const old = id ? S.data.accounts.find((a) => a.id === id) : null;
  const fields = [
    { k: 'name', t: 'text', label: 'Account name', v: old?.name ?? '' },
    { k: 'type', t: 'chips', v: old?.type ?? 'BANK', opts: ACCOUNT_TYPES },
    { k: 'balance', t: 'money', signed: true, label: 'Current balance (RM)', v: old ? E.decimal(E.accountBalance(S.data, old)) : '', hint: 'For credit card debt, enter a negative number, e.g. -250.00' },
    { k: 'color', t: 'colors', v: old?.color ?? 0 },
    ...(old ? [{ t: 'btn', id: 'rm', label: 'Remove account', danger: true, onClick: (_v, ctx) => removeWith(ctx.close, { title: `Remove ${old.name}?`, text: 'The account will be hidden. Past transactions and the account name are kept.', confirm: 'Remove' },
      () => commit((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === old.id ? { ...a, archived: true } : a)) }), null), 'Account removed') }] : []),
  ];
  openSheet({ title: old ? 'Edit account' : 'Add account', fields, onSave: (v) => {
    E.require(v.name.trim(), 'Enter an account name');
    const amount = E.parseMoney(v.balance === '' ? '0' : v.balance);
    const account = { id: old?.id ?? E.id(), name: v.name.trim(), type: v.type, openingMinor: old?.openingMinor ?? amount, color: v.color, archived: old?.archived ?? false };
    commit((d) => {
      const next = { ...d, accounts: old ? d.accounts.map((a) => (a.id === old.id ? account : a)) : [...d.accounts, account] };
      return old ? E.setBalance(next, old.id, amount, today()) : next;
    }, old ? 'Account updated' : 'Account added');
  } });
}

export function openBalance(id) {
  const account = S.data.accounts.find((a) => a.id === id);
  const fields = [
    { t: 'note', text: () => 'Enter the balance your bank or wallet actually shows. The difference is recorded as an adjustment and doesn’t affect your daily budget.' },
    { k: 'amount', t: 'money', signed: true, label: 'Current balance (RM)', v: E.decimal(E.accountBalance(S.data, account)) },
  ];
  openSheet({ title: `Adjust ${account.name} balance`, fields, onSave: (v) => commit((d) => E.setBalance(d, id, E.parseMoney(v.amount), today()), 'Balance adjusted') });
}

export function openTransfer() {
  const accts = S.data.accounts.filter((a) => !a.archived);
  const fields = [
    { t: 'note', text: () => 'Top-ups, withdrawals or moving money between accounts. Not counted as spending and doesn’t change your daily budget.' },
    { k: 'amount', t: 'money', label: 'Transfer amount (RM)', v: '' },
    { k: 'from', t: 'chips', label: 'From', v: accts[0]?.id ?? '', opts: accountOpts(false) },
    { k: 'to', t: 'chips', label: 'To', v: accts[1]?.id ?? '', opts: accountOpts(false) },
  ];
  openSheet({ title: 'Transfer between accounts', fields, onSave: (v) => commit((d) => E.transfer(d, v.from, v.to, E.positive(v.amount), today()), 'Transfer recorded') });
}

// ---------- funds, goals, wishes ----------
export function openTarget(kind, id = '') {
  const fund = S.data.funds.find((f) => f.id === id); const goal = S.data.goals.find((g) => g.id === id); const wish = S.data.wishes.find((w) => w.id === id);
  const title = kind === 'fund' ? 'shopping fund' : kind === 'goal' ? 'savings goal' : 'wish';
  const fields = [
    { k: 'name', t: 'text', label: 'Name', v: fund?.name ?? goal?.name ?? wish?.name ?? '' },
    { k: 'amount', t: 'money', label: kind === 'goal' ? 'Target amount (RM)' : 'Price (RM)', v: (fund?.priceMinor ?? goal?.targetMinor ?? wish?.priceMinor) != null ? E.decimal(fund?.priceMinor ?? goal?.targetMinor ?? wish?.priceMinor) : '' },
    ...(kind !== 'wish' ? [{ k: 'deadline', t: 'date', label: 'Target date', optional: true, v: fund?.deadline ?? goal?.deadline ?? '' }, { k: 'color', t: 'colors', v: fund?.color ?? goal?.color ?? 1 }] : []),
    ...(fund && E.fundSaved(S.data, fund.id) > 0 ? [{ t: 'note', text: () => 'To release part of the balance, open the fund, choose Add / release funds, then Release. Removing the fund releases all of it.' }] : []),
    ...(id ? [{ t: 'btn', id: 'rm', label: `Remove ${title}`, danger: true, onClick: (_v, ctx) => removeWith(ctx.close, { title: `Remove this ${title}?`,
      text: kind === 'fund' ? 'What’s left in the fund goes back to your spendable budget. Past entries are kept.' : 'Past entries are kept.', confirm: 'Remove' },
      () => commit((d) => (kind === 'fund' ? E.archiveFund(d, id, today()) : kind === 'goal' ? { ...d, goals: d.goals.map((g) => (g.id === id ? { ...g, archived: true } : g)) }
        : { ...d, wishes: d.wishes.filter((w) => w.id !== id) }), null), 'Removed') }] : []),
  ];
  openSheet({ title: (id ? 'Edit ' : 'New ') + title, fields, onSave: (v) => {
    E.require(v.name.trim(), 'Enter a name');
    const value = E.positive(v.amount);
    if (v.deadline) E.require(E.isISO(v.deadline), 'Dates should look like YYYY-MM-DD');
    const rid = id || E.id();
    commit((d) => {
      if (kind === 'fund') return { ...d, funds: id ? d.funds.map((f) => (f.id === id ? { ...f, name: v.name.trim(), priceMinor: value, deadline: v.deadline, color: v.color } : f))
        : [...d.funds, { id: rid, name: v.name.trim(), priceMinor: value, deadline: v.deadline, color: v.color, boughtOn: null, archived: false }] };
      if (kind === 'goal') return { ...d, goals: id ? d.goals.map((g) => (g.id === id ? { ...g, name: v.name.trim(), targetMinor: value, deadline: v.deadline, color: v.color } : g))
        : [...d.goals, { id: rid, name: v.name.trim(), targetMinor: value, deadline: v.deadline, color: v.color, archived: false }] };
      return { ...d, wishes: id ? d.wishes.map((w) => (w.id === id ? { ...w, name: v.name.trim(), priceMinor: value } : w)) : [...d.wishes, { id: rid, name: v.name.trim(), priceMinor: value, date: today() }] };
    }, id ? 'Saved' : 'Added');
  } });
}

/** kind: 'fundin' (set aside / release), 'goalin' (deposit / withdraw) or 'buy' (mark a fund as purchased). */
export function openMove(kind, id) {
  const fund = S.data.funds.find((f) => f.id === id); const goal = S.data.goals.find((g) => g.id === id);
  const saved = fund ? E.fundSaved(S.data, id) : E.goalSaved(S.data, id);
  const fields = [
    { t: 'html', html: () => `<p class="t-title" style="margin:0 0 12px">Saved so far: ${E.cash(saved)}</p>` },
    ...(kind !== 'buy' ? [{ k: 'mode', t: 'chips', v: 'IN', opts: [['IN', kind === 'fundin' ? 'Set aside' : 'Deposit'], ['OUT', kind === 'fundin' ? 'Release' : 'Withdraw']] }] : []),
    { k: 'amount', t: 'money', label: kind === 'buy' ? 'Actual price paid (RM)' : 'Amount (RM)', v: kind === 'buy' ? E.decimal(fund.priceMinor) : '' },
    ...(kind === 'buy' ? [{ k: 'account', t: 'chips', label: 'Paying account', v: '', opts: () => accountOpts() },
      { t: 'note', text: (v) => { let p = 0; try { p = E.positive(v.amount); } catch { /* typing */ }
        return `The fund pays ${E.cash(Math.min(saved, p))}; the remaining ${E.cash(Math.max(0, p - saved))} comes out of your daily budget.${saved > p && p > 0 ? ` The leftover ${E.cash(saved - p)} goes back to your spendable budget.` : ''}`; } }]
      : [{ t: 'note', text: () => (kind === 'fundin' ? 'Setting aside lowers your spendable budget and releasing raises it. Account balances don’t change.'
        : 'Tracks money you’ve already saved without touching your daily budget. Record a transfer if money actually moves between accounts.') }]),
  ];
  const title = kind === 'buy' ? `Bought: ${fund.name}` : (fund?.name ?? goal?.name);
  openSheet({ title, fields, onSave: (v) => {
    const value = E.positive(v.amount);
    commit((d) => (kind === 'buy' ? E.buyFund(d, id, value, v.account || null, today()) : kind === 'fundin' ? E.fundMove(d, id, value, v.mode === 'OUT', today())
      : E.goalMove(d, id, value, v.mode === 'OUT', today())), 'Saved');
  } });
}

export function openFundSheet(id) {
  const fund = S.data.funds.find((f) => f.id === id);
  const saved = E.fundSaved(S.data, id); const remaining = Math.max(0, fund.priceMinor - saved);
  const days = fund.deadline ? Math.max(1, E.daysBetween(today(), fund.deadline) + 1) : 0;
  const fields = [
    { t: 'html', html: () => `<p class="muted" style="margin:0 0 6px">Saved ${E.cash(saved)} / Target ${E.cash(fund.priceMinor)}</p>
      <p style="margin:0 0 6px;font-weight:700;color:var(${remaining > 0 ? '--bad' : '--good'})">${remaining > 0 ? `Short by ${E.cash(remaining)}` : saved > fund.priceMinor ? `✓ Fully funded · OVER ${E.cash(saved - fund.priceMinor)}` : '✓ Fully funded'}</p>
      ${days ? `<p class="muted small" style="margin:0 0 12px">Target date ${esc(fund.deadline)} · about ${E.cash(Math.ceil(remaining / days))} per day</p>` : ''}` },
    { t: 'btn', id: 'in', label: 'Add / release funds', onClick: (_v, ctx) => { ctx.close(); setTimeout(() => openMove('fundin', id), 200); } },
    { t: 'btn', id: 'buy', label: 'Mark as purchased', onClick: (_v, ctx) => { ctx.close(); setTimeout(() => openMove('buy', id), 200); } },
    { t: 'btn', id: 'edit', label: 'Edit fund', onClick: (_v, ctx) => { ctx.close(); setTimeout(() => openTarget('fund', id), 200); } },
  ];
  openSheet({ title: fund.name, fields, noSave: true });
}

/**
 * A goal opens as a full dark screen with its own keypad (like a "send money" screen):
 * the goal card on top, a Deposit / Withdraw switch, a big amount, the keypad and one confirm button.
 */
export function openGoalSheet(id) {
  const goal = S.data.goals.find((g) => g.id === id); if (!goal) return;
  const active = S.data.goals.filter((g) => !g.archived);
  const color = goalColors(active)[active.indexOf(goal)] ?? '#FFD83D';
  const saved = E.goalSaved(S.data, id);
  let amount = ''; let withdraw = false;

  const wrap = document.createElement('div');
  wrap.className = 'gpad'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', goal.name);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
  const pct = (v) => Math.min(100, Math.round((v * 100) / goal.targetMinor));
  const ring = (p) => { const r = 19; const c = 2 * Math.PI * r;
    return `<svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="${r}" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="5"/>
      <circle class="gp-ring" cx="24" cy="24" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}" transform="rotate(-90 24 24)"/></svg>`; };
  wrap.innerHTML = `<div class="gp-top"><button type="button" class="gp-back" data-x aria-label="Close">${icon('ChevronLeft', 24)}</button><b>${withdraw ? 'Withdraw' : 'Save to goal'}</b><span class="gp-gap"></span></div>
    <div class="gp-card gp-goal"><span class="gp-ring-wrap">${ring(pct(saved))}<i style="background:${color}"></i></span>
      <span class="gp-gtx"><b>${esc(goal.name)}</b><small>${E.cash(saved)} of ${E.cash(goal.targetMinor).replace('.00', '')}${goal.deadline ? ` · by ${esc(dayShort(goal.deadline))}` : ''}</small></span>
      <button type="button" class="gp-link" data-edit>Edit</button></div>
    <div class="gp-card gp-amt">
      <div class="gp-mode" role="tablist"><button type="button" data-mode="in" class="on">Deposit</button><button type="button" data-mode="out">Withdraw</button></div>
      <div class="gp-num" aria-live="polite"><em>RM</em><span data-num>0</span></div>
      <div class="gp-sub" data-sub>Enter amount</div>
      <div class="gp-after" data-after></div>
      <div class="gp-err" data-err hidden></div></div>
    <div class="gp-keys">${keys.map((k) => `<button type="button" data-k="${k}" aria-label="${k === 'del' ? 'Delete' : k === '.' ? 'Decimal point' : k}">${k === 'del' ? `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z M12 9.5l5 5 M17 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>` : k}</button>`).join('')}</div>
    <button type="button" class="gp-go" data-go disabled>Save to goal</button>`;
  document.getElementById('layer').appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('on'));

  const $ = (s) => wrap.querySelector(s);
  const minor = () => { try { return amount ? E.parseMoney(amount) : 0; } catch { return 0; } };
  const paint = (bump) => {
    const m = minor(); const num = $('[data-num]');
    num.textContent = amount ? Number(amount.split('.')[0]).toLocaleString('en-US') + (amount.includes('.') ? '.' + amount.split('.')[1] : '') : '0';
    num.parentElement.classList.toggle('gp-zero', !amount);
    if (bump) { num.parentElement.classList.remove('bump'); void num.offsetWidth; num.parentElement.classList.add('bump'); }
    $('[data-sub]').textContent = withdraw ? `Up to ${E.cash(saved)} saved` : 'Enter amount';
    const after = withdraw ? saved - m : saved + m;
    $('[data-after]').innerHTML = m ? `After this: <b>${E.cash(Math.max(0, after))}</b> · ${pct(Math.max(0, after))}% of target` : '';
    const over = withdraw && m > saved;
    $('[data-err]').hidden = !over; $('[data-err]').textContent = over ? 'Not enough saved in this goal' : '';
    const go = $('[data-go]'); go.disabled = !m || over; go.textContent = withdraw ? 'Withdraw from goal' : 'Save to goal';
    $('.gp-top b').textContent = withdraw ? 'Withdraw' : 'Save to goal';
  };
  const press = (k) => {
    if (k === 'del') amount = amount.slice(0, -1);
    else if (k === '.') { if (!amount.includes('.')) amount = (amount || '0') + '.'; }
    else {
      const [w, f] = amount.split('.');
      if (f != null && f.length >= 2) return;
      if (f == null && w.length >= 7) return;
      amount = amount === '0' ? k : amount + k;
    }
    navigator.vibrate?.(3); paint(true);
  };
  const close = () => { wrap.classList.remove('on'); removeEventListener('popstate', close); setTimeout(() => wrap.remove(), 320); };
  addEventListener('popstate', close);
  wrap.addEventListener('click', (e) => {
    const k = e.target.closest('[data-k]'); if (k) return press(k.dataset.k);
    const m = e.target.closest('[data-mode]');
    if (m) { withdraw = m.dataset.mode === 'out'; wrap.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b === m)); return paint(false); }
    if (e.target.closest('[data-x]')) return close();
    if (e.target.closest('[data-edit]')) { close(); return setTimeout(() => openTarget('goal', id), 320); }
    if (e.target.closest('[data-go]')) {
      try { commit((d) => E.goalMove(d, id, minor(), withdraw, today()), withdraw ? 'Withdrawn from goal' : 'Saved to goal'); close(); }
      catch (err) { $('[data-err]').hidden = false; $('[data-err]').textContent = err.message; }
    }
  });
  // A hardware keyboard works too (handy on desktop).
  const onKey = (e) => { if (!wrap.isConnected) return removeEventListener('keydown', onKey);
    if (/^[0-9.]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Escape') close(); else if (e.key === 'Enter' && !$('[data-go]').disabled) $('[data-go]').click(); };
  addEventListener('keydown', onKey);
  paint(false);
}

// ---------- budget settings ----------
/** The budget form in three groups. First-run setup shows them as step cards; the settings sheet shows them in one list. */
export const budgetSections = (prev) => ({
  name: [{ k: 'name', t: 'text', label: 'What should we call you?', v: prev?.nickname ?? '' }],
  income: [
    { k: 'income', t: 'money', label: 'Income or allowance (RM)', v: prev ? E.decimal(prev.incomeMinor) : '' },
    { k: 'frequency', t: 'chips', v: prev?.incomeFrequency ?? 'MONTHLY', opts: FREQS },
    { k: 'savings', t: 'money', label: 'Monthly savings to set aside (RM)', v: prev ? E.decimal(prev.savingsMinor) : '0' },
    { t: 'note', text: () => 'After setup, open Plan to see your weekly pattern and plan specific days.' },
  ],
  bills: [{ k: 'bills', t: 'bills', v: S.data.bills.map((b) => ({ id: b.id, name: b.name, amount: E.decimal(b.amountMinor), frequency: b.frequency, family: b.family })) }],
  notes: [{ t: 'note', text: () => 'If you start mid-month, monthly income and savings are prorated by the days left; monthly bills are set aside in full. Weekly amounts are estimated per day ÷ 7. Budgeted income isn’t added to your bank balance automatically, so log it as Scheduled income when it arrives.' }],
});
export const budgetFields = (prev) => { const s = budgetSections(prev); return [...s.name, ...s.income, ...s.bills, ...s.notes]; };

/** Turns the form values into settings + bills and applies them. Shared by setup and the settings sheet. */
export function applyBudget(v, setup) {
  const prev = S.data.settings;
  const yearly = v.frequency === 'YEARLY'; // only offered in first-run setup
  const settings = { nickname: v.name.trim(), incomeMinor: yearly ? E.monthlyFromYearly(E.positive(v.income)) : E.positive(v.income),
    incomeFrequency: yearly ? 'MONTHLY' : v.frequency, savingsMinor: E.zeroOrPositive(v.savings),
    started: prev?.started ?? today(), weights: prev?.weights ?? Array(7).fill(1), weightMode: prev?.weightMode ?? 'EVEN' };
  const bills = v.bills.map((b) => { E.require(b.name.trim(), 'Name each bill, or remove the empty one');
    return { id: b.id, name: b.name.trim(), amountMinor: E.positive(b.amount), frequency: b.frequency, family: b.family }; });
  commit((d) => E.configure(d, settings, bills, today()), setup ? 'Your budget is ready' : 'Budget updated');
}
export function openBudget() { openSheet({ title: 'Budget settings', fields: budgetFields(S.data.settings), onSave: (v) => applyBudget(v, false) }); }

// ---------- cheaper swaps ----------
/** The list of swaps the assistant draws on when you overspend. Pick one to change it, or add your own. */
export function openSwaps() {
  const later = (fn) => (_v, ctx) => { ctx.close(); setTimeout(fn, 200); };
  const fields = [
    { t: 'note', text: () => 'When you overspend, the assistant swaps these in on the days after, starting with the categories you spend most on.' },
    ...S.data.swaps.map((s, i) => ({ t: 'btn', id: `s${i}`, label: `${s.cheaperName} instead of ${s.usualName} · saves ${E.cash(E.swapSaving(s))}`, onClick: later(() => openSwap(s.id, true)) })),
    { t: 'btn', id: 'add', label: 'Add a swap', onClick: later(() => openSwap(null, true)) },
  ];
  openSheet({ title: 'Cheaper swaps', fields, noSave: true });
}

/** A swap is two things with a name and a cost each: what you usually do, and the cheaper option. The category and emoji are worked out from the names. */
const guessCategory = E.guessCategory;
const CAT_EMOJI = { TRANSPORT: '🚌', FOOD: '🍽️', SHOPPING: '🛍️', FUN: '🎬', OTHER: '🔁' };

/** Add or change one swap. From the list in Settings it returns to that list afterwards; from the Swaps tab it just closes. */
export function openSwap(id, fromList = false) {
  const old = id ? S.data.swaps.find((s) => s.id === id) : null;
  const back = () => { if (fromList) setTimeout(openSwaps, 350); };
  const val = (vals, k, fallback) => vals[k] ?? fallback;
  const pair = (vals, label, nameKey, costKey, name, cost) => `<div class="swp-row">
    <label class="field"><span>${label}</span><input data-k="${nameKey}" value="${esc(val(vals, nameKey, name))}" autocomplete="off"></label>
    <label class="field"><span>Cost (RM)</span><input data-k="${costKey}" inputmode="decimal" value="${esc(val(vals, costKey, cost))}" autocomplete="off"></label></div>`;
  const fields = [
    { t: 'html', html: (vals) => pair(vals, 'Name', 'usualName', 'usual', old?.usualName ?? '', old ? E.decimal(old.usualMinor) : '')
      + pair(vals, 'Cheaper option', 'cheaperName', 'cheaper', old?.cheaperName ?? '', old ? E.decimal(old.cheaperMinor) : '') },
    ...(old ? [{ t: 'btn', id: 'del', label: 'Delete swap', danger: true, onClick: (_v, ctx) => { commit((d) => ({ ...d, swaps: d.swaps.filter((s) => s.id !== old.id) }), 'Swap removed'); ctx.close(); back(); } }] : []),
  ];
  openSheet({ title: old ? 'Edit swap' : 'New swap', fields, onSave: (v) => {
    const usualName = String(val(v, 'usualName', old?.usualName ?? '')).trim(); const cheaperName = String(val(v, 'cheaperName', old?.cheaperName ?? '')).trim();
    const usualMinor = E.positive(val(v, 'usual', old ? E.decimal(old.usualMinor) : '')); const cheaperMinor = E.zeroOrPositive(val(v, 'cheaper', old ? E.decimal(old.cheaperMinor) : ''));
    E.require(usualName && cheaperName, 'Give both a name');
    E.require(cheaperMinor < usualMinor, 'The cheaper option has to cost less');
    const category = old && old.usualName === usualName && old.cheaperName === cheaperName ? old.category : guessCategory(`${usualName} ${cheaperName}`);
    const swap = { id: old?.id ?? E.id(), category, icon: old && category === old.category ? old.icon : CAT_EMOJI[category] ?? '🔁', usualName, usualMinor, cheaperName, cheaperMinor };
    commit((d) => ({ ...d, swaps: old ? d.swaps.map((s) => (s.id === old.id ? swap : s)) : [...d.swaps, swap] }), old ? 'Swap updated' : 'Swap added');
    back();
  } });
}

// ---------- planning ----------
/** Today or a past day: type what you spent. One expense is edited in place, none adds one, several are listed to pick from. */
export function openDaySpend(date) {
  const own = S.data.entries.filter((e) => e.date === date && e.type === 'EXPENSE' && !e.family);
  const total = own.reduce((s, e) => s + e.amountMinor, 0);
  const other = S.data.entries.filter((e) => e.date === date && !e.family && ['BILL_PAYMENT', 'FUND_PURCHASE'].includes(e.type)).reduce((s, e) => s + e.amountMinor, 0);
  const later = (fn) => (_v, ctx) => { ctx.close(); setTimeout(fn, 200); };
  const extra = other ? [{ t: 'note', text: () => `Bills and fund purchases add ${E.cash(other)} on top of this.` }] : [];
  if (own.length > 1) {
    const fields = [
      { t: 'html', html: () => `<p class="muted" style="margin:0 0 10px">${own.length} expenses add up to <b>${E.cash(total)}</b> on this day. Pick one to change it.</p>` },
      ...own.map((e, i) => ({ t: 'btn', id: `e${i}`, label: `${CAT_NAMES[e.category]}${e.note ? ` · ${e.note}` : ''} · ${E.cash(e.amountMinor)}`, onClick: later(() => openEntry(e.id)) })),
      { t: 'btn', id: 'add', label: 'Add another expense', onClick: later(() => openEntry(null, { date })) }, ...extra,
    ];
    return openSheet({ title: dayLong(date), fields, noSave: true });
  }
  const fields = [
    { k: 'amount', t: 'money', label: 'Spent that day (RM)', v: own.length ? E.decimal(total) : '' },
    { t: 'html', html: () => `<div class="chips" style="margin-bottom:8px"><button type="button" class="chip" data-quick="0">No spending</button></div>` }, ...extra,
    ...(own.length ? [{ t: 'note', text: () => `Logged as ${CAT_NAMES[own[0].category]}${own[0].note ? ` · ${esc(own[0].note)}` : ''}. Changing the amount keeps the rest of the entry.` }] : []),
  ];
  const close = openSheet({ title: dayLong(date), saveLabel: 'Save', fields, onSave: (v) => {
    const minor = E.zeroOrPositive(v.amount);
    commit((d) => {
      if (!own.length) return minor ? E.saveEntry(d, E.newEntry({ date, amountMinor: minor, category: 'OTHER' }), today()) : d;
      return minor ? E.saveEntry(d, { ...own[0], amountMinor: minor }, today()) : E.deleteEntry(d, own[0].id);
    }, minor ? 'Saved' : 'Marked as a no-spend day');
  } });
  const sheets = document.querySelectorAll('#layer .sheet');
  sheets[sheets.length - 1]?.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]'); if (!q) return;
    const input = q.closest('.sheet').querySelector('input[data-k="amount"]'); input.value = q.dataset.quick; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return close;
}

export function openPlanDay(date) {
  const month = E.monthOf(date);
  const existing = S.data.budgets.find((b) => b.month === month)?.plans?.[date];
  const suggested = E.suggestedFor(S.data, date, today());
  const fields = [
    { t: 'note', text: () => (existing === 0 ? `Marked as a no-spend day. Enter an amount to spend only that much instead. Without a plan this day would get about ${E.cash(suggested)}.`
      : existing != null ? `Spend only ${E.cash(existing)}. Without a plan this day would get about ${E.cash(suggested)}.`
      : `Right now this day gets about ${E.cash(suggested)}. Plan a set amount and the other days adjust.`) },
    { k: 'amount', t: 'money', label: 'Spend only (RM)', v: existing ? E.decimal(existing) : '' },
    { t: 'html', html: () => `<div class="chips" style="margin-bottom:8px"><button type="button" class="chip" data-quick="0">No spending</button><button type="button" class="chip" data-quick="${E.decimal(Math.max(0, suggested))}">Use suggested</button></div>` },
    ...(existing != null ? [{ t: 'btn', id: 'rm', label: 'Remove plan', danger: true, onClick: (_v, ctx) => { try { commit((d) => E.setPlan(d, date, null, today()), 'Plan removed'); ctx.close(); } catch (e) { toast(e.message); } } }] : []),
  ];
  const close = openSheet({ title: dayLong(date), saveLabel: 'Save plan', fields, onSave: (v) => {
    const minor = E.zeroOrPositive(v.amount);
    commit((d) => E.setPlan(d, date, minor, today()), minor ? `Spend only ${E.cash(minor)}` : 'No-spend day');
  } });
  // The quick chips fill the amount field directly.
  const sheets = document.querySelectorAll('#layer .sheet');
  sheets[sheets.length - 1]?.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]'); if (!q) return;
    const input = q.closest('.sheet').querySelector('input[data-k="amount"]'); input.value = q.dataset.quick; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return close;
}
export { dayShort };
