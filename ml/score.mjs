// Scores the model on the real photos: for each, did the app's total-finder get the right amount, and was the printed total row read exactly?
// Run `python evaluate.py` first (it writes ocr_rows.json from the exported ONNX model).
import fs from 'node:fs';
import { findTotal } from '../js/receiptscan.js';
const labels = JSON.parse(fs.readFileSync(new URL('./real_labels.json', import.meta.url)));
const rows = JSON.parse(fs.readFileSync(new URL('./ocr_rows.json', import.meta.url)));
const squash = (s) => String(s).toUpperCase().replace(/[^0-9A-Z.,:$£€]/g, '');
let money = 0, moneyOk = 0, rowOk = 0, n = 0, wrongOnNonMoney = 0;
for (const [name, want] of Object.entries(labels)) {
  if (name.startsWith('_')) continue;
  const got = findTotal(rows[name]); n++;
  const rowHit = rows[name].some((r) => squash(r.text).includes(want.row.replace(/[^0-9A-Z.,:$£€]/g, '')));
  rowOk += rowHit;
  if (want.cents != null) { money++; if (got?.cents === want.cents) moneyOk++; }
  else if (got && /\d[.,]\d\d/.test(got.text)) wrongOnNonMoney++;
  console.log(`${want.cents != null ? (got?.cents === want.cents ? 'OK  ' : 'MISS') : 'n/a '} row ${rowHit ? 'exact' : 'off  '}  want ${want.cents ?? '-'}  got ${got ? `${got.cents} (${got.source}, conf ${got.conf.toFixed(2)}, "${got.text}")` : 'nothing'}   [${want.kind}]`);
}
console.log(`\nmoney receipts: total correct ${moneyOk}/${money}; printed total row read exactly in ${rowOk}/${n} photos`);
