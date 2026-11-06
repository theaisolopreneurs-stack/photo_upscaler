#!/usr/bin/env node
import { systemCheck, upscaleFile } from "./src/upscale.mjs";

const [command, ...rest] = process.argv.slice(2);

function parse(args) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) flags[args[i].slice(2)] = args[++i];
    else positional.push(args[i]);
  }
  return { positional, flags };
}

if (command === "check") {
  console.log(JSON.stringify(await systemCheck(), null, 2));
} else if (command === "upscale") {
  const { positional: [input, output], flags } = parse(rest);
  if (!input || !output) {
    console.error("Usage: photo-upscaler upscale <input> <output.jpg> [--mode natural|fast] [--scale 2] [--backend auto|dml|coreml|cpu]");
    process.exit(2);
  }
  const result = await upscaleFile({
    input,
    output,
    mode: flags.mode,
    scale: flags.scale ? Number(flags.scale) : undefined,
    backend: flags.backend,
    onProgress: (done, total) => process.stderr.write(`\rtile ${done}/${total}`),
  });
  process.stderr.write("\n");
  console.log(JSON.stringify(result, null, 2));
} else {
  console.error("Commands: check, upscale");
  process.exit(2);
}
