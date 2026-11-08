// Reads one line of everyday language and says what it means: "spent RM3 on coffee", "我今天花了3块买咖啡",
// "can I afford sneakers RM 120?", "how much is left today". English and Chinese (some Malay words too).
// Free by design: no AI service, no network, no key. It is a set of rules, so it only knows the sentences below,
// but it never guesses an amount: a number it can't read is a number it asks about.
// Pure functions, no DOM, so it can be tested on its own.
import * as E from './engine.js';

export const isChinese = (text) => /[㐀-鿿]/.test(text);

// ---------- money ----------
const CN_DIGIT = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
/** 三十五 → 35, 十二 → 12, 两百 → 200. */
function cnNumber(text) {
  let total = 0; let cur = 0;
  for (const ch of text) {
    if (ch in CN_DIGIT) cur = CN_DIGIT[ch];
    else if (ch === '十') { total += (cur || 1) * 10; cur = 0; } else if (ch === '百') { total += (cur || 1) * 100; cur = 0; }
  }
  return total + cur;
}
/** "三块五" → "3块5", "十二块" → "12块", so the amount rules below only have to read digits. */
const digitise = (text) => text
  .replace(/([零一二两三四五六七八九十百]+)(?=\s*(?:块|元|令吉|仙))/g, (m) => String(cnNumber(m)))
  .replace(/(块|元)([一二两三四五六七八九])(?![零一二两三四五六七八九十\d])/g, (m, unit, d) => unit + CN_DIGIT[d]);

/** "1,200" is a thousand; "12,50" is a decimal comma. */
const normalise = (raw) => (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(',', '.'));
function toMinor(raw) { try { return E.positive(normalise(raw)); } catch { return null; } }

const NUM = '\\d[\\d,]*(?:\\.\\d{1,2})?';
// Most specific first, so "RM 7" wins over the "2" in "2 coffees". `money` is true when a currency word or unit was found.
const AMOUNTS = [
  { re: /(\d+(?:\.\d+)?)\s*(?:sen|仙)(?![a-z])/i, minor: (m) => { const v = Math.round(Number(m[1])); return v > 0 ? v : null; }, money: true },
  { re: /(\d+(?:[.,]\d{1,2})?)\s*(?:块|元|令吉)\s*(\d{1,2})?\s*(?:毛|角)?/, minor: (m) => { const base = toMinor(m[1]); if (base === null) return null; if (!m[2]) return base; return base + (m[2].length === 1 ? Number(m[2]) * 10 : Number(m[2])); }, money: true },
  { re: new RegExp(`(?:rm|myr)\\s*(${NUM})`, 'i'), minor: (m) => toMinor(m[1]), money: true },
  { re: new RegExp(`(${NUM})\\s*(?:rm|myr|ringgit|bucks?|dollars?)(?![a-z])`, 'i'), minor: (m) => toMinor(m[1]), money: true },
  { re: /(\d+(?:[.,]\d{1,2})?)/, minor: (m) => toMinor(m[1]), money: false },
];
/** { amount (sen), money, rest (the text with the amount cut out) } or null when there is no usable amount. */
export function findAmount(text) {
  const t = digitise(text);
  for (const a of AMOUNTS) {
    const m = a.re.exec(t); if (!m) continue;
    const amount = a.minor(m); if (amount === null) continue;
    return { amount, money: a.money, rest: t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length) };
  }
  return null;
}
const hasMoneyWord = (text) => AMOUNTS.slice(0, 4).some((a) => { const m = a.re.exec(digitise(text)); return m && a.minor(m) !== null; });

// ---------- categories ----------
// The longest keyword that matches wins, so "grab food" is Food even though "grab" alone is Transport.
const KEYWORDS = {
  FOOD: /\b(?:food|lunch|dinner|breakfast|brunch|supper|snacks?|meals?|eat|ate|drinks?|coffee|kopi|teh|tea|latte|boba|bubble tea|milk tea|nasi\w*|mee|roti\w*|mamak|restaurant|cafe|groceries|grocery|mcd|kfc|burger|pizza|chicken rice|grab ?food|foodpanda|chocolates?|candy|sweets|ice cream|bread|cake|dessert|noodles?)\b|吃|喝|饭|面|餐|咖啡|奶茶|茶|早餐|午餐|晚餐|宵夜|零食|饮料|外卖|美食|食物|水果|巧克力|糖果|面包|蛋糕|冰淇淋|甜点/i,
  TRANSPORT: /\b(?:bus|train|mrt|lrt|monorail|grab|taxi|cab|uber|ride|petrol|fuel|parking|toll|tng|touch n go|flight|ferry|transport)\b|地铁|公交|巴士|车费|打车|停车|过路费|机票|交通|油费|加油/i,
  SHOPPING: /\b(?:shirt|shoes?|sneakers?|clothes|bag|shop|shopee|lazada|mall|uniqlo|shopping|phone case|gadget)\b|衣服|鞋|包包|购物|网购|买东西/i,
  FUN: /\b(?:movie|cinema|games?|karaoke|bowling|concert|netflix|spotify|fun|party|steam)\b|电影|游戏|唱歌|娱乐|演唱会/i,
  HEALTH: /\b(?:pharmacy|clinic|doctor|medicine|medical|hospital|dentist|gym|vitamins?|watsons)\b|药|医院|诊所|看病|牙医|健身/i,
  LIVING: /\b(?:rent|electric|electricity|water bill|utilities|internet|wifi|laundry|detergent|household)\b|房租|水电|电费|水费|网费|洗衣|日用/i,
};
/** The best-matching category name, or null when nothing in the text points to one. */
export function guessCategory(text) {
  let best = null; let len = 0;
  for (const [cat, re] of Object.entries(KEYWORDS)) {
    const g = new RegExp(re.source, 'gi');
    for (const m of text.matchAll(g)) if (m[0].length > len) { best = cat; len = m[0].length; }
  }
  return best;
}

// ---------- dates ----------
/** Wording that points to a day further back than yesterday, which only the language model is asked to work out ("3 days ago", "上周"). */
export const FAR_PAST = /\b\d{1,2}\s*days?\s*ago\b|\blast\s+(?:week|month|night|mon|tue|wed|thu|fri|sat|sun)\w*|\b(?:mon|tues?|wednes|thurs?|fri|satur|sun)day\b|\d{1,2}\s*天前|前\d{1,2}天|上(?:周|个?星期|个?礼拜)|星期[一二三四五六日天]|周[一二三四五六日]/i;
export function dateIn(text, today) {
  if (/day before yesterday|前天/i.test(text)) return E.addDays(today, -2);
  if (/yesterday|昨天|昨日|昨晚/i.test(text)) return E.addDays(today, -1);
  return today;
}

// ---------- naming ----------
const FILLER_EN = /\b(?:i|i'm|im|i've|ive|my|me|just|today|yesterday|tonight|now|spent|spend|spending|paid|pay|bought|buy|ordered|order|had|got|get|used|cost|costs|on|for|at|to|a|an|the|of|rm|myr|ringgit|sen|can|could|should|may|afford|want|wanna|need|plan|planning|thinking|is|it|its|ok|okay|worth|add|record|log|put|please|with|in|this|that|and|some|about|around|only|already|just now)\b/gi;
const FILLER_ZH = /可不可以|行不行|好不好|你看一下|帮我看一下|帮我看|看一下|看看|你看|请问|告诉我|我|今天|今日|昨天|昨日|昨晚|前天|刚刚|刚才|花了|花|买得起|买了|买|付了|付|用了|吃了|喝了|消费|想|要|打算|可以|能不能|不能|够不够|吗|嘛|呢|啊|吧|的|了|在|去|一杯|一个|一份|一碗|一次|记一下|记录|记账|记下|块钱|块|元|令吉|仙|钱|帮我|请|毛|角/g;
export function nameFrom(rest) {
  const name = rest.replace(FILLER_EN, ' ').replace(FILLER_ZH, ' ').replace(/[?？!！.,，。、:;"“”'’()]/g, ' ').replace(/\s+/g, ' ').trim();
  return name && /[a-z]/i.test(name[0]) ? name[0].toUpperCase() + name.slice(1) : name;
}

// ---------- what is being asked ----------
const UNDO = /^(?:please\s+)?(?:undo|oops|cancel that|(?:delete|remove|cancel)\s+(?:that|it|this|the last(?: one)?|last(?: one)?))\b|撤销|撤回|删掉刚|删除刚|取消刚|记错了|刚才.*(?:错|不要)/i;
const WISH = /wish\s?list|愿望|心愿/i;
const GOAL = /\b(?:save(?:\s+up)?\s+for|saving\s+for|goal)\b|存钱买|攒钱|目标/i;
const SPENDING = /\b(?:how much|total|summary|breakdown|report)\b.*\b(?:spent|spending|did i spend|have i spent|do i spend)\b|\b(?:spent|spending)\b.*\b(?:how much|total)\b|多少.*(?:花|消费|支出)|(?:花|消费|支出).*多少|总共|统计|总结/i;
const STATUS = /\b(?:how much|what)\b.*\b(?:left|remain\w*|have|can i spend|allowed)\b|\b(?:left|remaining)\b.*\b(?:today|now)\b|\btoday'?s?\b.*\b(?:budget|allowance)\b|\b(?:my )?(?:budget|allowance)\b|\bstatus\b|还剩|剩多少|剩下|还能花|可以花多少|能花多少|预算|额度|余额/i;
const QUESTION = /\?|？|\b(?:can i|could i|should i|may i|afford|worth it|ok to|okay to|is it ok|do i)\b|吗|嘛|能不能|可不可以|可以买|买得起|够不够|想买|要买|打算买|\bwant\b|\bwanna\b|\bplan(?:ning)? to\b|\bthinking of\b/i;
const RECORD = /\b(?:spent|paid|bought|ordered|had|got|used|cost|record|log|add)\b|花了|买了|付了|用了|吃了|喝了|消费了|刚刚|刚才|记一下|记录|记账|记下|添加/i;

function periodOf(text) {
  if (/yesterday|昨天|昨日/i.test(text)) return 'yesterday';
  if (/today|今天|今日/i.test(text)) return 'today';
  if (/\bweek\b|7 days|seven days|这周|本周|这个星期|一周|这星期/i.test(text)) return 'week';
  return 'month';
}

/**
 * What one line means, as { type, ... } with amounts in sen, or null when it isn't understood.
 *   expense  { amount, name, category, date }     "spent RM3 on coffee"
 *   check    { amount, name }                      "can I afford sneakers RM 120?", or just "Sneakers RM 120"
 *   goal / wish { amount, name }                   "save for a phone RM 3000", "add AirPods RM 999 to my wish list"
 *   spending { period, category }                  "how much did I spend on food this month"
 *   status   {}                                    "how much is left today"
 *   undo     {}                                    "undo", "撤销"
 */
export function interpret(input, today) {
  const text = String(input ?? '').trim(); if (!text) return null;
  if (UNDO.test(text)) return { type: 'undo' };
  const found = findAmount(text);
  const named = hasMoneyWord(text);
  // Questions about the numbers. A written amount ("can I spend RM 50") makes it a purchase check instead.
  if (!named && SPENDING.test(text)) return { type: 'spending', period: periodOf(text), category: guessCategory(text) };
  if (!named && STATUS.test(text)) return { type: 'status' };
  if (!found) return null;
  const name = nameFrom(found.rest);
  if (WISH.test(text)) return { type: 'wish', amount: found.amount, name: nameFrom(found.rest.replace(WISH, ' ').replace(/\b(?:my|to|add|put)\b/gi, ' ')) || 'Something' };
  if (GOAL.test(text)) return { type: 'goal', amount: found.amount, name: nameFrom(found.rest.replace(GOAL, ' ')) || 'My goal' };
  if (QUESTION.test(text)) return { type: 'check', amount: found.amount, name: name || 'this' };
  if (RECORD.test(text)) return { type: 'expense', amount: found.amount, name, category: guessCategory(text) ?? 'OTHER', date: dateIn(text, today) };
  return { type: 'check', amount: found.amount, name: name || 'this' }; // "Sneakers RM 120" on its own has always meant: can I buy it?
}

/** The money spent in a period, optionally for one category. Family-paid entries are left out, like the daily budget does. */
export function spendingTotal(data, period, category, today) {
  const from = period === 'today' ? today : period === 'yesterday' ? E.addDays(today, -1) : period === 'week' ? E.addDays(today, -6) : `${E.monthOf(today)}-01`;
  const to = period === 'yesterday' ? from : today;
  const rows = data.entries.filter((e) => e.type === 'EXPENSE' && !e.family && e.date >= from && e.date <= to && (!category || e.category === category));
  return { total: rows.reduce((s, e) => s + e.amountMinor, 0), count: rows.length };
}
