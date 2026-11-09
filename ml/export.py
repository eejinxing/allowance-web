"""ckpt.pt -> ../models/receipt-reader.onnx, then checks that onnxruntime gives the same scores as PyTorch."""
import os, sys, numpy as np, torch
sys.path.insert(0, os.path.dirname(__file__))
from model import RowReader
here = os.path.dirname(os.path.abspath(__file__)); out = os.path.join(here, "..", "models", "receipt-reader.onnx")
os.makedirs(os.path.dirname(out), exist_ok=True)
m = RowReader(); m.load_state_dict(torch.load(os.path.join(here, "ckpt.pt"))); m.eval()
x = torch.rand(1, 1, 32, 240) * 255
torch.onnx.export(m, x, out, input_names=["rows"], output_names=["scores"], dynamic_axes={"rows": {3: "w"}, "scores": {1: "t"}}, opset_version=17, dynamo=False)
import onnxruntime as ort
s = ort.InferenceSession(out, providers=["CPUExecutionProvider"])
worst = 0
for w in (64, 240, 600, 1024):
    x = torch.rand(1, 1, 32, w) * 255
    a = m(x).detach().numpy(); b = s.run(None, {"rows": x.numpy()})[0]
    worst = max(worst, float(np.abs(a - b).max()))
print("wrote", os.path.normpath(out), os.path.getsize(out) // 1024, "KB; max |torch - onnxruntime| =", worst)
assert worst < 1e-3
