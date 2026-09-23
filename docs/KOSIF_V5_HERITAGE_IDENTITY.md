# KOSIF V5 — Heritage Identity Layer

The V5 shell paints one identity from the first byte: ivory paper, royal purple, audit gold and trust green. This document is the contract for that layer and for the paint order that keeps it stable.

## Two style tiers

1. `dashboard-theme.css` — the base theme tier. Palette, radii and shadows adapted from the supplied dashboard, kept locked and documented so existing contracts and screenshots stay valid.
2. `kosif-heritage-v5.css` — the identity tier. It restyles the shell, the workbenches, the command center, tables, dialogs and the report paper with the KOSIF palette, and it is always the last stylesheet painted.

`v5/ui-assets.js` is the single registry:

- `V5_STYLE_ASSETS` — every optional workbench stylesheet, ending with the two theme tiers.
- `V5_THEME_ASSETS` — `['./dashboard-theme.css', './kosif-heritage-v5.css']`, re-appended to the end of `<head>` on every call.
- `ensureStyleAsset(href)` — the only supported way for a module to add a stylesheet; it appends the link and then re-pins the theme tiers.
- `ensureV5Styles()` — registers the whole list and pins the theme tiers.

Because the identity layer uses `!important` with selectors of equal-or-higher specificity than the base tier, the KOSIF palette wins without editing the locked palette file.

## Palette and typography

| Token | Value | Use |
| --- | --- | --- |
| `--heritage-paper` | `#f6efe3` | page background, ivory paper |
| `--heritage-paper-2` | `#fffdf8` | panels, paper, command widgets |
| `--heritage-purple` | `#241332` | buttons, active navigation, brand mark |
| `--heritage-purple-2` | `#4a2a6b` | gradients and accents |
| `--heritage-gold` | `#c59a3b` | eyebrows, rules, focus, table headers |
| `--heritage-gold-soft` | `#e7cf9a` | borders on dark purple |
| `--heritage-green` | `#1f6b54` | satisfied states and trust signals |
| `--heritage-red` | `#a4343a` | critical findings and failures |

Headings use Noto Kufi Arabic and body text uses Tajawal; the font stack is declared in `index.html` and re-asserted in the identity layer with the same specificity as the base theme rule.

## Print contract

`@media print` hides the operating shell (topbar, workspace navigation, hero, journey, command center, workbench panels, assistant, publication toolbar) and prints only the report paper with clean tables, black-on-white text and page breaks before sections. This is what the “طباعة / PDF” action produces.

## Limits

The identity layer changes presentation only. It does not alter the deterministic engine, the state machine, the council stances or any stored value.
