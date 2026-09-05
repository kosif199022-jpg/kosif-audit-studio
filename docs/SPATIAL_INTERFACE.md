# Spatial interface

Reference: https://www.youtube.com/watch?v=nOkLJ_vexsc. The retrieved creator description explains a 3D scene, pointer interaction, purple/blue light and complementary cards. Its prompts include a Spline placeholder, not a usable scene export. The implementation adapts that approach to an audit workspace instead of copying its VR-headset landing page.

- Original six-face CSS 3D scene with perspective, pointer orientation, orbital rings and account/round/gate indicators.
- Theme-variable materials and raised cards across workspaces; financial tables stay flat and readable.
- Local flat-mode and motion preferences, system reduced-motion support, touch-friendly layout and print exclusions.
- Optional Spline Public URL in scene settings. Only HTTPS my.spline.design scene URLs are accepted. Embed scripts are not accepted. External content loads after an explicit click, inside a sandboxed iframe, without audit data or API keys passed to it.
- No external scene is bundled; the local scene works without Spline or another runtime dependency. A Spline scene needs its own published export and internet access. External scene performance and appearance depend on that scene.

Official embedding documentation: https://docs.spline.design/exporting-your-scene/web/exporting-as-code and https://docs.spline.design/exporting-your-scene/web/exporting-as-spline-viewer.

Validation: production build, existing regression tests and URL/preference boundary tests. No browser visual QA was performed in this task.
