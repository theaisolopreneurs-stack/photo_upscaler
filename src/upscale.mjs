import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-node";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const MODELS = {
  natural: { file: "realesrgan-x4plus.onnx", scale: 4 },
  fast: { file: "general-x4v3.onnx", scale: 4 },
};

const TILE = 128;
const OVERLAP = 16;

function preferredBackends() {
  if (process.platform === "win32") return ["dml", "cpu"];
  if (process.platform === "darwin") return ["coreml", "cpu"];
  return ["cpu"];
}

export function modelPath(mode) {
  const model = MODELS[mode];
  if (!model) throw new Error(`Unknown mode "${mode}". Use: ${Object.keys(MODELS).join(", ")}`);
  return join(ROOT, "models", model.file);
}

async function runTile(session, data, height, width) {
  const input = new ort.Tensor("float32", data, [1, 3, height, width]);
  const results = await session.run({ input });
  return results.output;
}

/** Loads a model on the first backend that opens and returns a sane result. */
export async function loadModel(mode, requested = "auto") {
  const path = modelPath(mode);
  if (!existsSync(path)) throw new Error(`Model file missing: ${path}`);

  const backends = requested === "auto" ? preferredBackends() : [requested];
  const failures = [];
  for (const backend of backends) {
    try {
      const session = await ort.InferenceSession.create(path, {
        executionProviders: [backend],
        // DirectML requires both of these.
        executionMode: "sequential",
        enableMemPattern: backend !== "dml",
      });
      // Some GPU drivers load a model and then return NaNs, so test before trusting it.
      const probe = await runTile(session, new Float32Array(3 * 32 * 32).fill(0.5), 32, 32);
      if (!probe.data.every(Number.isFinite)) throw new Error("produced invalid values");
      return { session, backend, failures };
    } catch (error) {
      failures.push(`${backend}: ${error.message}`);
    }
  }
  throw new Error(`No usable backend. ${failures.join("; ")}`);
}

/** Tile start positions covering `size`, all the same length where the image allows it. */
export function tileStarts(size, tile = TILE, overlap = OVERLAP) {
  if (size <= tile) return [0];
  const step = tile - overlap * 2;
  const starts = [];
  for (let start = 0; start + tile < size; start += step) starts.push(start);
  starts.push(size - tile);
  return starts;
}

/** Weight falling off towards the tile edge, except on edges touching the image border. */
function edgeWeight(pos, length, feather, atStart, atEnd) {
  let weight = 1;
  if (!atStart && pos < feather) weight = (pos + 0.5) / feather;
  if (!atEnd && length - 1 - pos < feather) {
    weight = Math.min(weight, (length - 1 - pos + 0.5) / feather);
  }
  return weight;
}

async function superResolve(session, rgb, width, height, scale, onProgress) {
  const outW = width * scale;
  const outH = height * scale;
  const sum = new Float32Array(outW * outH * 3);
  const totals = new Float32Array(outW * outH);
  const xs = tileStarts(width);
  const ys = tileStarts(height);
  const feather = OVERLAP * scale;
  const count = xs.length * ys.length;
  let done = 0;

  for (const y0 of ys) {
    const th = Math.min(TILE, height);
    for (const x0 of xs) {
      const tw = Math.min(TILE, width);
      const tile = new Float32Array(3 * th * tw);
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const src = ((y0 + y) * width + x0 + x) * 3;
          const dst = y * tw + x;
          tile[dst] = rgb[src] / 255;
          tile[th * tw + dst] = rgb[src + 1] / 255;
          tile[2 * th * tw + dst] = rgb[src + 2] / 255;
        }
      }

      const { data, dims } = await runTile(session, tile, th, tw);
      const oh = dims[2];
      const ow = dims[3];
      const X0 = x0 * scale;
      const Y0 = y0 * scale;
      const atLeft = x0 === 0;
      const atRight = x0 + tw >= width;
      const atTop = y0 === 0;
      const atBottom = y0 + th >= height;
      for (let y = 0; y < oh; y++) {
        const wy = edgeWeight(y, oh, feather, atTop, atBottom);
        for (let x = 0; x < ow; x++) {
          const w = wy * edgeWeight(x, ow, feather, atLeft, atRight);
          const src = y * ow + x;
          const dstPixel = (Y0 + y) * outW + X0 + x;
          sum[dstPixel * 3] += data[src] * w;
          sum[dstPixel * 3 + 1] += data[oh * ow + src] * w;
          sum[dstPixel * 3 + 2] += data[2 * oh * ow + src] * w;
          totals[dstPixel] += w;
        }
      }
      done++;
      onProgress?.(done, count);
    }
  }

  const output = Buffer.alloc(outW * outH * 3);
  for (let i = 0; i < totals.length; i++) {
    const t = totals[i] || 1;
    for (let c = 0; c < 3; c++) {
      const v = (sum[i * 3 + c] / t) * 255;
      output[i * 3 + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return { output, outW, outH, tiles: count };
}

const luma = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * Downscales the result to source size and compares brightness, so large invented or
 * shifted structures show up. It cannot catch fine invented texture.
 */
export async function fidelityScores(sourceRgb, width, height, outputPng, gridSize = 32) {
  const down = await sharp(outputPng)
    .resize(width, height, { kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const psnr = (mse) => (mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse));
  let total = 0;
  let worst = 0;
  for (let gy = 0; gy < height; gy += gridSize) {
    for (let gx = 0; gx < width; gx += gridSize) {
      let cellError = 0;
      let cellCount = 0;
      for (let y = gy; y < Math.min(gy + gridSize, height); y++) {
        for (let x = gx; x < Math.min(gx + gridSize, width); x++) {
          const i = (y * width + x) * 3;
          const diff = luma(sourceRgb, i) - luma(down, i);
          cellError += diff * diff;
          cellCount++;
        }
      }
      total += cellError;
      worst = Math.max(worst, cellError / cellCount);
    }
  }
  return {
    overallPsnr: Number(psnr(total / (width * height)).toFixed(2)),
    worstTilePsnr: Number(psnr(worst).toFixed(2)),
  };
}

/** Upscales one photo. `scale` is the final enlargement and must be above 1, at most 4. */
export async function upscaleFile({ input, output, mode = "natural", scale = 2, backend = "auto", onProgress }) {
  if (!(scale > 1 && scale <= 4)) throw new Error("scale must be above 1 and at most 4");
  const started = Date.now();
  const loaded = await loadModel(mode, backend);

  const { data: rgb, info } = await sharp(input)
    .rotate()
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const modelScale = MODELS[mode].scale;
  const { output: big, outW, outH, tiles } = await superResolve(
    loaded.session, rgb, info.width, info.height, modelScale, onProgress,
  );
  await loaded.session.release();

  const raw = { raw: { width: outW, height: outH, channels: 3 } };
  const png = await sharp(big, raw).png({ compressionLevel: 1 }).toBuffer();
  const fidelity = await fidelityScores(rgb, info.width, info.height, png);

  const width = Math.round(info.width * scale);
  const height = Math.round(info.height * scale);
  mkdirSync(dirname(output), { recursive: true });
  let result = sharp(png);
  if (scale !== modelScale) result = result.resize(width, height, { kernel: "lanczos3" });
  await result.jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: false }).toFile(output);

  return {
    input,
    output,
    mode,
    backend: loaded.backend,
    backendFailures: loaded.failures,
    sourceSize: `${info.width}x${info.height}`,
    outputSize: `${width}x${height}`,
    tiles,
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    fidelity,
  };
}

export async function systemCheck() {
  const checks = {};
  for (const mode of Object.keys(MODELS)) {
    checks[mode] = existsSync(modelPath(mode));
  }
  const backends = {};
  if (checks.fast) {
    for (const backend of [...new Set(preferredBackends())]) {
      const started = Date.now();
      try {
        const { session } = await loadModel("fast", backend);
        await session.release();
        backends[backend] = { ok: true, ms: Date.now() - started };
      } catch (error) {
        backends[backend] = { ok: false, error: error.message };
      }
    }
  }
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    onnxruntime: ort.env.versions?.common ?? "unknown",
    modelsPresent: checks,
    backends,
  };
}
