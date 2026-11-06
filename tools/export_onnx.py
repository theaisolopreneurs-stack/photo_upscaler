"""Export Real-ESRGAN weights to ONNX. Developer-only: end users never run this.

Usage:
  python export_onnx.py x4plus  path/to/RealESRGAN_x4plus.pth     out/x4plus.onnx
  python export_onnx.py general path/to/realesr-general-x4v3.pth  out/general.onnx

The architectures are reimplemented here so export needs only PyTorch. They match
the Real-ESRGAN checkpoints (BSD-3-Clause; see THIRD_PARTY_NOTICES.md).
"""
import sys

import torch
from torch import nn
from torch.nn import functional as F


class DenseBlock(nn.Module):
    def __init__(self, f=64, g=32):
        super().__init__()
        self.conv1 = nn.Conv2d(f, g, 3, 1, 1)
        self.conv2 = nn.Conv2d(f + g, g, 3, 1, 1)
        self.conv3 = nn.Conv2d(f + 2 * g, g, 3, 1, 1)
        self.conv4 = nn.Conv2d(f + 3 * g, g, 3, 1, 1)
        self.conv5 = nn.Conv2d(f + 4 * g, f, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, f=64, g=32):
        super().__init__()
        self.rdb1 = DenseBlock(f, g)
        self.rdb2 = DenseBlock(f, g)
        self.rdb3 = DenseBlock(f, g)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, blocks=23, f=64, g=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, f, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(f, g) for _ in range(blocks)])
        self.conv_body = nn.Conv2d(f, f, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(f, f, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(f, f, 3, 1, 1)
        self.conv_hr = nn.Conv2d(f, f, 3, 1, 1)
        self.conv_last = nn.Conv2d(f, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


class SRVGGNetCompact(nn.Module):
    def __init__(self, f=64, convs=32, scale=4):
        super().__init__()
        self.scale = scale
        layers = [nn.Conv2d(3, f, 3, 1, 1), nn.PReLU(num_parameters=f)]
        for _ in range(convs):
            layers += [nn.Conv2d(f, f, 3, 1, 1), nn.PReLU(num_parameters=f)]
        layers += [nn.Conv2d(f, 3 * scale * scale, 3, 1, 1), nn.PixelShuffle(scale)]
        self.body = nn.Sequential(*layers)

    def forward(self, x):
        base = F.interpolate(x, scale_factor=self.scale, mode="nearest")
        return self.body(x) + base


def main():
    kind, weights, out = sys.argv[1:4]
    model = RRDBNet() if kind == "x4plus" else SRVGGNetCompact()
    # weights_only refuses arbitrary pickled code in the downloaded checkpoint.
    ckpt = torch.load(weights, map_location="cpu", weights_only=True)
    state = ckpt.get("params_ema") or ckpt.get("params") or ckpt
    model.load_state_dict(state, strict=True)
    model.eval()

    dummy = torch.rand(1, 3, 64, 64)
    with torch.no_grad():
        reference = model(dummy)
    assert reference.shape[-1] == 256, reference.shape

    torch.onnx.export(
        model,
        (dummy,),
        out,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input": {2: "height", 3: "width"},
            "output": {2: "out_height", 3: "out_width"},
        },
        opset_version=17,
        dynamo=False,
    )
    print(f"exported {kind} to {out}")


if __name__ == "__main__":
    main()
