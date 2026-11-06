# Photo Upscaler

Upscale photos with AI on your own computer, from inside Claude. Early proof of concept, not ready for release.

See [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) for the plan and current test results.

## Developer setup

Models aren't stored in git. Export them to `models/` with `tools/export_onnx.py`, which needs PyTorch, an ONNX package and the official Real-ESRGAN weights. Then:

```bash
npm install
npm test
node cli.mjs check
node cli.mjs upscale input.jpg output.jpg --mode fast
```

Build the bundle with `npx @anthropic-ai/mcpb pack . dist/photo-upscaler.mcpb`.

`poc-comparison.jpg` panels, left to right: true photo, plain resize of the low-quality copy, Fast, Natural. The source photo is CC0, from Wikimedia Commons (Ossian Sweet House interior).
