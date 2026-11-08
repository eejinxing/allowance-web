// Reads one line of everyday language and says what it means: "spent RM3 on coffee", "我今天花了3块买咖啡",
// "can I afford sneakers RM 120?", "how much is left today". English and Chinese, plus a small set of everyday Malay words (beli, bayar,
// baki, padam, boleh…): enough for short sentences, not a Malay reader.
// Free by design: no AI service, no network, no key. It is a set of rules, so it only knows the sentence shapes below.
// Its one firm promise is about money: an amount must be WRITTEN in the sentence, and a bare number only counts as a price when
// nothing in the sentence says it is something else ("3 km", "100%", "bus 12", a phone number). When unsure it does nothing.
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
// English number words, 1 to 999, only when a currency word follows ("twenty ringgit", "fifty bucks", "two hundred and fifty dollars").
const EN_ONES = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const EN_TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const EN_WORD = `(?:${[...Object.keys(EN_ONES), ...Object.keys(EN_TENS), 'hundred', 'a hundred'].join('|')})`;
const EN_NUMBER = new RegExp(`\\b(${EN_WORD}(?:[\\s-]+(?:and\\s+)?${EN_WORD})*)\\s+(?=(?:ringgit|bucks?|dollars?|rm|myr)\\b)`, 'gi');
function enNumber(words) {
  let total = 0; let cur = 0;
  for (const w of words.toLowerCase().split(/[\s-]+/)) {
    if (w in EN_ONES) cur += EN_ONES[w]; else if (w in EN_TENS) cur += EN_TENS[w];
    else if (w === 'hundred') { cur = (cur || 1) * 100; } else if (w === 'a') cur = 1;
    else if (w !== 'and') return NaN;
    if (cur >= 100) { total += cur; cur = 0; }
  }
  return total + cur;
}
/** "三块五" → "3块5", "十二块" → "12块", "twenty ringgit" → "20 ringgit", so the amount rules below only have to read digits. */
const digitise = (text) => text
  .replace(/([零一二两三四五六七八九十百]+)(?=\s*(?:块|元|令吉|仙))/g, (m) => String(cnNumber(m)))
  .replace(/(块|元)([一二两三四五六七八九])(?![零一二两三四五六七八九十\d])/g, (m, unit, d) => unit + CN_DIGIT[d])
  .replace(EN_NUMBER, (m, words) => { const n = enNumber(words); return Number.isFinite(n) && n > 0 ? `${n} ` : m; });

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
];

// A number with no currency word ("Sneakers 450") is only a price when nothing says it is something else. What may FOLLOW it is a short list
// (the end, a question particle, politeness, or on/for/to/at: "spent 15 on parking"); anything else after it ("3 km", "2 dogs", "12 MB", "岁", "点")
// means it counts something other than money. A list of what is allowed generalises better than a list of every unit there could be.
const BARE_AFTER = /^\s*(?:$|[?？!！.,，。;:)”"'’]|(?:on|for|to|at|towards)\b(?!\s*\d)|(?:worth|only|each|total|today|tonight|now|please|pls|lah|leh|ya|ok|okay|thanks|thx|just now|tadi|ke|kan)\b|[吗嘛呢吧啊么呀哦]|能不能|可不可以|行不行|好不好|够不够|买得起|可以吗|够吗|行吗)/i;
// Words that name a number rather than a price when they come right before it: "room 305", "bus 12", "level 20", "page 4", "#7".
const BARE_LABEL = /(?:\b(?:room|level|bus|table|number|no\.?|route|gate|flight|unit|floor|chapter|page|version|ver|seat|lot|bay|ticket|order|id|line|exit|track|platform|lane)|#|第)\s*$/i;
// "at 5", "by 8", "until 10": a clock time, not a price (only small whole numbers; "sneakers at 450" is still a price).
const TIME_BEFORE = /\b(?:at|by|until|till|since|from|before|after)\s*$/i;
// "3 to 1", "10-5", "3:1", "5/6": the second number of a score, ratio, range or time, not a price.
const RATIO_BEFORE = /\d\s*(?:to|vs\.?|v|:|-|\/|x)\s*$/i;
// After a date word ("4.50 this morning") the number only counts as a price if a price word comes right before it.
const PRICE_BEFORE = /\b(?:for|cost|costs|costing|worth|total|paid|pay|spent|spend|bought)\s*$/i;
function bareAmount(t) {
  for (const m of t.matchAll(/(\d+(?:[.,]\d{1,2})?)/g)) {
    const raw = m[1]; const before = t.slice(0, m.index); const after = t.slice(m.index + m[0].length);
    if (/[\d.,]$/.test(before) || /^[.,]?\d/.test(after)) continue;          // inside a longer number
    if (/^0\d/.test(raw) || raw.replace(/\D/g, '').length > 7) continue;      // 0123456789 is a phone number, not RM 123 million
    if (/[a-z]$/i.test(before)) continue;                                     // glued to letters: "v2", "mp3", "iphone15"
    const bare = after.replace(DATE_WORDS, ' ');                              // what follows once date words are set aside
    if (BARE_LABEL.test(before) || !BARE_AFTER.test(bare)) continue;
    if (bare !== after && !PRICE_BEFORE.test(before)) continue;
    if (RATIO_BEFORE.test(before)) continue;
    if (TIME_BEFORE.test(before) && /^\d{1,2}$/.test(raw) && Number(raw) <= 24) continue;
    const amount = toMinor(raw); if (amount === null) continue;
    return { amount, index: m.index, length: m[0].length };
  }
  return null;
}
/** { amount (sen), money, rest (the text with the amount cut out) } or null when there is no usable amount. */
export function findAmount(text) {
  const t = digitise(text);
  for (const a of AMOUNTS) {
    const m = a.re.exec(t); if (!m) continue;
    const amount = a.minor(m); if (amount === null) continue;
    return { amount, money: true, rest: t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length) };
  }
  const b = bareAmount(t);
  return b ? { amount: b.amount, money: false, rest: t.slice(0, b.index) + ' ' + t.slice(b.index + b.length) } : null;
}
const hasMoneyWord = (text) => { const t = digitise(text); return AMOUNTS.some((a) => { const m = a.re.exec(t); return m && a.minor(m) !== null; }); };

// ---------- categories ----------
// The longest keyword that matches wins, so "grab food" is Food even though "grab" alone is Transport.
const KEYWORDS = {
  FOOD: /\b(?:food|lunch|dinner|breakfast|brunch|supper|snacks?|meals?|eat|ate|drinks?|coffee|kopi|teh|tea|latte|boba|bubble tea|milk tea|nasi\w*|mee|roti\w*|mamak|restaurant|cafe|groceries|grocery|mcd|kfc|burger|pizza|chicken rice|grab ?food|foodpanda|chocolates?|candy|sweets|ice creams?|bread|cake|dessert|noodles?|makan|minum|sarapan|makanan)(?:s|es)?\b|吃|喝|饭|面|餐|咖啡|奶茶|茶|早餐|午餐|晚餐|宵夜|零食|饮料|外卖|美食|食物|水果|巧克力|糖果|面包|蛋糕|冰淇淋|甜点/i,
  TRANSPORT: /\b(?:bus|train|mrt|lrt|monorail|grab|taxi|cab|uber|ride|petrol|fuel|parking|toll|tng|touch n go|flight|ferry|transport)(?:s|es)?\b|地铁|公交|巴士|车费|打车|停车|过路费|机票|交通|油费|加油/i,
  SHOPPING: /\b(?:shirt|shoes?|sneakers?|clothes|bag|shop|shopee|lazada|mall|uniqlo|shopping|phone case|gadget)(?:s|es)?\b|衣服|鞋|包包|购物|网购|买东西/i,
  FUN: /\b(?:movie|cinema|games?|karaoke|bowling|concert|netflix|spotify|fun|party|steam)(?:s|es)?\b|电影|游戏|唱歌|娱乐|演唱会/i,
  HEALTH: /\b(?:pharmacy|clinic|doctor|medicine|medical|hospital|dentist|gym|vitamins?|watsons)(?:s|es)?\b|药|医院|诊所|看病|牙医|健身/i,
  LIVING: /\b(?:rent|electric|electricity|water bill|utilities|internet|wifi|laundry|detergent|household|bil|sewa)(?:s|es)?\b|房租|水电|电费|水费|网费|洗衣|日用/i,
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
const WD_EN = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
const WD_ZH = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
/** The day a sentence is about: yesterday, the day before, "N days ago", "last friday" (the most recent one), "上周五" (that day of last Monday-to-Sunday week). Today otherwise. */
export function dateIn(text, today) {
  if (/day before yesterday|前天/i.test(text)) return E.addDays(today, -2);
  if (/yesterday|last night|昨天|昨日|昨晚|semalam/i.test(text)) return E.addDays(today, -1);
  const n = /\b(\d{1,2})\s*days?\s*ago\b|(\d{1,2})\s*天前|前\s*(\d{1,2})\s*天/i.exec(text);
  if (n) { const k = Number(n[1] ?? n[2] ?? n[3]); if (k >= 1 && k <= 31) return E.addDays(today, -k); }
  const en = /\blast\s+(mon|tue|wed|thu|fri|sat|sun)[a-z]*/i.exec(text);
  if (en) return E.addDays(today, -(((E.dow(today) - WD_EN[en[1].toLowerCase()] + 7) % 7) || 7));
  const zh = /上(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/.exec(text);
  if (zh) return E.addDays(today, -(E.dow(today) - 1) - 7 + (WD_ZH[zh[1]] - 1));
  return today;
}
/** Date words, so they don't end up inside an item's name ("Lunch last friday"). */
const DATE_WORDS = /\blast\s+(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|\b\d{1,2}\s*days?\s*ago\b|\bday before yesterday\b|\bthis (?:morning|afternoon|evening)\b|\blast night\b|\bjust now\b|\bearlier\b|\byesterday\b|\btonight\b|\btoday\b|\d{1,2}\s*天前|前\s*\d{1,2}\s*天|上(?:个)?(?:周|星期|礼拜)[一二三四五六日天]|早上|中午|晚上|semalam/gi;

// ---------- naming ----------
const FILLER_EN = /\b(?:i|i'm|im|i've|ive|my|me|just|today|yesterday|tonight|now|spent|spend|spending|paid|pay|bought|buy|ordered|order|had|got|get|used|cost|costs|on|for|at|to|a|an|the|of|rm|myr|ringgit|sen|can|could|should|may|afford|want|wanna|need|plan|planning|thinking|is|it|its|ok|okay|worth|add|record|log|put|please|with|in|this|that|and|some|about|around|only|already|just now|was|were|do|have|enough|too|much|still|beli|membeli|bayar|membayar|untuk|tadi|baru|sudah|dah|ke|yang|saya|aku|boleh|bolehkah|belanja|habis|guna|makan|minum|kat|di|dengan)\b/gi;
const FILLER_ZH = /刚|给|充了|充值|可不可以|行不行|好不好|你看一下|帮我看一下|帮我看|看一下|看看|你看|请问|告诉我|我|今天|今日|昨天|昨日|昨晚|前天|刚刚|刚才|花了|花|买得起|买了|买|付了|付|用了|吃了|喝了|消费|想|要|打算|可以|能不能|不能|够不够|吗|嘛|呢|啊|吧|的|了|在|去|一杯|一个|一份|一碗|一次|记一下|记录|记账|记下|块钱|块|元|令吉|仙|钱|帮我|请|毛|角/g;
export function nameFrom(rest) {
  const name = rest.replace(DATE_WORDS, ' ').replace(FILLER_EN, ' ').replace(FILLER_ZH, ' ').replace(/[?？!！.,，。、:;"“”'’()]/g, ' ').replace(/\s+/g, ' ').trim();
  return name && /[a-z]/i.test(name[0]) ? name[0].toUpperCase() + name.slice(1) : name;
}

// ---------- what is being asked ----------
const UNDO = /^(?:please\s+)?(?:undo|oops|cancel that|(?:delete|remove|cancel)\s+(?:that|it|this|the last(?: one)?|last(?: one)?))\b|\btake (?:that|it) back\b|\b(?:wrong|mistake|oops|sorry)\b.*\b(?:delete|remove|cancel|undo)\b|\b(?:padam|batal|buang)\b|撤销|撤回|删掉刚|删除刚|取消刚|记错了|刚才.*(?:错|不要)/i;
const WISH = /wish\s?list|愿望|心愿/i;
const GOAL = /\b(?:save(?:\s+up)?\s+for|saving\s+for|goal|want to save)\b|\bsav(?:e|ing)\b.*\bfor\b|存钱买|攒钱|目标/i;
// "what is still ahead of me": asked before the "what did I spend" patterns, because 还能花多少 contains both 花 and 多少.
const STATUS_NOW = /还能|能花|可以花|还可以花|还剩|剩多少|剩下|\bcan i (?:still )?spend\b|\bhow much (?:more )?(?:left|can i|do i have|is left)\b|berapa lagi|\bbaki\b|tinggal berapa/i;
const SPENDING = /\b(?:how much|total|summary|breakdown|report)\b.*\b(?:spent|spending|did i spend|have i spent|do i spend)\b|\b(?:spent|spending)\b.*\b(?:how much|total)\b|\bwhat (?:did|have|do) i (?:spend|spent)\b|\b(?:show|see|check)\b.*\bspending\b|\bspending\b.*\b(?:summary|report|so far)\b|\bmy spending\b|berapa.*(?:belanja|habis|guna)|(?:belanja|habis).*berapa|多少.*(?:花|消费|支出)|(?:花|消费|支出).*多少|总共|统计|总结/i;
const STATUS = /\b(?:how much|what)\b.*\b(?:left|remain\w*|have|can i spend|allowed)\b|\b(?:left|remaining)\b.*\b(?:today|now)\b|\btoday['’]?s?\b.*\b(?:budget|allowance)\b|\b(?:my|the|remaining|over|under)\s+(?:budget|allowance)\b|\b(?:budget|allowance)\s+(?:left|today|remaining)\b|\b(?:within|over|under|on)\s+(?:my\s+)?budget\b|\bstatus\b|预算|额度|余额/i;
const QUESTION = /\?|？|\b(?:can i|could i|should i|may i|afford|worth it|ok to|okay to|is it ok|do i|boleh|bolehkah|patut|mampu)\b|吗|嘛|能不能|可不可以|可以买|买得起|够不够|想买|要买|打算买|\bwant\b|\bwanna\b|\bplan(?:ning)? to\b|\bthinking of\b/i;
// Words that say the money is already gone: a past-tense verb, a time that has passed, or the Malay equivalents.
const RECORD = /\b(?:spent|paid|bought|ordered|had|got|used|cost|record|log|add|was|were|just now|earlier|this (?:morning|afternoon|evening)|last night|yesterday|topped up|top up|ate|eaten|drank|took|grabbed|tapau|takeaway|takeout|booked|subscribed|renewed|donated|tipped|rented|beli|membeli|bayar|membayar|belanja|makan|minum|tadi|sudah|dah|semalam)\b|花了|买了|付了|用了|吃了|喝了|消费了|刚刚|刚才|充了|充值|昨天|昨日|昨晚|前天|记一下|记录|记账|记下|添加/i;

/** The period a spending question names, or null when it names none. Decided by the rules, like amounts and days, not by the model. */
export function explicitPeriod(text) {
  if (/yesterday|昨天|昨日|semalam/i.test(text)) return 'yesterday';
  if (/today|今天|今日|hari ini/i.test(text)) return 'today';
  if (/\bweek\b|7 days|seven days|这周|本周|这个星期|一周|这星期|minggu ini/i.test(text)) return 'week';
  if (/\bmonth\b|这个月|本月|bulan ini/i.test(text)) return 'month';
  return null;
}
const periodOf = (text) => explicitPeriod(text) ?? 'month';

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
  if (!named && STATUS_NOW.test(text)) return { type: 'status' };
  if (!named && SPENDING.test(text)) return { type: 'spending', period: periodOf(text), category: guessCategory(text) };
  if (!named && STATUS.test(text)) return { type: 'status' };
  if (!found) return null;
  const name = nameFrom(found.rest);
  if (WISH.test(text)) return { type: 'wish', amount: found.amount, name: nameFrom(found.rest.replace(WISH, ' ').replace(/\b(?:my|to|add|put)\b/gi, ' ')) || 'Something' };
  if (GOAL.test(text)) return { type: 'goal', amount: found.amount, name: nameFrom(found.rest.replace(GOAL, ' ')) || 'My goal' };
  if (QUESTION.test(text)) return { type: 'check', amount: found.amount, name: name || 'this' };
  if (RECORD.test(text)) return { type: 'expense', amount: found.amount, name, category: guessCategory(text) ?? 'OTHER', date: dateIn(text, today) };
  // "Sneakers RM 120" on its own has always meant: can I buy it? It is a default, not a sure reading, so it is marked weak: a second reader may overrule it.
  return { type: 'check', amount: found.amount, name: name || 'this', weak: true };
}

/** The money spent in a period, optionally for one category. Family-paid entries are left out, like the daily budget does. */
export function spendingTotal(data, period, category, today) {
  const from = period === 'today' ? today : period === 'yesterday' ? E.addDays(today, -1) : period === 'week' ? E.addDays(today, -6) : `${E.monthOf(today)}-01`;
  const to = period === 'yesterday' ? from : today;
  const rows = data.entries.filter((e) => e.type === 'EXPENSE' && !e.family && e.date >= from && e.date <= to && (!category || e.category === category));
  return { total: rows.reduce((s, e) => s + e.amountMinor, 0), count: rows.length };
}
