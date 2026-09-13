import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('.');
const out = resolve('dist/client');
await rm(resolve('dist'), { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest']) {
  await cp(resolve(file), resolve(out, file));
}
console.log(`Built KOSIF from scratch into ${out}`);
