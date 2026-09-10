import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["src", "worker", "scripts", "db"];
const SCANNED_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".css", ".sql", ".html", ".json"]);
const CLIENT_PREFIXES = ["src/", "public/"];
const APP_SOFT_LIMIT = 145_000;
const APP_HARD_LIMIT = 160_000;

const failures = [];
const warnings = [];
let scannedFiles = 0;
let scannedBytes = 0;

function normalizedPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

async function walk(directory) {
  const absolute = path.join(ROOT, directory);
  let entries;
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".git")) continue;
    const next = path.join(absolute, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path.relative(ROOT, next)));
    else if (entry.isFile()) files.push(next);
  }
  return files;
}

function addFailure(file, message) {
  failures.push(`${file}: ${message}`);
}

function addWarning(file, message) {
  warnings.push(`${file}: ${message}`);
}

function inspectText(relative, text, bytes) {
  const isClient = CLIENT_PREFIXES.some((prefix) => relative.startsWith(prefix)) || relative === "index.html";
  const isRuntime = relative.startsWith("src/") || relative.startsWith("worker/");

  if (/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/.test(text)) {
    addFailure(relative, "يحتوي على قيمة تبدو كمفتاح API حقيقي.");
  }
  if (isClient && /\bOPENAI_API_KEY\b/.test(text)) {
    addFailure(relative, "مرجع OPENAI_API_KEY موجود في كود يصل إلى المتصفح.");
  }
  if (relative.startsWith("src/") && /api\.openai\.com/i.test(text)) {
    addFailure(relative, "استدعاء OpenAI مباشر من المتصفح؛ يجب أن يمر عبر بوابة الخادم.");
  }
  if (isRuntime && /\beval\s*\(|\bnew\s+Function\s*\(/.test(text)) {
    addFailure(relative, "تنفيذ ديناميكي للكود غير مسموح في مسار الإنتاج.");
  }
  if (isRuntime && /\bdocument\.write\s*\(/.test(text)) {
    addFailure(relative, "document.write غير مسموح في مسار الإنتاج.");
  }
  if (relative.startsWith("src/") && /dangerouslySetInnerHTML/.test(text)) {
    addWarning(relative, "يستخدم dangerouslySetInnerHTML؛ راجع مصدر النص والتعقيم يدويًا.");
  }
  if (isRuntime && /\b(?:TODO|FIXME|HACK)\b/i.test(text)) {
    addWarning(relative, "يحتوي على علامة صيانة TODO/FIXME/HACK.");
  }
  if (relative === "src/App.jsx") {
    if (bytes > APP_HARD_LIMIT) addFailure(relative, `تجاوز حد منع تضخم App.jsx (${APP_HARD_LIMIT} بايت).`);
    else if (bytes > APP_SOFT_LIMIT) addWarning(relative, "App.jsx قريب من حد التضخم؛ يجب نقل الشاشات/الثوابت إلى وحدات مستقلة في التطوير القادم.");
  }
}

const files = [
  ...(await Promise.all(SOURCE_ROOTS.map(walk))).flat(),
  path.join(ROOT, "index.html"),
  path.join(ROOT, "package.json"),
  path.join(ROOT, "public", "manifest.webmanifest"),
].filter((value, index, all) => all.indexOf(value) === index);

for (const file of files) {
  let fileStat;
  try {
    fileStat = await stat(file);
  } catch {
    continue;
  }
  if (!fileStat.isFile() || !SCANNED_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
  const relative = normalizedPath(file);
  const text = await readFile(file, "utf8");
  scannedFiles += 1;
  scannedBytes += Buffer.byteLength(text);
  inspectText(relative, text, Buffer.byteLength(text));
}

const indexHtml = await readFile(path.join(ROOT, "index.html"), "utf8");
if (!/<html[^>]+lang=["']ar["'][^>]+dir=["']rtl["']/i.test(indexHtml)) {
  addFailure("index.html", "الجذر يجب أن يبقى lang=ar و dir=rtl.");
}
if (!/viewport-fit=cover/i.test(indexHtml)) {
  addFailure("index.html", "تهيئة iPhone Safe Area مفقودة: viewport-fit=cover.");
}

console.log(`Repository health: scanned ${scannedFiles} files (${Math.round(scannedBytes / 1024)} KiB).`);
for (const warning of warnings) console.warn(`WARN ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Repository health: PASS with ${warnings.length} maintenance warning(s).`);
}
