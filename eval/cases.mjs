// Labelled sentences for measuring the assistant. Every row is [text, expected type, expected fields].
//   types:  expense | check | status | spending | undo | goal | wish | none   (none = do nothing: small talk, or a number that is not money)
//   fields: a = amount in sen, c = category, d = days ago (0 = today), p = period (spending)  — a field is only scored when it is given.
// Labels say what a person MEANS, not what the rules happen to do, so a miss is a real miss.
//
// Three sets, so that over- and under-fitting can be told apart:
//   DEV       the sentences the rules and the prompt were built around (the unit tests, the prompt's examples). Scores here can only flatter.
//   HELD_OUT  written afterwards, in different wording, with Malay, spelled-out numbers, mixed languages and many "not money" traps.
//             Never used to tune anything before it was scored.
//   FRESH     written at the same time as HELD_OUT but kept sealed: NOT run until the failures of the held-out round had been fixed. Its wording differs
//             again, so it says whether those fixes generalise or only memorised the held-out sentences. (If it ever drives a fix, it stops being fresh.)
// Today is 2026-11-08 in every case.
export const TODAY = '2026-11-08';

const ex = (text, a, c, d = 0) => [text, 'expense', { a, ...(c ? { c } : {}), d }];
const ck = (text, a) => [text, 'check', { a }];
const no = (text) => [text, 'none', {}];
const st = (text) => [text, 'status', {}];
const sp = (text, p, c) => [text, 'spending', { p, ...(c ? { c } : {}) }];
const un = (text) => [text, 'undo', {}];
const gl = (text, a) => [text, 'goal', { a }];
const ws = (text, a) => [text, 'wish', { a }];

export const DEV = [
  ex('spent RM3 on coffee', 300, 'FOOD'), ex('I paid RM 12.50 for Grab', 1250, 'TRANSPORT'), ex('bought bubble tea 8.90', 890, 'FOOD'),
  ex('我今天花了3块买咖啡', 300, 'FOOD'), ex('花了三块五买奶茶', 350, 'FOOD'), ex('午餐花了十二块', 1200, 'FOOD'), ex('买了电影票 25令吉', 2500, 'FUN'),
  ex('昨天打车花了18块', 1800, 'TRANSPORT', 1), ex('前天吃了饭 9块', 900, 'FOOD', 2), ex('had 2 coffees for RM 7', 700, 'FOOD'),
  ex('今天我花了8块钱买巧克力', 800, 'FOOD'), ex('I spent 8 ringgit on chocolate today', 800, 'FOOD'), ex('earlier I grabbed a bubble tea, 9 bucks', 900, 'FOOD'),
  ex('spent RM 3 on kopi', 300, 'FOOD'), ex('spent RM 12 on lunch 3 days ago', 1200, 'FOOD', 3),
  ck('Sneakers RM 120', 12000), ck('Can I afford sneakers RM 120?', 12000), ck('I want a new phone RM 3000', 300000), ck('我想买耳机 200块', 20000),
  ck('买得起这个游戏吗 80块', 8000), ck('你看一下我8块钱可不可以买巧克力', 800), ck('我8块钱可不可以买巧克力', 800), ck('can I buy chocolate for 8 ringgit?', 800),
  ck('can I spend RM 50 today?', 5000), ck('Movie RM 25', 2500), ck('Can I buy bubble tea RM 9?', 900),
  st('how much is left today?'), st('how much can I spend today'), st('今天还剩多少'), st('今天还能花多少'),
  sp('how much did I spend on food this month', 'month', 'FOOD'), sp('how much did I spend today?', 'today'), sp('这周花了多少', 'week'),
  gl('save for a Japan trip RM 5000', 500000), ws('add AirPods RM 999 to my wish list', 99900),
  un('undo'), un('撤销'), un('delete the last one'), un('oops delete that'),
  no('hello there'), no('今天心情不错'), no('spent a lot on coffee'), no('hi'),
];

export const HELD_OUT = [
  // --- recording, English ---
  ex('just bought a teh tarik for RM2.50', 250, 'FOOD'), ex('paid RM 89 for the electricity bill', 8900, 'LIVING'), ex('Grab to the office was RM 14', 1400, 'TRANSPORT'),
  ex('got a haircut, 25 ringgit', 2500), ex('spent 15 on parking', 1500, 'TRANSPORT'), ex('ordered pizza RM 38.90', 3890, 'FOOD'), ex('bought phone case 18 bucks', 1800, 'SHOPPING'),
  ex('yesterday I paid 30 for the movie', 3000, 'FUN', 1), ex('spent about RM 20 on lunch with friends', 2000, 'FOOD'), ex('paid 5 for the toll', 500, 'TRANSPORT'),
  ex('dinner cost me RM 32', 3200, 'FOOD'), ex('RM 9 for bubble tea just now', 900, 'FOOD'), ex('Used RM 50 to refill petrol', 5000, 'TRANSPORT'),
  ex('got 3 ice creams, RM 10.50', 1050, 'FOOD'), ex('I paid twenty ringgit for lunch', 2000, 'FOOD'), ex('spent fifty bucks on a gift', 5000),
  ex('spent RM 12 on lunch last friday', 1200, 'FOOD', 2),
  // --- recording, 中文 ---
  ex('我刚刚买了奶茶 12块', 1200, 'FOOD'), ex('中午吃饭花了15块5', 1550, 'FOOD'), ex('昨晚看电影花了三十五块', 3500, 'FUN', 1), ex('付了电费 80令吉', 8000, 'LIVING'),
  ex('今天坐地铁用了4块', 400, 'TRANSPORT'), ex('买了一本书 25块', 2500), ex('吃了面包 6块', 600, 'FOOD'), ex('前天买衣服花了99块', 9900, 'SHOPPING', 2),
  ex('早餐吃了鸡蛋面 7块', 700, 'FOOD'), ex('我刚给手机充了50块钱', 5000),
  // --- recording, Malay ---
  ex('tadi beli kopi RM3', 300, 'FOOD'), ex('baru bayar RM 120 untuk bil telefon', 12000), ex('bayar parking RM 3', 300, 'TRANSPORT'), ex('makan nasi lemak RM 6 tadi', 600, 'FOOD'),
  // --- can I buy ---
  ck('can I afford a RM 300 jacket?', 30000), ck('should I buy airpods for 899?', 89900), ck('is it ok to spend RM 60 on dinner tonight', 6000),
  ck('I want to buy a game, RM 159', 15900), ck('我想买一双球鞋 300块', 30000), ck('这个手机 2000块 买得起吗', 200000), ck('可以买这个包吗 150块', 15000),
  ck('Boleh ke beli kasut RM 200?', 20000), ck('RM 25 for a movie ticket, worth it?', 2500), ck('thinking of getting a keyboard for RM 180', 18000),
  ck('do I have enough for a RM 80 meal?', 8000), ck('Sneakers 450', 45000), ck('能不能买 iPhone 5999', 599900), ck('should I get the RM 12 bubble tea?', 1200), ck('afford RM 500 shoes?', 50000),
  // --- what is left / what did I spend ---
  st('how much do I have left today'), st('what is my budget for today?'), st('还能花多少钱'), st('今天预算还有多少'), st('can I still spend today?'),
  st('berapa lagi baki hari ini'), st('how much left?'), st('am I over budget?'), st('remaining allowance'), st('today’s allowance'),
  sp('how much have I spent this week', 'week'), sp('total spending on transport this month', 'month', 'TRANSPORT'), sp('我这个月花了多少', 'month'),
  sp('what did I spend yesterday', 'yesterday'), sp('show me my food spending', 'month', 'FOOD'), sp('今天花了多少钱', 'today'),
  sp('how much did I spend on grab this week', 'week', 'TRANSPORT'), sp('spending summary', 'month'), sp('total I spent today', 'today'),
  // --- undo ---
  un('cancel that'), un('remove the last one'), un('delete last'), un('oops wrong'), un('刚才记错了'), un('不要了，删掉刚才那笔'), un('padam yang tadi'), un('undo that please'),
  // --- goals and wishes ---
  gl('I want to save RM 2000 for a laptop', 200000), gl('saving for a trip, 3000', 300000), ws('add concert ticket RM 350 to wishlist', 35000),
  ws('put sneakers 400 on my wish list', 40000), gl('我想存钱买相机 4000块', 400000), ws('加入愿望清单 耳机 500块', 50000), gl('goal: new bike RM 800', 80000), gl('set a goal for RM 5000 emergency fund', 500000),
  // --- NOT money, or not an action: nothing should happen ---
  no('hello'), no('thanks!'), no('what can you do?'), no('今天天气真好'), no('how are you'), no('good morning'), no('I want to buy a car someday'), no('bought nothing today'),
  no('I will spend less next month'), no('can you remind me to pay rent'),
  no('I walked 3 km today'), no('I slept 8 hours last night'), no('the meeting is at 3pm'), no('I have 2 dogs and 1 cat'), no('my phone number is 0123456789'),
  no('I got 100% on my exam'), no('spent 3 hours on this report'), no('我昨天睡了8个小时'), no('会议下午3点开始'), no('我今年25岁'), no('it is 32 degrees today'),
  no('room 305 please'), no('bus 12 was late again'), no('3 people joined the call'), no('I ran 5 km in 30 minutes'), no('我走了5公里'), no('the file is 12 MB'), no('level 20 reached'),
];

// Written after the first held-out round, once its failures had been fixed. New wording again, so it says whether the fixes generalise or just memorised.
export const FRESH = [
  ex('paid RM 7 for a nasi goreng', 700, 'FOOD'), ex('just spent 16 on a cab', 1600, 'TRANSPORT'), ex('got coffee for 4.50 this morning', 450, 'FOOD'), ex('tadi makan mee RM 8', 800, 'FOOD'),
  ex('我买了两个包子 5块', 500, 'FOOD'), ex('刚付了停车费 3块', 300, 'TRANSPORT'), ex('昨天买了药 28块', 2800, 'HEALTH', 1), ex('bought a notebook for RM 6.90', 690),
  ex('spent thirty ringgit on groceries', 3000, 'FOOD'), ex('gym membership RM 99 paid today', 9900, 'HEALTH'), ex('beli buku RM 25', 2500),
  ck('can I buy a RM 45 t-shirt?', 4500), ck('我可以买这个耳机吗 350块', 35000), ck('worth getting headphones for 220?', 22000), ck('boleh beli beg RM 90?', 9000), ck('is RM 15 too much for lunch?', 1500),
  st('what do I have left to spend'), st('今天还剩多少钱可以花'), st('how much more can I spend today?'), st('baki hari ini'),
  sp('how much did I spend on movies this month', 'month', 'FUN'), sp('这个星期花了多少钱', 'week'), sp('what did I spend today', 'today'), sp('how much have I spent on food', 'month', 'FOOD'),
  un('take that back'), un('delete that entry'), un('撤销刚才那笔'),
  gl('I am saving up for a drone, RM 2500', 250000), ws('wish list: ukulele RM 300', 30000),
  no('see you at 8pm'), no('I drank 2 litres of water'), no('table 7 is ready'), no('我跑了3圈'), no('call me at 5'), no('I lost 2 kg'), no('there are 40 students'), no('thank you so much'),
  no('what is a budget?'), no('今天吃什么好呢'), no('my birthday is on the 20th'), no('version 2 is out'),
];

// Written AFTER FRESH had been scored and its failures fixed, so FRESH is now development data and this is the clean one. New wording again, plus new traps
// (a score "3 to 1", "ate" as a past tense, Malay takeaway, a clock time after "at"). Run once; if it ever drives a fix it too stops being clean.
export const FRESH2 = [
  ex('paid RM 19.90 for a haircut', 1990), ex('tapau mee goreng RM 7', 700, 'FOOD'), ex('spent 40 on a birthday gift for my friend', 4000), ex('bayar tol RM 4.50', 450),
  ex('tadi beli roti canai RM 2.50', 250, 'FOOD'), ex('earlier today I bought stationery for RM 11', 1100), ex('昨天吃火锅花了88块', 8800, 'FOOD', 1), ex('刚买了一杯拿铁 14块', 1400),
  ex('前天付了房租 500令吉', 50000, 'LIVING', 2), ex('topped up RM 30 for my phone', 3000), ex('my lunch today was RM 13.50', 1350, 'FOOD'), ex('dinner with family cost RM 120', 12000, 'FOOD'),
  ex('ate nasi kandar for 12 ringgit', 1200, 'FOOD'), ex('RM 2 for parking, paid already', 200, 'TRANSPORT'), ex('3 days ago I paid RM 60 for a taxi', 6000, 'TRANSPORT', 3),
  ck('can I get a RM 55 backpack?', 5500), ck('is it worth buying earbuds for 130?', 13000), ck('我能买这件外套吗 260块', 26000), ck('boleh beli baju RM 70 tak?', 7000),
  ck('would RM 400 for a chair be too much?', 40000), ck('thinking about a 90 ringgit dinner', 9000), ck('tablet 1200', 120000), ck('should I pay RM 25 for parking today?', 2500),
  st('how much is left in my budget today?'), st('今天还剩多少可以用'), st('am I still within budget?'), st('what can I still spend?'), st('baki duit hari ini'),
  sp('how much did I spend on transport this week?', 'week', 'TRANSPORT'), sp('这个月餐饮花了多少', 'month', 'FOOD'), sp('what have I spent today', 'today'),
  sp('show my spending for this month', 'month'), sp('berapa saya belanja hari ini', 'today'),
  un('undo please'), un('取消刚才那笔'), un('wrong, remove it'),
  gl('I am saving RM 1500 for a new bike', 150000), ws('add a watch RM 800 to my wishlist', 80000), gl('想存钱买电脑 6000块', 600000),
  no('see you tomorrow'), no('my bus is number 7'), no('it will take 10 minutes'), no('I am 170 cm tall'), no('the score was 3 to 1'), no('I need to buy milk'),
  no('how does this app work?'), no('ok thanks'), no('我在3楼'), no('明天早上8点见'), no('I paid attention in class'), no('order 66 is ready'), no('I have a 2pm appointment'), no('he scored 25 points'),
];

// Written BEFORE the fixes that followed the FRESH2 round, and sealed. It is the number to quote for the final system. It deliberately holds traps that were NOT
// fixed beforehand (a year "in 2019", a temperature "28 today"): whatever fails here is reported as a remaining gap, not quietly patched.
export const FRESH3 = [
  ex('paid RM 6 for a sandwich', 600), ex('spent 22 on a taxi home', 2200, 'TRANSPORT'), ex('just bought a charger, RM 35', 3500), ex('ate a burger for RM 12', 1200, 'FOOD'),
  ex('yesterday I spent RM 50 on groceries', 5000, 'FOOD', 1), ex('tadi bayar RM 5 untuk parking', 500, 'TRANSPORT'), ex('我今天喝了一杯奶茶 10块', 1000, 'FOOD'), ex('昨天买菜花了45块', 4500, undefined, 1),
  ex('付了水费 30块', 3000, 'LIVING'), ex('grabbed a taxi, paid RM 18', 1800, 'TRANSPORT'), ex('took the LRT, RM 3.20', 320, 'TRANSPORT'), ex('bought two books for RM 40', 4000), ex('subscribed to Netflix RM 55', 5500, 'FUN'),
  ck('can I afford a RM 2000 laptop?', 200000), ck('should I get these shoes? RM 280', 28000), ck('我可以买这个吗 99块', 9900), ck('boleh beli jam RM 150?', 15000),
  ck('would it be okay to spend RM 35 on a movie night?', 3500), ck('headphones 320', 32000), ck('is a 60 ringgit dinner too much?', 6000), ck('worth paying RM 9 for a smoothie?', 900),
  st('how much do I still have today?'), st('what is left of today’s budget?'), st('今天还有多少钱'), st('baki hari ini berapa'),
  sp('how much did I spend on movies today?', 'today', 'FUN'), sp('这个星期交通花了多少', 'week', 'TRANSPORT'), sp('total spent this month', 'month'),
  sp('what did I spend on food yesterday', 'yesterday', 'FOOD'), sp('berapa belanja minggu ini', 'week'),
  un('oops, that was a mistake, cancel it'), un('删掉刚才的记录'), un('padam yang terakhir'),
  gl('I want to save RM 800 for a trip', 80000), ws('wish list: camera RM 2500', 250000), gl('save up for a phone, 3500', 350000),
  no('good evening'), no('what is inflation?'), no('I read 30 pages today'), no('we won 3 to 1'), no('chapter 5 was boring'), no('my flight is MH370'),
  no('I have 3 meetings today'), no('call 999 for help'), no('I moved here in 2019'), no('the temperature is 28 today'), no('I woke up at 6'), no('会议在5号楼'),
  no('she is 30 years old'), no('what time is it?'),
];

/** Wording that only exists in the prompt of the language model. Left out of the model's scores so its few-shot examples can't flatter it. */
export const PROMPT_EXAMPLES = ['spent RM3 on coffee', '昨天打车花了18块', 'Sneakers RM 120', 'how much did I spend on food this month', '今天还能花多少', 'oops, delete that', 'hi'];
