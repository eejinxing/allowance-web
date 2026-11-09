"""Makes unlimited labelled receipt rows: text drawn in real fonts onto paper, then degraded the way a phone photo degrades it.
Nine photos cannot teach a network to read digits, so the rows are synthetic; the photos supply the paper (blank bands cut out
between their text rows) and, in evaluate.py, the real test."""
import os, random, glob
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
from common import CHARS, H, cut_rows

FONT_DIR = r"C:\Windows\Fonts"
MONO = ["consola.ttf", "consolab.ttf", "cour.ttf", "courbd.ttf", "lucon.ttf", "CascadiaMono.ttf", "OCRAEXT.TTF"]
SANS = ["arial.ttf", "arialbd.ttf", "ARIALN.TTF", "calibri.ttf", "calibrib.ttf", "segoeui.ttf", "segoeuib.ttf", "tahoma.ttf", "tahomabd.ttf", "verdana.ttf", "bahnschrift.ttf", "impact.ttf"]
FONTS = [os.path.join(FONT_DIR, f) for f in MONO + SANS if os.path.exists(os.path.join(FONT_DIR, f))]

WORDS = """BREAD MILK EGGS BUTTER CHEESE RICE NOODLES CHICKEN BEEF PORK FISH PRAWN TOFU COFFEE TEA JUICE WATER COLA SODA BEER WINE
SUGAR SALT FLOUR OIL SAUCE SOY CHILI GARLIC ONION POTATO TOMATO CARROT APPLE ORANGE BANANA GRAPES CEREAL CUPCAKES BISCUIT CHOCOLATE SNACK
NASI LEMAK TEH TARIK ROTI CANAI MEE GORENG AYAM KOPI SUSU TELUR IKAN SAYUR BUNGKUS MINYAK GULA GARAM BERAS KICAP
SHAMPOO SOAP TISSUE DETERGENT TOOTHPASTE BATTERY CABLE NOTEBOOK PEN BAG SHIRT SOCKS PIZZA BURGER FRIES SALAD SANDWICH LATTE MOCHA
GV PNT BUTTR PARM CHNK CHKN FOLGERS TWIST ORGANIC LARGE SMALL MEDIUM PACK ITEM DESCRIPTION SERVICE DELIVERY PARKING TOLL PETROL FUEL""".split()
SHOP = ["SUPERMARKET", "MINI MARKET", "99 SPEEDMART", "FAMILY MART", "TESCO", "AEON", "WALMART", "CAFE", "RESTORAN", "PHARMACY", "STATIONERY", "PETRONAS", "KEDAI RUNCIT"]
STREET = ["JALAN", "LORONG", "TAMAN", "STREET", "AVENUE", "ROAD", "DRIVE", "BANDAR", "KUALA LUMPUR", "TAMPA FL", "SELANGOR", "PENANG", "JOHOR"]
TOTAL_LABELS = ["TOTAL", "TOTAL", "TOTAL", "TOTAL:", "GRAND TOTAL", "TOTAL DUE", "AMOUNT DUE", "BALANCE DUE", "TOTAL PURCHASE", "TOTAL AMOUNT", "NET TOTAL", "TOTAL (RM)",
                "TOTAL RM", "JUMLAH", "JUMLAH BESAR", "AMOUNT", "AMOUNT PAID", "TOTAL SALES", "TOTAL PAYABLE", "NETT", "BILL TOTAL", "TOTAL INCL TAX"]
OTHER_LABELS = ["SUBTOTAL", "SUB TOTAL", "SUB-TOTAL", "SUBTOTAL:", "CASH", "CASH TENDERED", "CHANGE", "CHANGE DUE", "TAX", "GST 6%", "SST 8%", "TAX 1 7.000 %", "VAT 20%",
                "SERVICE CHARGE 10%", "ROUNDING", "DISCOUNT", "CREDIT", "VISA", "MASTERCARD", "DEBIT TEND", "TENDER", "EFT DEBIT", "TNG EWALLET", "SAVINGS", "POINTS EARNED", "ITEM COUNT", "TOTAL ITEMS", "TOTAL QTY", "DELIVERY FEE"]
TRAIL = ["", "", "", "", "", " N", " F", " X", " O", " T", " S"]
THANKS = ["THANK YOU", "THANK YOU FOR VISITING!", "THANK YOU. PLEASE COME AGAIN", "CUSTOMER COPY", "WELCOME", "SAVE MONEY. LIVE BETTER."]

def amount_value(rng):
    r = rng.random()
    if r < 0.45: v = rng.uniform(0.5, 30)
    elif r < 0.8: v = rng.uniform(10, 200)
    elif r < 0.95: v = rng.uniform(100, 1500)
    else: v = rng.uniform(1000, 9999)
    return round(v, 2)

def amount_text(rng, cur_ok=True):
    v = amount_value(rng)
    r = rng.random()
    if r < 0.06: s = str(int(v))
    elif r < 0.10: s = f"{v:.2f}".replace(".", ",")
    elif v >= 1000 and r < 0.55: s = f"{v:,.2f}"
    else: s = f"{v:.2f}"
    if rng.random() < 0.02: s = "-" + s
    cur = ""
    if cur_ok and rng.random() < 0.5:
        cur = rng.choice(["RM", "RM", "RM ", "$", "$", "£", "£", "€", "RM", "$ "])
    return cur + s + rng.choice(TRAIL)

def digits(rng, n): return "".join(rng.choice("0123456789") for _ in range(n))

def line_text(rng):
    """-> (left, middle, right): drawn left-aligned, in between, and right-aligned; the label is their reading order."""
    r = rng.random()
    if r < 0.30:                                               # item row
        q = rng.choice(["", "", "1", "2", "3", "01", "02", "1 x", "2 x"])
        name = " ".join(rng.choice(WORDS) for _ in range(rng.choice([1, 1, 2, 2, 3])))
        mid = rng.choice(["", "", "", digits(rng, rng.choice([8, 12, 13])), rng.choice(["1", "2", "3"])])
        return (q + " " + name).strip(), mid, amount_text(rng, cur_ok=rng.random() < 0.3)
    if r < 0.62:                                               # total family: the row the app cares about
        lab = rng.choice(TOTAL_LABELS if rng.random() < 0.5 else OTHER_LABELS)
        if rng.random() < 0.3 and not lab.endswith(":"): lab += ":"
        return lab, "", amount_text(rng, cur_ok=True)
    if r < 0.72:                                               # shop name / address / thanks
        t = rng.random()
        if t < 0.3: return rng.choice(SHOP) + (" " + rng.choice(["SDN BHD", "STORE", "#" + digits(rng, 3)]) if rng.random() < .5 else ""), "", ""
        if t < 0.6: return f"{rng.randint(1, 999)} {rng.choice(STREET)} {rng.choice(WORDS)}", "", ""
        return rng.choice(THANKS + ["GST ID NO: " + digits(rng, 12), "CASHIER: " + rng.choice(WORDS), "# ITEMS SOLD " + str(rng.randint(1, 40))]), "", ""
    if r < 0.88:                                               # numbers: dates, phones, cards, order ids
        t = rng.random()
        if t < 0.2: return f"{rng.randint(1,28):02d}/{rng.randint(1,12):02d}/{rng.choice(['11','2024','2025','23'])}", "", f"{rng.randint(0,23):02d}:{rng.randint(0,59):02d}:{rng.randint(0,59):02d}"
        if t < 0.4: return f"({digits(rng,3)}) {digits(rng,3)}-{digits(rng,4)}", "", ""
        if t < 0.55: return "CARD #: " + rng.choice(["**** **** **** ", "************", "****"]) + digits(rng, 4), "", ""
        if t < 0.7: return "TEL: " + digits(rng, 3) + "-" + digits(rng, 7), "", ""
        if t < 0.85: return "TRANS #", "", digits(rng, rng.choice([9, 12]))
        return rng.choice(["ORDER #", "INV NO:", "REF #", "AUTH CODE:", "ST#"]) + " " + digits(rng, rng.choice([4, 6, 8])), "", ""
    t = rng.random()                                           # receiptify-style: whole numbers and m:ss
    if t < 0.5: return rng.choice(["TOTAL:", "ITEM COUNT:", "TOTAL"]), "", f"{rng.randint(1,99)}:{rng.randint(0,59):02d}"
    if t < 0.8: return rng.choice(["TOTAL:", "TOTAL"]), "", str(rng.randint(1, 999))
    return f"{rng.randint(1,10):02d}  " + " ".join(rng.choice(WORDS) for _ in range(rng.choice([1, 2, 3]))) + " - " + rng.choice(WORDS), "", f"{rng.randint(1,6)}:{rng.randint(0,59):02d}"

def label_of(parts):
    s = " ".join(p.strip() for p in parts if p.strip())
    return "".join(c for c in s.upper() if c in CHARS)

# ---------- paper ----------
_BANDS = None
def load_bands(folder):
    """Blank strips of paper cut from the real photos: the gaps between their text rows."""
    global _BANDS
    _BANDS = []
    for f in sorted(glob.glob(os.path.join(folder, "*"))):
        try: im = np.array(Image.open(f).convert("L"))
        except Exception: continue
        g, boxes = cut_rows(im)
        prev = 0
        for (y0, y1, _, _) in boxes + [(g.shape[0], g.shape[0], 0, 0)]:
            if y0 - prev >= 24: _BANDS.append(g[prev + 3:y0 - 3])
            prev = max(prev, y1)
    return len(_BANDS)

def paper(rng, w, h):
    if _BANDS and rng.random() < 0.45:
        b = rng.choice(_BANDS)
        bh, bw = b.shape
        if bh >= 6:
            sc = max(h / bh, 1.0) * rng.uniform(1.0, 1.6)
            b2 = cv2.resize(b, (max(w, int(bw * sc)), max(h, int(bh * sc))), interpolation=cv2.INTER_LINEAR)
            if rng.random() < 0.5: b2 = b2[:, ::-1]
            y = rng.randint(0, b2.shape[0] - h); x = rng.randint(0, b2.shape[1] - w)
            return b2[y:y + h, x:x + w].astype(np.float32)
    a = np.full((h, w), rng.uniform(165, 255), np.float32)
    if rng.random() < 0.6:                                     # crumples / uneven light: a smooth random field
        nz = np.random.RandomState(rng.randint(0, 2**31 - 1)).randn(max(2, h // 8), max(2, w // 24)).astype(np.float32)
        a += cv2.resize(nz, (w, h), interpolation=cv2.INTER_CUBIC) * rng.uniform(2, 14)
    if rng.random() < 0.4:
        a += np.linspace(0, rng.uniform(-30, 30), w, dtype=np.float32)[None, :]
    return a

def render(rng):
    """-> (float32 image (H, W) in 0..255, label)."""
    left, mid, right = line_text(rng)
    font_path = rng.choice(FONTS)
    font = ImageFont.truetype(font_path, rng.choice([18, 20, 22, 24, 26, 28, 32, 36, 40]))
    sw = 1 if (rng.random() < 0.15 and not font_path.lower().endswith(("b.ttf", "bd.ttf"))) else 0
    def width(s): return int(font.getlength(s)) if s else 0
    wl, wm, wr = width(left), width(mid), width(right)
    minw = wl + wm + wr + (rng.randint(10, 40) if (right and (left or mid)) else 0) + (rng.randint(10, 40) if mid else 0) + 16
    W = min(1100, max(minw, rng.choice([minw, rng.randint(300, 760)])))
    asc, desc = font.getmetrics(); Hh = asc + desc + rng.randint(4, 14)
    img = Image.new("L", (W, Hh), 255)
    d = ImageDraw.Draw(img)
    y = (Hh - asc - desc) // 2
    mx = rng.randint(4, 14)
    if left: d.text((mx, y), left, font=font, fill=0, stroke_width=sw)
    if right: d.text((W - mx - wr, y), right, font=font, fill=0, stroke_width=sw)
    if mid: d.text((int(mx + wl + max(0, W - 2 * mx - wl - wr - wm) * rng.uniform(0.3, 0.7)), y), mid, font=font, fill=0, stroke_width=sw)
    ink = 1 - np.array(img, np.float32) / 255.0                # 1 where there is ink
    M = cv2.getRotationMatrix2D((W / 2, Hh / 2), rng.uniform(-1.6, 1.6), 1.0); M[0, 0] *= rng.uniform(0.9, 1.1)
    ink = cv2.warpAffine(ink, M, (W, Hh), flags=cv2.INTER_LINEAR, borderValue=0)
    if rng.random() < 0.35:                                    # dot-matrix / worn thermal print: gaps in the ink
        ink *= (np.random.RandomState(rng.randint(0, 2**31 - 1)).rand(Hh, W) > rng.uniform(0.02, 0.18)).astype(np.float32)
    if rng.random() < 0.4: ink = cv2.GaussianBlur(ink, (0, 0), rng.uniform(0.4, 1.3))
    dark = rng.uniform(0.6, 1.0)
    bg = paper(rng, W, Hh)
    out = bg * (1 - ink * dark) if rng.random() < 0.85 else bg - ink * dark * 200
    if rng.random() < 0.18:                                    # a sliver of the neighbouring row, as a tight crop catches
        sl = rng.randint(1, 4)
        band = (np.random.RandomState(rng.randint(0, 2**31 - 1)).rand(sl, W) < 0.25).astype(np.float32)
        if rng.random() < 0.5: out[:sl] -= band * 150
        else: out[-sl:] -= band * 150
    if rng.random() < 0.5:                                     # low resolution
        f = rng.uniform(0.45, 0.9)
        out = cv2.resize(cv2.resize(out, (max(8, int(W * f)), max(6, int(Hh * f))), interpolation=cv2.INTER_AREA), (W, Hh), interpolation=cv2.INTER_LINEAR)
    out = (out - 128) * rng.uniform(0.6, 1.2) + 128 + rng.uniform(-25, 25)
    out += np.random.RandomState(rng.randint(0, 2**31 - 1)).randn(Hh, W).astype(np.float32) * rng.uniform(0, 7)
    out = np.clip(out, 0, 255).astype(np.uint8)
    if rng.random() < 0.5:
        ok, enc = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, rng.randint(30, 90)]); out = cv2.imdecode(enc, 0)
    out = out.astype(np.float32)
    px = rng.randint(3, 10)                                    # trim to the ink with padding, like the real pipeline
    cols = np.where(ink.sum(0) > 0.5)[0]
    if len(cols) > 2: out = out[:, max(0, cols[0] - px):min(W, cols[-1] + px + 1)]
    h, w = out.shape
    nw = int(min(1024, max(16, round(w * H / h))))
    out = cv2.resize(out, (nw, H), interpolation=cv2.INTER_AREA if h > H else cv2.INTER_LINEAR)
    return out, label_of([left, mid, right])

class Gen:
    def __init__(self, seed, maxw=1024): self.rng = random.Random(seed); self.maxw = maxw
    def __call__(self):
        while True:
            img, lab = render(self.rng)
            if lab and img.shape[1] <= self.maxw: return img, lab
