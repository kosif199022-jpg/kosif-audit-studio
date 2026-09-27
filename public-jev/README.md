# Jev Public

**Live:** https://aghnam-jev-api.kosif199022.workers.dev/


Public, mobile-friendly decision page powered by the existing Cloudflare Worker `jev-claude-bridge`.

## Modes
- Yes / No (`jev_noul`)
- Multiple choice (`jev_choice`)
- Ordered score (`jev_score`)

## Security
The browser never receives the Jev MCP access token or the TypeSafe API key. The public Worker calls `jev-claude-bridge` through a Cloudflare Service Binding. `JEV_BRIDGE_TOKEN` is configured as a Cloudflare secret, not committed to GitHub.

## Deploy
```bash
npx wrangler deploy
npx wrangler secret put JEV_BRIDGE_TOKEN
```


## Production
The live page is served from the existing `aghnam-jev-api` Worker so it can reuse the already-secured `JEV_BRIDGE`, `JEV_BRIDGE_TOKEN`, and session bindings without copying secrets. Existing authenticated application routes remain unchanged.

The public UI is available at:
- `/`
- `/jev`
- `/public`

Its decision endpoint is `POST /api/public-jev`.
