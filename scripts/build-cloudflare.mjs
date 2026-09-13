import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(new URL('..', import.meta.url).pathname);
const out = join(root, 'dist', 'client');
const skip = new Set(['.git', 'dist', 'node_modules', '.codex', '.openai']);
await rm(join(root, 'dist'), { recursive: true, force: true });
async function copyTree(from) {
  for (const item of await readdir(from, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const source = join(from, item.name);
    const target = join(out, relative(root, source));
    if (item.isDirectory()) { await mkdir(target, { recursive: true }); await copyTree(source); }
    else { await mkdir(join(target, '..'), { recursive: true }); await cp(source, target); }
  }
}
await mkdir(out, { recursive: true });
await copyTree(root);
console.log(`Built KOSIF One Royal Purple Control Room into ${out}`);
