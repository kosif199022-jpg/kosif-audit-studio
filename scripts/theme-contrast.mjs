/**
 * KOSIF V5 — WCAG contrast guard for the whole V5 stylesheet set.
 * يحسب كل قاعدة تحدد لون نص ولون خلفية صلبة معًا، ويركّب الشفافية على ورق الهوية،
 * ثم يشتكي من أي نص يصبح قريبًا من لون سطحه (نص غير مرئي تقريبًا).
 * يُستخدم في tests/theme-contrast.test.js، ويمكن تشغيله مباشرة لمراجعة بشرية.
 */
import { readFileSync } from 'node:fs';
import { V5_STYLE_ASSETS } from '../v5/ui-assets.js';

const PAGE = '#f6efe3';
const hex = value => {
  const raw = value.trim().toLowerCase();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(raw);
  if (!match) return null;
  let digits = match[1];
  if (digits.length === 3) digits = [...digits].map(d => d + d).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(digits.slice(i, i + 2), 16));
  const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
};
const over = (fg, bg) => ({ r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)), g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)), b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)) });
const luminance = ({ r, g, b }) => [r, g, b].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) };
const pageStyle = hex(PAGE);

export function contrastViolations(stylesheets = V5_STYLE_ASSETS, { root = new URL('..', import.meta.url).pathname.replace(/\/$/, ''), threshold = 3 } = {}) {
  const files = [...new Set([...stylesheets, './kosif-assistant.css', './product-model.css', './dashboard-theme.css', './kosif-heritage-v5.css'])];
  const violations = [];
  for (const file of files) {
    const path = `${root}/${file.replace(/^\.\//, '')}`;
    let css;
    try { css = readFileSync(path, 'utf8'); } catch { continue; }
    css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '').replace(/@import[^;]+;/g, '');
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
      const colour = /(?:^|;|\s)color\s*:\s*([^;!]+)/.exec(body);
      const background = /(?:^|;|\s)background(?:-color)?\s*:\s*([^;]+)/.exec(body);
      if (!colour || !background) continue;
      if (/gradient|url\(|var\(|inherit|currentColor|transparent|none/.test(background[1])) continue;
      const fg = hex(colour[1]); const bg = hex(background[1]);
      if (!fg || !bg) continue;
      const surface = over(bg, pageStyle);
      const text = over(fg, surface);
      const ratio = contrast(text, surface);
      if (ratio < threshold) violations.push({ file: file.replace(/^\.\//, ''), selector: selector.trim().replace(/\s+/g, ' '), color: colour[1].trim(), background: background[1].trim(), ratio: Math.round(ratio * 100) / 100 });
    }
  }
  return violations;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = contrastViolations();
  console.log(`violations: ${violations.length}`);
  for (const v of violations) console.log(`  ${v.file} :: ${v.selector} → ${v.color} on ${v.background} (${v.ratio}:1)`);
}
