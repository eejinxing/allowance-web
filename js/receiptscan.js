// Reads the total off a receipt photo, on this device. No server, no API key, no quota.
//   1. cutRows:   the photo is cut into rows of text (ink profile; mirrors ml/common.py cut_rows)
//   2. the ONNX model (models/receipt-reader.onnx, trained in PyTorch, see ml/) reads each row into text
//   3. findTotal: picks the amount on the TOTAL row, and says how sure it is
// The model runs through onnxruntime-web (WASM, loaded once from jsDelivr, version pinned, then kept offline by the service worker).
// Nothing here saves anything: the caller shows the amount in the normal entry sheet for the person to check.

export const WIDTH = 720, H = 32;
export const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.,:$£€%#*-/@()& ';
export const ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
export const MODEL_URL = 'models/receipt-reader.onnx';

// ---------- 1. rows (the same arithmetic as ml/common.py) ----------
/** Mean over a (2r+1) square around each pixel, edges averaging the pixels that exist. */
function boxMean(a, w, h, r) {
  const sw = w + 1, s = new Float64Array((h + 1) * sw);
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += a[y * w + x]; s[(y + 1) * sw + x + 1] = s[y * sw + x + 1] + row; } }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      out[y * w + x] = (s[y1 * sw + x1] - s[y0 * sw + x1] - s[y1 * sw + x0] + s[y0 * sw + x0]) / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/** gray: Uint8ClampedArray/Float32Array of w*h (already WIDTH wide). Returns the boxes [y0, y1, x0, x1] of the text rows, top to bottom. */
export function cutRows(gray, w, h) {
  const mean = boxMean(gray, w, h, 12);
  const ink = new Uint8Array(w * h), prof = new Float64Array(h);
  for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x++) if (gray[y * w + x] < mean[y * w + x] - 14) { ink[y * w + x] = 1; n++; } prof[y] = n; }
  const k = new Float64Array(h);
  for (let y = 0; y < h; y++) k[y] = ((y > 0 ? prof[y - 1] : 0) + prof[y] + (y < h - 1 ? prof[y + 1] : 0)) / 3;
  const thr = Math.max(2, 0.006 * w);
  const segs = [];
  for (let y = 0; y < h;) { if (k[y] > thr) { const y0 = y; while (y < h && k[y] > thr) y++; segs.push([y0, y]); } else y++; }
  const merged = [];
  for (const s of segs) { if (merged.length && s[0] - merged[merged.length - 1][1] <= 2) merged[merged.length - 1][1] = s[1]; else merged.push([s[0], s[1]]); }
  const out = [];
  // Lines packed so tightly that they touch: cut where the ink count dips well below the text on both sides.
  // A tall single line (a big heading) has no such dip, so it stays whole.
  const valleys = (a, b) => {
    const cuts = [];
    for (let y = a + 8; y < b - 8; y++) {
      let lo = Infinity; for (let i = Math.max(0, y - 2); i < Math.min(h, y + 3); i++) lo = Math.min(lo, k[i]);
      if (k[y] > lo) continue;
      let pl = 0, pr = 0; for (let i = Math.max(a, y - 26); i < y; i++) pl = Math.max(pl, k[i]); for (let i = y + 1; i < Math.min(b, y + 27); i++) pr = Math.max(pr, k[i]);
      if (k[y] < 0.4 * Math.min(pl, pr)) {
        if (cuts.length && y - cuts[cuts.length - 1] < 8) { if (k[y] < k[cuts[cuts.length - 1]]) cuts[cuts.length - 1] = y; } else cuts.push(y);
      }
    }
    const edges = [a, ...cuts, b], pieces = [];
    for (let i = 0; i < edges.length - 1; i++) if (edges[i + 1] - edges[i] >= 8) pieces.push([edges[i], edges[i + 1]]);
    return pieces;
  };
  // A barcode is far denser in ink than any line of text: judged on the whole stack, before it could be cut into text-sized slices.
  const barcode = (a, b) => {
    if (b - a <= 30) return false;
    let first = -1, last = -1, n = 0;
    for (let x = 0; x < w; x++) { let c = 0; for (let y = a; y < b; y++) c += ink[y * w + x]; if (c > 0) { if (first < 0) first = x; last = x; } n += c; }
    return first >= 0 && n / ((b - a) * (last - first + 1)) > 0.33;
  };
  for (const [a, b] of merged) if (b - a >= 8 && !barcode(a, b)) out.push(...(b - a > 38 ? valleys(a, b) : [[a, b]]));
  const boxes = [];
  for (const [a, b] of out) {
    const rh = b - a; if (rh > 90) continue;                      // a barcode or a picture, not text
    let first = -1, last = -1, total = 0;
    for (let x = 0; x < w; x++) { let c = 0; for (let y = a; y < b; y++) c += ink[y * w + x]; if (c > 0) { if (first < 0) first = x; last = x; } total += c; }
    if (first < 0 || last - first + 1 < 3) continue;
    const x0 = Math.max(0, first - 6), x1 = Math.min(w, last + 7);
    if (x1 - x0 < 10) continue;
    boxes.push([Math.max(0, a - 3), Math.min(h, b + 3), x0, x1]);
  }
  return boxes;
}

/** Crop [y0,y1,x0,x1] out of gray and resize it to height H (area average when shrinking, bilinear when growing). Float32 H*nw, 0..255. */
export function rowTensor(gray, w, box) {
  const [y0, y1, x0, x1] = box, ch = y1 - y0, cw = x1 - x0;
  const nw = Math.min(1024, Math.max(16, Math.round(cw * H / ch)));
  const out = new Float32Array(H * nw);
  const sy = ch / H, sx = cw / nw;
  for (let oy = 0; oy < H; oy++) for (let ox = 0; ox < nw; ox++) {
    let v;
    if (sy > 1 || sx > 1) {                                       // area average over the source footprint
      const ya = y0 + oy * sy, yb = ya + sy, xa = x0 + ox * sx, xb = xa + sx; let sum = 0, wt = 0;
      for (let y = Math.floor(ya); y < Math.ceil(yb); y++) { const wy = Math.min(y + 1, yb) - Math.max(y, ya); for (let x = Math.floor(xa); x < Math.ceil(xb); x++) { const wx = Math.min(x + 1, xb) - Math.max(x, xa); sum += gray[Math.min(y, y1 - 1) * w + Math.min(x, x1 - 1)] * wy * wx; wt += wy * wx; } }
      v = sum / wt;
    } else {                                                      // bilinear
      const fy = Math.min(Math.max(y0 + (oy + 0.5) * sy - 0.5, y0), y1 - 1), fx = Math.min(Math.max(x0 + (ox + 0.5) * sx - 0.5, x0), x1 - 1);
      const iy = Math.floor(fy), ix = Math.floor(fx), jy = Math.min(iy + 1, y1 - 1), jx = Math.min(ix + 1, x1 - 1), dy = fy - iy, dx = fx - ix;
      v = (gray[iy * w + ix] * (1 - dx) + gray[iy * w + jx] * dx) * (1 - dy) + (gray[jy * w + ix] * (1 - dx) + gray[jy * w + jx] * dx) * dy;
    }
    out[oy * nw + ox] = v;
  }
  return { data: out, width: nw };
}

/** Greedy CTC: scores (T x C, row-major) -> { text, conf }. conf is the weakest kept character's probability. */
export function decode(scores, T, C) {
  let prev = -1, text = '', conf = 1, kept = 0;
  for (let t = 0; t < T; t++) {
    let best = 0, mx = -Infinity;
    for (let c = 0; c < C; c++) { const v = scores[t * C + c]; if (v > mx) { mx = v; best = c; } }
    if (best !== prev && best !== 0) {
      let z = 0; for (let c = 0; c < C; c++) z += Math.exp(scores[t * C + c] - mx);
      conf = Math.min(conf, 1 / z); text += CHARS[best - 1]; kept++;
    }
    prev = best;
  }
  return { text, conf: kept ? conf : 0 };
}

// ---------- 3. which row is the total ----------
const MONEY = /(?:RM|\$|£|€)?\s?(\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})(?!\d)/g;
const TOTAL = /\b(TOTAL|AMOUNT DUE|BALANCE DUE|JUMLAH|GRAND|NETT|AMOUNT PAID|AMOUNT)\b/;
const NOT_TOTAL = /SUB[ -]?TOTAL|TOTAL ITEMS|ITEM COUNT|TOTAL QTY|SAVINGS|POINTS|DISCOUNT/;
const SUB = /SUB[ -]?TOTAL|\bSUBTOT/;
const NOT_PAYABLE = /CASH|CHANGE|TEND|DEBIT|CREDIT|VISA|MASTER|CARD|WALLET|\bTAX\b|GST|SST|VAT|ROUNDING|SERVICE|DISCOUNT|SAVINGS|POINTS|\bQR\b/;

/** The amounts in one row of text, as whole cents. "1,234.50" -> 123450; "12,50" -> 1250. */
export function amountsIn(text) {
  const out = []; MONEY.lastIndex = 0; let m;
  while ((m = MONEY.exec(text))) { const c = Number(m[1].replace(/,/g, '')) * 100 + Number(m[2]); if (c > 0 && c < 1e9) out.push(c); }
  return out;
}

/**
 * rows: [{ text, conf }] top to bottom -> { cents, source, text, conf } or null.
 * The TOTAL row wins; a row that says SUBTOTAL only counts when there is no TOTAL (some receipts print nothing else);
 * as a last resort the biggest amount that is not cash, change, tax or a card line, marked 'largest' so the caller can warn.
 */
export function findTotal(rows) {
  const r = rows.map((x) => ({ ...x, up: String(x.text).toUpperCase().replace(/\s+/g, ' ') }));
  const tier = (pick, source) => {
    const hits = [];
    for (const row of r) if (pick(row.up)) { const a = amountsIn(row.up); if (a.length) hits.push({ cents: a[a.length - 1], source, text: row.text, conf: row.conf }); }
    if (!hits.length) return null;
    const count = new Map(); for (const h of hits) count.set(h.cents, (count.get(h.cents) ?? 0) + 1);
    return hits.map((h) => ({ ...h, votes: count.get(h.cents) })).sort((a, b) => b.votes - a.votes)[0];   // the value printed most often; ties keep the first
  };
  const whole = (up) => TOTAL.test(up) && !NOT_TOTAL.test(up) && !/SUB/.test(up);
  const t1 = tier((up) => whole(up) && !/^AMOUNT\b(?! (DUE|PAID))/.test(up), 'total') ?? tier(whole, 'total');
  if (t1) return t1;
  const t2 = tier((up) => SUB.test(up), 'subtotal'); if (t2) return t2;
  // whole-number totals ("TOTAL: 557") are only trusted on a row that says TOTAL
  for (const row of r) if (whole(row.up)) { const m = /(?:^|[^\d:.,])(\d{1,6})\s*$/.exec(row.up); if (m && Number(m[1]) > 0) return { cents: Number(m[1]) * 100, source: 'total', text: row.text, conf: row.conf }; }
  let big = null;
  for (const row of r) { if (NOT_PAYABLE.test(row.up)) continue; for (const c of amountsIn(row.up)) if (!big || c > big.cents) big = { cents: c, source: 'largest', text: row.text, conf: row.conf }; }
  return big;
}

// ---------- 2. the model ----------
let session = null, loading = null;
/** Loads onnxruntime-web and the model once. onProgress(text) is optional. Throws a readable error when offline for the first time. */
export function load(onProgress = () => {}) {
  if (session) return Promise.resolve(session);
  return (loading ??= (async () => {
    onProgress('Loading the receipt reader…');
    const ort = await import(/* @vite-ignore */ `${ORT_URL}ort.wasm.min.mjs`).catch(() => { throw new Error('The receipt reader needs to download once (about 15 MB). Connect to the internet and try again.'); });
    ort.env.wasm.wasmPaths = ORT_URL; ort.env.wasm.numThreads = 1;     // one thread: works on every page, no cross-origin isolation needed
    const buf = await (await fetch(MODEL_URL)).arrayBuffer();
    const s = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
    session = { ort, s }; return session;
  })().catch((e) => { loading = null; throw e; }));
}

/** gray: Uint8ClampedArray of an image already resized to WIDTH wide (w = WIDTH). -> { rows: [{ text, conf, box }], total } */
export async function readGray(gray, w, h, onProgress = () => {}) {
  const { ort, s } = await load(onProgress);
  const boxes = cutRows(gray, w, h);
  const rows = [];
  for (let i = 0; i < boxes.length; i++) {
    onProgress(`Reading row ${i + 1} of ${boxes.length}…`);
    const { data, width } = rowTensor(gray, w, boxes[i]);
    const out = await s.run({ rows: new ort.Tensor('float32', data, [1, 1, H, width]) });
    const sc = out.scores; const { text, conf } = decode(sc.data, sc.dims[1], sc.dims[2]);
    rows.push({ text, conf, box: boxes[i] });
  }
  return { rows, total: findTotal(rows) };
}

/** A photo File/Blob -> the same. The photo is drawn at WIDTH pixels wide in a canvas and never leaves the device. */
export async function scan(file, onProgress = () => {}) {
  const bmp = await createImageBitmap(file);
  const hh = Math.max(1, Math.round(bmp.height * WIDTH / bmp.width));
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = hh;
  const g = canvas.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.fillStyle = '#fff'; g.fillRect(0, 0, WIDTH, hh);
  g.drawImage(bmp, 0, 0, WIDTH, hh); bmp.close?.();
  const px = g.getImageData(0, 0, WIDTH, hh).data, gray = new Uint8ClampedArray(WIDTH * hh);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
  return readGray(gray, WIDTH, hh, onProgress);
}
