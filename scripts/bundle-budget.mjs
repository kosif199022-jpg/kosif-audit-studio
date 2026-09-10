import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const ASSETS_DIR = path.join(process.cwd(), "dist", "client", "assets");
const ENTRY_LIMIT = 900_000;
const CSS_LIMIT = 320_000;
const JS_CHUNK_LIMIT = 1_100_000;

const entries = await readdir(ASSETS_DIR, { withFileTypes: true });
const rows = [];
for (const entry of entries) {
  if (!entry.isFile()) continue;
  const file = path.join(ASSETS_DIR, entry.name);
  const info = await stat(file);
  rows.push({ name: entry.name, bytes: info.size });
}

const failures = [];
const warnings = [];
const js = rows.filter((row) => /\.js$/i.test(row.name));
const css = rows.filter((row) => /\.css$/i.test(row.name));
const entryChunks = js.filter((row) => /^index-[^.]+\.js$/i.test(row.name));

for (const row of entryChunks) {
  if (row.bytes > ENTRY_LIMIT) failures.push(`${row.name} = ${row.bytes} bytes > entry budget ${ENTRY_LIMIT}`);
}
for (const row of js) {
  if (row.bytes > JS_CHUNK_LIMIT) failures.push(`${row.name} = ${row.bytes} bytes > JS chunk budget ${JS_CHUNK_LIMIT}`);
  else if (row.bytes > 500_000) warnings.push(`${row.name} كبير (${Math.round(row.bytes / 1024)} KiB)`);
}
for (const row of css) {
  if (row.bytes > CSS_LIMIT) failures.push(`${row.name} = ${row.bytes} bytes > CSS budget ${CSS_LIMIT}`);
}

const largest = [...rows].sort((a, b) => b.bytes - a.bytes).slice(0, 8);
console.log("Bundle budget — largest assets:");
for (const row of largest) console.log(`  ${row.name}: ${Math.round(row.bytes / 1024)} KiB`);
for (const warning of warnings) console.warn(`WARN ${warning}`);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Bundle budget: PASS (${js.length} JS chunks, ${css.length} CSS chunks).`);
}
