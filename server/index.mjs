import { basename, dirname, extname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { systemCheck, upscaleFile } from "../src/upscale.mjs";

const server = new McpServer({ name: "photo-upscaler", version: "0.1.0" });

const asText = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });

server.registerTool(
  "system_check",
  {
    description: "Report this computer's platform, the AI backends that work, and whether models are installed.",
    annotations: { readOnlyHint: true },
  },
  async () => asText(await systemCheck()),
);

server.registerTool(
  "upscale_image",
  {
    description:
      "Upscale one local photo with a faithful AI model, running on this computer. Returns the output path, the backend used and fidelity scores. A large photo can take minutes without a capable graphics chip.",
    inputSchema: {
      input: z.string().describe("Absolute path of the source photo"),
      output: z.string().optional().describe("Absolute output path; defaults to <name>_upscaled.jpg beside the source"),
      mode: z.enum(["natural", "fast"]).default("natural").describe("natural: best quality. fast: for previews and slower computers."),
      scale: z.number().gt(1).max(4).default(2).describe("Final enlargement. 2 suits most uses."),
    },
  },
  async ({ input, output, mode, scale }) => {
    const target = output ?? join(dirname(input), `${basename(input, extname(input))}_upscaled.jpg`);
    return asText(await upscaleFile({ input, output: target, mode, scale }));
  },
);

await server.connect(new StdioServerTransport());
