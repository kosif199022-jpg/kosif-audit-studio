import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(root, 'public', 'vendor');
const outputPath = path.join(vendorDir, 'lame.min.js');
const noticePath = path.join(vendorDir, 'lamejs-LICENSE.txt');
const sourceUrl = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
const expectedIntegrity = 'sha512-xT0S/xXvkrfkRXGBPlzZPCAncnMK5c1N7slRkToUbv8Z901aUEuKO84tLy8dWU+3ew4InFEN7TebPaVMy2npZw==';

const licenseNotice = `lamejs 1.2.1 — MP3 encoder\nSource: https://github.com/zhuker/lamejs\nLicense: LGPL (LAME)\n\nCan I use LAME in my commercial program?\n\nYes, you can, under the restrictions of the LGPL. The easiest way to do this is to:\n\n1. Link to LAME as separate jar (lame.min.js or lame.all.js)\n2. Fully acknowledge that you are using LAME, and give a link to lame.sourceforge.net\n3. If you make modifications to LAME, you must release these modifications back to the LAME project, under the LGPL.\n\nKOSIF distributes the upstream minified encoder unchanged.\n`;

function integrity(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

async function existingVerified() {
  try {
    const bytes = await readFile(outputPath);
    return integrity(bytes) === expectedIntegrity;
  } catch {
    return false;
  }
}

await mkdir(vendorDir, { recursive: true });

if (!(await existingVerified())) {
  const response = await fetch(sourceUrl, {
    headers: { 'user-agent': 'KOSIF-build/1.0' },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`MP3_ENCODER_FETCH_FAILED:${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualIntegrity = integrity(bytes);
  if (actualIntegrity !== expectedIntegrity) {
    throw new Error(`MP3_ENCODER_INTEGRITY_MISMATCH:${actualIntegrity}`);
  }
  await writeFile(outputPath, bytes);
}

await writeFile(noticePath, licenseNotice, 'utf8');
console.log('Verified lamejs 1.2.1 vendor asset for MP3 voice export.');
