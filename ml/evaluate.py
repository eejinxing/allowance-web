"""Runs the exported model on the real photos and prints what it reads. Writes ocr_rows.json for score.mjs, which applies the app's own total-finding code.
Usage: python evaluate.py [folder]"""
import os, sys, json, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from common import cut_rows, row_tensor, decode
import onnxruntime as ort
try: import pillow_avif  # noqa
except Exception: pass
folder = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\Jinwang\Desktop\receipt"
here = os.path.dirname(os.path.abspath(__file__))
s = ort.InferenceSession(os.path.join(here, "..", "models", "receipt-reader.onnx"), providers=["CPUExecutionProvider"])
labels = json.load(open(os.path.join(here, "real_labels.json")))
res = {}
for name in labels:
    if name.startswith("_"): continue
    im = np.array(Image.open(os.path.join(folder, name)).convert("L"))
    g, boxes = cut_rows(im); rows = []
    for b in boxes:
        t = row_tensor(g, b)[None, None]
        sc = s.run(None, {"rows": t})[0][0]
        text, conf = decode(sc); rows.append({"text": text, "conf": round(conf, 3), "box": list(map(int, b))})
    res[name] = rows
    print(f"\n== {name}: {len(rows)} rows")
    for r in rows: print(f"  {r['conf']:.2f}  {r['text']}")
json.dump(res, open(os.path.join(here, "ocr_rows.json"), "w"), indent=1)
