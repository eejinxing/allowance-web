"""A small CRNN: convolutions look at the pixels, a bidirectional LSTM reads the row left to right, CTC lines the output up with the text.
About 0.8 M parameters (3 MB), small enough to download once and run on a phone."""
import torch, torch.nn as nn
from common import NCLASS

def block(i, o): return [nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True)]

class RowReader(nn.Module):
    def __init__(self):
        super().__init__()
        self.cnn = nn.Sequential(
            *block(1, 32), nn.MaxPool2d(2, 2),                 # 16 x W/2
            *block(32, 64), nn.MaxPool2d(2, 2),                # 8 x W/4
            *block(64, 128), *block(128, 128), nn.MaxPool2d((2, 1), (2, 1)),   # 4 x W/4
            *block(128, 192), nn.MaxPool2d((2, 1), (2, 1)),    # 2 x W/4
            nn.Conv2d(192, 192, (2, 1), bias=False), nn.BatchNorm2d(192), nn.ReLU(inplace=True))   # 1 x W/4
        self.rnn = nn.LSTM(192, 96, bidirectional=True, batch_first=True)
        self.out = nn.Linear(192, NCLASS)

    def forward(self, x):
        """x: (B, 1, 32, W), pixel values 0..255, dark text on light paper. Returns (B, W/4, NCLASS) scores.
        The contrast stretch is part of the model so the phone and the training code feed it identical raw pixels."""
        lo = x.amin(dim=(1, 2, 3), keepdim=True); hi = x.amax(dim=(1, 2, 3), keepdim=True)
        x = (x - lo) / (hi - lo + 8.0)
        x = self.cnn((x - 0.5) * 2).squeeze(2).transpose(1, 2)
        return self.out(self.rnn(x)[0])
