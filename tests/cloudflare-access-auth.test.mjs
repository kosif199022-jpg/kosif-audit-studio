import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import * as workerModule from "../worker/index.js";

const cryptoApi = globalThis.crypto || webcrypto;
const TEAM_DOMAIN = "https://kosif.cloudflareaccess.com";
const AUD = "aud_kosif_production_0123456789abcdef";
const NOW = 1_788_640_000;

function base64url(value) {
  const bytes = value instanceof Uint8Array ? value : Buffer.from(value);
  return Buffer.from(bytes).toString("base64url");
}

async function signingFixture() {
  const keyPair = await cryptoApi.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await cryptoApi.subtle.exportKey("jwk", keyPair.publicKey);
  Object.assign(publicJwk, { kid: "kid-kosif-1", alg: "RS256", use: "sig" });

  async function token(overrides = {}) {
    const header = { alg: "RS256", kid: publicJwk.kid, typ: "JWT", ...(overrides.header || {}) };
    const payload = {
      iss: TEAM_DOMAIN,
      aud: [AUD],
      email: "Auditor@Example.Test",
      sub: "subject-1",
      type: "app",
      iat: NOW - 60,
      nbf: NOW - 60,
      exp: NOW + 300,
      ...(overrides.payload || {}),
    };
    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = new Uint8Array(await cryptoApi.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    ));
    return `${signingInput}.${base64url(signature)}`;
  }

  return { publicJwk, token };
}

function accessRequest(token) {
  return new Request("https://kosif-audit-studio.pages.dev/api/session", {
    headers: token ? { "cf-access-jwt-assertion": token } : {},
  });
}

test("Cloudflare Access accepts only a valid RS256 token for the configured issuer and audience", async () => {
  assert.equal(typeof workerModule.verifyCloudflareAccessSubject, "function");
  if (typeof workerModule.verifyCloudflareAccessSubject !== "function") return;
  const { publicJwk, token } = await signingFixture();
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ keys: [publicJwk] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const subject = await workerModule.verifyCloudflareAccessSubject(
    accessRequest(await token()),
    { TEAM_DOMAIN, POLICY_AUD: AUD },
    { fetchImpl, nowSeconds: NOW, cryptoImpl: cryptoApi },
  );

  assert.equal(subject, "auditor@example.test");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${TEAM_DOMAIN}/cdn-cgi/access/certs`);
  assert.equal(calls[0].init?.headers?.accept, "application/json");
  assert.equal(JSON.stringify(calls[0]).includes("Auditor@Example.Test"), false);
});

test("Cloudflare Access fails closed for bad signature, issuer, audience, time, algorithm, or key id", async () => {
  assert.equal(typeof workerModule.verifyCloudflareAccessSubject, "function");
  if (typeof workerModule.verifyCloudflareAccessSubject !== "function") return;
  const fixture = await signingFixture();
  const fetchImpl = async () => new Response(JSON.stringify({ keys: [fixture.publicJwk] }), { status: 200 });
  const env = { TEAM_DOMAIN, POLICY_AUD: AUD };

  const valid = await fixture.token();
  const [headerPart, payloadPart, signaturePart] = valid.split(".");
  const corruptedSignature = `${headerPart}.${payloadPart}.${signaturePart.slice(0, -1)}${signaturePart.endsWith("A") ? "B" : "A"}`;
  const cases = [
    corruptedSignature,
    await fixture.token({ payload: { iss: "https://evil.cloudflareaccess.com" } }),
    await fixture.token({ payload: { aud: ["wrong-audience"] } }),
    await fixture.token({ payload: { exp: NOW - 1 } }),
    await fixture.token({ payload: { nbf: NOW + 60 } }),
    await fixture.token({ header: { alg: "HS256" } }),
    await fixture.token({ header: { kid: "unknown-kid" } }),
  ];

  for (const candidate of cases) {
    assert.equal(
      await workerModule.verifyCloudflareAccessSubject(
        accessRequest(candidate),
        env,
        { fetchImpl, nowSeconds: NOW, cryptoImpl: cryptoApi },
      ),
      null,
    );
  }
});

test("Cloudflare Access never performs key discovery without complete safe configuration", async () => {
  assert.equal(typeof workerModule.verifyCloudflareAccessSubject, "function");
  if (typeof workerModule.verifyCloudflareAccessSubject !== "function") return;
  const { token } = await signingFixture();
  const assertion = await token();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return new Response("{}"); };
  const unsafe = [
    {},
    { TEAM_DOMAIN, POLICY_AUD: "" },
    { TEAM_DOMAIN: "https://example.com", POLICY_AUD: AUD },
    { TEAM_DOMAIN: "http://kosif.cloudflareaccess.com", POLICY_AUD: AUD },
    { TEAM_DOMAIN: "https://kosif.cloudflareaccess.com/path", POLICY_AUD: AUD },
  ];
  for (const env of unsafe) {
    assert.equal(
      await workerModule.verifyCloudflareAccessSubject(
        accessRequest(assertion),
        env,
        { fetchImpl, nowSeconds: NOW, cryptoImpl: cryptoApi },
      ),
      null,
    );
  }
  assert.equal(
    await workerModule.verifyCloudflareAccessSubject(
      accessRequest(null),
      { TEAM_DOMAIN, POLICY_AUD: AUD },
      { fetchImpl, nowSeconds: NOW, cryptoImpl: cryptoApi },
    ),
    null,
  );
  assert.equal(calls, 0);
});

test("Cloudflare Access rejects malformed or oversized assertions before key discovery", async () => {
  assert.equal(typeof workerModule.verifyCloudflareAccessSubject, "function");
  if (typeof workerModule.verifyCloudflareAccessSubject !== "function") return;
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return new Response("{}"); };
  for (const token of ["not-a-jwt", "a.b.c.d", `a.${"x".repeat(20_000)}.c`]) {
    assert.equal(
      await workerModule.verifyCloudflareAccessSubject(
        accessRequest(token),
        { TEAM_DOMAIN, POLICY_AUD: AUD },
        { fetchImpl, nowSeconds: NOW, cryptoImpl: cryptoApi },
      ),
      null,
    );
  }
  assert.equal(calls, 0);
});
