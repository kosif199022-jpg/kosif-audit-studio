import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === 'baileys') return { url: new URL('./stub-baileys.mjs', ${JSON.stringify(import.meta.url)}).href, shortCircuit: true };
  if (spec === 'pino') return { url: new URL('./stub-pino.mjs', ${JSON.stringify(import.meta.url)}).href, shortCircuit: true };
  return next(spec, ctx);
}`));
