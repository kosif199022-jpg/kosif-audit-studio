import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist", "client");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const excluded = new Set([".git", "node_modules", "dist", "tests", ".wrangler"]);
const entries = await readdir(root, { withFileTypes: true });

await Promise.all(entries
  .filter((entry) => !excluded.has(entry.name) && entry.name !== "scripts")
  .map((entry) => cp(
    path.join(root, entry.name),
    path.join(output, entry.name),
    { recursive: true, force: true }
  )));

console.log("Cloudflare Pages bundle ready: dist/client");
