// Icons shared with the Android app (same path data), drawn as stroked SVG.
const ICONS = {
  Add: ["M12 5V19M5 12H19", 2],
  AddBold: ["M12 4.5V19.5M4.5 12H19.5", 2.8],
  TrendUp: ["M4 16L9.5 10.5L13 14L20 7M15 7H20V12", 2.4],
  Check: ["M5 12L10 17L20 7", 2],
  CheckCircle: ["M21 12A9 9 0 1 1 3 12A9 9 0 1 1 21 12M8 12.5L11 15.5L16.5 9", 2.2],
  Coin: ["M21 12A9 9 0 1 1 3 12A9 9 0 1 1 21 12M14.5 9.5Q14.5 8 12 8Q9.5 8 9.5 10Q9.5 12 12 12Q14.5 12 14.5 14Q14.5 16 12 16Q9.5 16 9.5 14.5M12 6.5V8M12 16V17.5", 2.2],
  ChevronLeft: ["M15 6L9 12L15 18", 2],
  ChevronRight: ["M9 6L15 12L9 18", 2],
  WbSunny: ["M16 12A4 4 0 1 1 8 12A4 4 0 1 1 16 12M12 2V4M12 20V22M2 12H4M20 12H22M5 5L6.5 6.5M17.5 17.5L19 19M5 19L6.5 17.5M17.5 6.5L19 5", 2],
  ReceiptLong: ["M6 3L8 5L10 3L12 5L14 3L16 5L18 3V21L16 19L14 21L12 19L10 21L8 19L6 21ZM9 9H15M9 13H15M9 17H13", 2],
  BarChart: ["M5 20V11M12 20V4M19 20V14", 2],
  AccountBalanceWallet: ["M5 6H19Q21 6 21 8V19Q21 21 19 21H5Q3 21 3 19V8Q3 6 5 6ZM3 10H21M16 15H18M5 6V3H18V6", 2],
  Flag: ["M5 21V3M5 4H12L14 6H21V16H14L12 14H5", 2],
  AutoAwesome: ["M12 3L14 8L19 10L14 12L12 17L10 12L5 10L10 8ZM19 16L20 18L22 19L20 20L19 22L18 20L16 19L18 18Z", 2],
  Tune: ["M3 6H8M12 6H21M3 12H14M18 12H21M3 18H6M10 18H21M8 3V9M14 9V15M6 15V21", 2],
  Restaurant: ["M7 3V21M4.5 3V8Q4.5 10.5 7 10.5Q9.5 10.5 9.5 8V3M17 21V3Q13.5 3 13.5 9Q13.5 13 17 13", 2],
  DirectionsBus: ["M6 4H18Q20 4 20 7V17Q20 19 18 19H6Q4 19 4 17V7Q4 4 6 4ZM4 11H20M8 15H8.1M16 15H16.1M7 19V21M17 19V21", 2],
  ShoppingBag: ["M5.5 8H18.5L17.5 21H6.5ZM9 8V6A3 3 0 0 1 15 6V8", 2],
  Celebration: ["M12 3L14.5 8L20 9L16 13L17 19L12 16L7 19L8 13L4 9L9.5 8Z", 2],
  Home: ["M3.5 11.5L12 4L20.5 11.5M6 10V21H18V10M10 21V15H14V21", 2],
  Favorite: ["M12 21S4 16 4 10A4.5 4.5 0 0 1 12 7A4.5 4.5 0 0 1 20 10C20 16 12 21 12 21Z", 2],
  MoreHoriz: ["M5 12H5.1M12 12H12.1M19 12H19.1", 2],
  Savings: ["M8 4H16M7 7H17L16 21H8ZM10 13H14M12 11V15", 2],
  SouthWest: ["M18 6L6 18M6 8V18H16", 2],
  SwapHoriz: ["M3 8H21M17 4L21 8L17 12M21 16H3M7 12L3 16L7 20", 2],
  CalendarMonth: ["M5 5H19Q21 5 21 7V20Q21 22 19 22H5Q3 22 3 20V7Q3 5 5 5ZM3 10H21M7 2V7M17 2V7M7 14H7.1M12 14H12.1M17 14H17.1M7 18H7.1M12 18H12.1", 2],
  Clock: ["M21 12A9 9 0 1 1 3 12A9 9 0 1 1 21 12M12 7V12L15.5 14", 2],
  Person: ["M15.5 8A3.5 3.5 0 1 1 8.5 8A3.5 3.5 0 1 1 15.5 8M5 21Q5 15 12 15Q19 15 19 21", 2],
  Target: ["M21 12A9 9 0 1 1 3 12A9 9 0 1 1 21 12M16 12A4 4 0 1 1 8 12A4 4 0 1 1 16 12M12 12H12.1", 2],
  ArrowUp: ["M12 19V5M6 11L12 5L18 11", 2],
  ArrowDown: ["M12 5V19M6 13L12 19L18 13", 2],
  Close: ["M6 6L18 18M18 6L6 18", 2],
  Download: ["M12 4V15M7 10L12 15L17 10M5 20H19", 2],
  Cookie: ["M21 12A9 9 0 1 1 12 3Q12 7 16 7Q16 11 21 12M9 10H9.1M14 14H14.1M9 15H9.1", 2],
  Edit: ["M4 20H8L19 9L15 5L4 16ZM13 7L17 11", 2],
  ArrowRight: ["M5 12H19M13 6L19 12L13 18", 2],
  Piggy: ["M5 12.5C5 9.5 8 7.5 12 7.5C16 7.5 19 9.5 19 12.5C19 14.2 18.1 15.6 16.7 16.5V19H14V17.8C13.4 17.9 12.7 18 12 18C11.3 18 10.6 17.9 10 17.8V19H7.3V16.5C5.9 15.6 5 14.2 5 12.5ZM8.5 8.3L8 5.8L10.6 7.7M11 4.5H14M15.4 11.6H15.5M19 12H21", 2],
  ChevronDown: ["M6 9L12 15L18 9", 2],
  ArrowUpRight: ["M7 17L17 7M8 7H17V16", 2],
  Plane: ["M21 16V14L13 9V4.5C13 3.7 12.3 3 11.5 3C10.7 3 10 3.7 10 4.5V9L2 14V16L10 13.5V18L8 19.5V21L11.5 20L15 21V19.5L13 18V13.5Z", 2],
  Bicycle: ["M9 17A3.5 3.5 0 1 1 2 17A3.5 3.5 0 1 1 9 17M22 17A3.5 3.5 0 1 1 15 17A3.5 3.5 0 1 1 22 17M5.5 17L9 9H14L18.5 17M9 9L12 17M14 9L13 6H11", 2],
  Car: ["M5 16V11L7 6H17L19 11V16M3 16H21V19H3ZM7 13H7.1M17 13H17.1M5 11H19", 2],
  Laptop: ["M5 17V7C5 6.4 5.4 6 6 6H18C18.6 6 19 6.4 19 7V17M3 17H21L20 19H4Z", 2],
  People: ["M12.5 7.5A3.5 3.5 0 1 1 5.5 7.5A3.5 3.5 0 1 1 12.5 7.5M2.5 20Q2.5 14.5 9 14.5Q15.5 14.5 15.5 20M15.5 4.3A3.5 3.5 0 0 1 15.5 10.7M18 14.8Q21.5 15.8 21.5 20", 2],
  Camera: ["M4 8H7.5L9 5.5H15L16.5 8H20V19H4ZM15.5 13A3.5 3.5 0 1 1 8.5 13A3.5 3.5 0 1 1 15.5 13", 2],
  Bread: ["M5 10Q3 10 3 8Q3 5 7 5H17Q21 5 21 8Q21 10 19 10V18Q19 19 18 19H6Q5 19 5 18ZM9 13V16M12 13V16M15 13V16", 2],
  Train: ["M7 3H17Q19 3 19 5V15Q19 18 16 18H8Q5 18 5 15V5Q5 3 7 3ZM5 11H19M9 14.5H9.1M15 14.5H15.1M8 21L10 18M16 21L14 18", 2],
  Bottle: ["M10 3H14V6L15.5 8V20Q15.5 21 14.5 21H9.5Q8.5 21 8.5 20V8L10 6ZM8.5 12H15.5", 2],
  Cup: ["M5 8H16V15Q16 19 12 19H9Q5 19 5 15ZM16 10H18Q20 10 20 12Q20 14 18 14H16M8 3V5M12 3V5", 2],
  Lunchbox: ["M4 9H20V18Q20 19 19 19H5Q4 19 4 18ZM8 9V7Q8 5 10 5H14Q16 5 16 7V9M4 13H20M12 11V15", 2],
  Waveform: ["M4 10V14M8 7V17M12 4V20M16 7V17M20 10V14", 2],
  ChatHistory: ["M21 12A9 9 0 0 1 7.5 19.8L3 21L4.3 16.6A9 9 0 1 1 21 12ZM12 7.5V12L15 13.8", 2],
  Settings: ["M19.02 9.09L21.97 9.85L21.97 14.15L19.02 14.91L19.02 14.91L20.57 17.53L17.53 20.57L14.91 19.02L14.91 19.02L14.15 21.97L9.85 21.97L9.09 19.02L9.09 19.02L6.47 20.57L3.43 17.53L4.98 14.91L4.98 14.91L2.03 14.15L2.03 9.85L4.98 9.09L4.98 9.09L3.43 6.47L6.47 3.43L9.09 4.98L9.09 4.98L9.85 2.03L14.15 2.03L14.91 4.98L14.91 4.98L17.53 3.43L20.57 6.47L19.02 9.09ZM15 12A3 3 0 1 1 9 12A3 3 0 1 1 15 12", 2],
};

/** Returns inline SVG markup. Size in px; colour follows the surrounding text colour. */
export function icon(name, size = 24, extra = "") {
  const [d, w] = ICONS[name] || ICONS.MoreHoriz;
  return `<svg class="ic ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}
export const ICON_NAMES = Object.keys(ICONS);

// The icon for a swap, chosen from its words (the cheaper option first), falling back on its category. Drawn by us, so it matches the app.
const SWAP_GLYPHS = [[/bread|toast|roti|sandwich|\bbun\b/, 'Bread'], [/train|mrt|lrt|rail|komuter/, 'Train'], [/\bbus\b/, 'DirectionsBus'], [/water|bottle/, 'Bottle'],
  [/coffee|tea|kopi|latte|boba/, 'Cup'], [/lunch|bento|packed|rice|meal/, 'Lunchbox'], [/bike|cycle|walk/, 'Bicycle'], [/\bcar\b|grab|taxi|ride|\bcab\b/, 'Car']];
const CAT_GLYPH = { FOOD: 'Restaurant', TRANSPORT: 'DirectionsBus', SHOPPING: 'ShoppingBag', FUN: 'Celebration', LIVING: 'Home', HEALTH: 'Favorite', OTHER: 'Coin' };
export function swapIcon(swap, size = 24) {
  const cheaper = String(swap.cheaperName ?? '').toLowerCase(); const both = cheaper + ' ' + String(swap.usualName ?? '').toLowerCase();
  const hit = SWAP_GLYPHS.find(([re]) => re.test(cheaper)) ?? SWAP_GLYPHS.find(([re]) => re.test(both));
  return icon(hit ? hit[1] : CAT_GLYPH[swap.category] ?? 'Coin', size);
}
