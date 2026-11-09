"""Shared pieces of the receipt reader: the alphabet, how a photo is cut into text rows, and the CTC decoder.
The row cutting here is mirrored line by line in js/receiptscan.js; keep the two in step."""
import numpy as np

# Everything a receipt amount row needs. Letters are upper case only (the model is case-blind: "Total" and "TOTAL" are the same label).
CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.,:$£€%#*-/@()& "
BLANK = 0                                  # CTC blank; class i+1 is CHARS[i]
NCLASS = len(CHARS) + 1
H = 32                                     # every row is resized to this height before it reaches the network
WIDTH = 720                                # every photo is resized to this width before rows are cut

def box_mean(a, r):
    """Mean over a (2r+1) square, edges use the pixels that exist. Same arithmetic as the JS version (summed-area table)."""
    h, w = a.shape
    s = np.zeros((h + 1, w + 1), np.float64)
    s[1:, 1:] = a.cumsum(0).cumsum(1)
    ys = np.arange(h); xs = np.arange(w)
    y0 = np.clip(ys - r, 0, h)[:, None]; y1 = np.clip(ys + r + 1, 0, h)[:, None]
    x0 = np.clip(xs - r, 0, w)[None, :]; x1 = np.clip(xs + r + 1, 0, w)[None, :]
    tot = s[y1, x1] - s[y0, x1] - s[y1, x0] + s[y0, x0]
    return tot / ((y1 - y0) * (x1 - x0))

def binarize(gray):
    """Ink mask: a pixel is ink when it is clearly darker than its neighbourhood. Works on crumpled paper and uneven light."""
    g = gray.astype(np.float64)
    return (g < box_mean(g, 12) - 14)

def cut_rows(gray):
    """gray: 2-D uint8 at any size -> (resized gray at WIDTH wide, list of (y0, y1, x0, x1) boxes, one per text row)."""
    import cv2
    h, w = gray.shape
    nh = max(1, round(h * WIDTH / w))
    g = cv2.resize(gray, (WIDTH, nh), interpolation=cv2.INTER_AREA if w > WIDTH else cv2.INTER_LINEAR)
    ink = binarize(g)
    prof = ink.sum(1).astype(np.float64)
    # smooth 3 rows
    k = np.convolve(prof, np.ones(3) / 3, mode="same")
    # A row of text is where the ink count is well above the page's usual text level; a fixed cut-off would join tightly packed lines.
    live = k[k > 0.006 * WIDTH]
    level = float(np.percentile(live, 75)) if len(live) else 0.0
    thr = max(2.0, 0.006 * WIDTH, 0.15 * level)
    on = k > thr
    segs = []; y = 0
    while y < nh:
        if on[y]:
            y0 = y
            while y < nh and on[y]: y += 1
            segs.append([y0, y])
        else: y += 1
    # merge segments separated by a tiny gap (the dot of an i, a colon)
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] <= 2: merged[-1][1] = s[1]
        else: merged.append(s)
    out = []
    def valleys(a, b):
        """Lines packed so tightly that they touch: cut where the ink count dips well below the text on both sides.
        A tall single line (a big heading) has no such dip, so it stays whole."""
        cuts = []
        for y in range(a + 8, b - 8):
            if k[y] > k[max(0, y - 2):y + 3].min(): continue
            pl = k[max(a, y - 26):y].max(); pr = k[y + 1:min(b, y + 27)].max()
            if k[y] < 0.4 * min(pl, pr):
                if cuts and y - cuts[-1] < 8:
                    if k[y] < k[cuts[-1]]: cuts[-1] = y
                else: cuts.append(y)
        edges = [a] + cuts + [b]
        return [(edges[i], edges[i + 1]) for i in range(len(edges) - 1) if edges[i + 1] - edges[i] >= 8]
    def barcode(a, b):
        """A barcode is far denser in ink than any line of text: judged on the whole stack before it could be cut into text-sized slices."""
        cols = np.where(ink[a:b].sum(0) > 0)[0]
        return b - a > 30 and len(cols) > 0 and ink[a:b, cols[0]:cols[-1] + 1].mean() > 0.33
    for a, b in merged:
        if b - a >= 8 and not barcode(a, b): out.extend(valleys(a, b) if b - a > 38 else [(a, b)])
    boxes = []
    for a, b in out:
        h_ = b - a
        if h_ > 90: continue                       # a barcode or a photo, not a line of text
        band = ink[a:b]
        cols = np.where(band.sum(0) > 0)[0]
        if len(cols) < 3: continue
        x0 = max(0, cols[0] - 6); x1 = min(WIDTH, cols[-1] + 7)
        if x1 - x0 < 10: continue
        pad = 3
        boxes.append((max(0, a - pad), min(nh, b + pad), x0, x1))
    return g, boxes

def row_tensor(g, box):
    """Crop a row and resize it to height H, keeping its shape. Returns float32 array (H, W) in 0..255."""
    import cv2
    y0, y1, x0, x1 = box
    crop = g[y0:y1, x0:x1]
    h, w = crop.shape
    nw = int(min(1024, max(16, round(w * H / h))))
    return cv2.resize(crop, (nw, H), interpolation=cv2.INTER_AREA if h > H else cv2.INTER_LINEAR).astype(np.float32)

def decode(logits):
    """logits (T, NCLASS) -> (text, confidence). Greedy CTC; confidence = lowest probability among kept characters (a single weak digit makes the whole read weak)."""
    e = np.exp(logits - logits.max(1, keepdims=True)); p = e / e.sum(1, keepdims=True)
    idx = p.argmax(1); prev = -1; text = []; conf = []
    for t, i in enumerate(idx):
        if i != prev and i != BLANK:
            text.append(CHARS[i - 1]); conf.append(p[t, i])
        prev = i
    return "".join(text), (float(min(conf)) if conf else 0.0)
