# Jev Public

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
