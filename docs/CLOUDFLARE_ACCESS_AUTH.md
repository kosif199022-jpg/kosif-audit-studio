# Cloudflare Access authentication for KOSIF

KOSIF can now accept a Cloudflare Access application JWT on the direct Cloudflare deployment without trusting any client-supplied email header.

## Worker contract

The Worker checks identities in this order:

1. `oai-authenticated-user-email` behind the trusted OpenAI Sites dispatch boundary.
2. A cryptographically verified Cloudflare Access JWT from `Cf-Access-Jwt-Assertion`.
3. Otherwise the API returns `401 authentication_required`.

The Cloudflare Pages wrapper continues to delete `oai-authenticated-user-email` from direct internet requests, so direct users cannot spoof the Sites identity path.

## Required Cloudflare configuration

Create/protect the KOSIF application with Cloudflare Access and provide these Worker/Pages environment variables:

```text
TEAM_DOMAIN=https://<your-team-name>.cloudflareaccess.com
POLICY_AUD=<the Access application AUD tag>
```

Do not put these values in browser storage. They are server-side deployment configuration. `POLICY_AUD` is an identifier, not an API secret, but keeping all authentication configuration server-side avoids split configuration and accidental client authority.

Until both values are configured correctly, the direct Cloudflare API remains fail-closed and returns `401` for requests that do not have the trusted Sites identity.

## Validation performed

For each Access assertion the Worker:

- requires exactly one compact JWT with three Base64URL segments and a bounded total size;
- permits `RS256` only;
- requires a bounded `kid`;
- requires `iss` to match the configured HTTPS `*.cloudflareaccess.com` team domain exactly;
- requires `aud` to contain the configured application `POLICY_AUD`;
- checks `exp`, `nbf`, and a bounded future `iat` condition;
- normalizes and validates the verified `email` claim;
- downloads keys only from the fixed `<TEAM_DOMAIN>/cdn-cgi/access/certs` endpoint after validating the configured team domain;
- selects the matching RSA signing JWK and verifies the JWT signature with WebCrypto;
- returns no identity on network, parse, configuration, key, claim, or signature failure.

No raw JWT, verified email, or application data is sent to the key-discovery endpoint.

## Security boundary

This code does not create the Cloudflare Access application or its policy. The Cloudflare account must still be configured so the production hostname is behind Access and the `TEAM_DOMAIN` / `POLICY_AUD` values match that application.

Do not replace the JWT verifier with `Cf-Access-Authenticated-User-Email` or another unsigned browser-supplied header. The application uses the signed JWT as the direct-Cloudflare trust boundary.

## Deployment verification

The repository CI runs the actual Cloudflare preparation command:

```bash
npm run build:cloudflare
```

Tests cover:

- valid signed RS256 Access JWT acceptance;
- invalid signature, issuer, audience, time, algorithm, and key-id rejection;
- unsafe/missing Access configuration failing before key discovery;
- malformed and oversized token rejection;
- direct spoofed Sites email rejection;
- acceptance of a signed Access assertion through the generated `dist/client/_worker.js` wrapper itself.
