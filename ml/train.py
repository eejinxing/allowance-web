"""Train the row reader on synthetic rows. Usage: python train.py [steps] [batch]
Prints exact-match accuracy on a fixed synthetic validation set every 500 steps, and saves ckpt.pt."""
import sys, os, time, random
import numpy as np, torch, torch.nn as nn
from torch.utils.data import IterableDataset, DataLoader, get_worker_info
sys.path.insert(0, os.path.dirname(__file__))
import synth
from common import CHARS, BLANK, decode
from model import RowReader

RECEIPTS = os.environ.get("RECEIPT_DIR", r"C:\Users\Jinwang\Desktop\receipt")
C2I = {c: i + 1 for i, c in enumerate(CHARS)}

class Rows(IterableDataset):
    def __init__(self, seed): self.seed = seed
    def __iter__(self):
        wi = get_worker_info(); g = synth.Gen(self.seed * 1000 + (wi.id if wi else 0), maxw=640)
        synth.load_bands(RECEIPTS)
        while True: yield g()

def collate(batch):
    w = max(im.shape[1] for im, _ in batch); w += (-w) % 4
    x = np.zeros((len(batch), 1, 32, w), np.float32)
    for i, (im, _) in enumerate(batch):
        x[i, 0, :, :im.shape[1]] = im
        x[i, 0, :, im.shape[1]:] = im[:, -1:]                  # pad by repeating the last column: keeps the contrast range unchanged
    labs = [torch.tensor([C2I[c] for c in l]) for _, l in batch]
    return torch.from_numpy(x), torch.cat(labs), torch.tensor([len(l) for l in labs]), [im.shape[1] for im, _ in batch], [l for _, l in batch]

def amounts_ok(a, b):
    import re
    f = lambda s: re.findall(r"\d[\d,]*[.,]\d\d", s)
    return f(a) == f(b)

@torch.no_grad()
def validate(model, val):
    model.eval(); ok = 0; amt = 0; n = 0; cer_e = 0; cer_n = 0
    for i in range(0, len(val), 100):
        b = collate(val[i:i + 100]); out = model(b[0])
        for j in range(out.shape[0]):
            t, _ = decode(out[j, :b[3][j] // 4].numpy()); ref = b[4][j]
            ok += t == ref; amt += amounts_ok(t, ref); n += 1
    model.train(); return ok / n, amt / n

def main():
    steps = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
    bs = int(sys.argv[2]) if len(sys.argv) > 2 else 48
    torch.manual_seed(0); torch.set_num_threads(10)
    synth.load_bands(RECEIPTS)
    g = synth.Gen(424242); val = [g() for _ in range(600)]
    model = RowReader(); print("parameters", sum(p.numel() for p in model.parameters()))
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-2)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=steps, pct_start=0.1)
    ctc = nn.CTCLoss(blank=BLANK, zero_infinity=True)
    dl = DataLoader(Rows(1), batch_size=bs, collate_fn=collate, num_workers=5, prefetch_factor=4, persistent_workers=True)
    t0 = time.time(); run = 0
    for step, (x, tg, tl, widths, _) in enumerate(dl, 1):
        out = model(x).log_softmax(2).transpose(0, 1)          # (T, B, C)
        il = torch.tensor([w // 4 for w in widths])
        loss = ctc(out, tg, il, tl)
        opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(model.parameters(), 5.0); opt.step(); sched.step()
        run = loss.item() if step == 1 else run * 0.98 + loss.item() * 0.02
        if step % 100 == 0: print(f"step {step} loss {run:.3f} {time.time() - t0:.0f}s", flush=True)
        if step % 500 == 0 or step == steps:
            acc, amt = validate(model, val); print(f"  VAL synthetic rows: exact {acc:.3f}  amounts {amt:.3f}", flush=True)
            torch.save(model.state_dict(), os.path.join(os.path.dirname(__file__), "ckpt.pt"))
        if step >= steps: break

if __name__ == "__main__":
    main()
