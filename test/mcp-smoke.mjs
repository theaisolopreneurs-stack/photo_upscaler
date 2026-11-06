// Starts the MCP server over stdio like Claude does, and calls each tool once.
// Usage: node test/mcp-smoke.mjs <server-entry> <input-photo> <output-photo>
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [entry, input, output] = process.argv.slice(2);
const client = new Client({ name: "smoke-test", version: "0.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry] }));

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

const check = await client.callTool({ name: "system_check", arguments: {} });
console.log(check.content[0].text);

const result = await client.callTool(
  { name: "upscale_image", arguments: { input, output, mode: "fast" } },
  undefined,
  { timeout: 300000 },
);
console.log(result.isError ? "ERROR" : "ok", result.content[0].text);
await client.close();
if (result.isError) process.exit(1);
