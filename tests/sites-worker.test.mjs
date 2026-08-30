import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import test from "node:test";
import worker, { API_ROUTE_MANIFEST, ROLE_PERMISSIONS, authorizeRole } from "../worker/index.js";

const AUTH_HEADERS = { "oai-authenticated-user-email": "auditor@example.test" };

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, new URL(request.url).pathname.startsWith("/api/") ? 403 : 404);
    assert.equal(calls, request.method === "POST" && new URL(request.url).pathname === "/flow" ? 1 : 0);
  }
});

test("exposes a redacted provider registry and never returns secret values", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/council/providers", { headers: AUTH_HEADERS }), {
    ASSETS: { fetch: async () => new Response("must-not-run", { status: 500 }) },
    OPENAI_API_KEY: "sk-super-secret",
    OPENAI_MODEL: "gpt-server-model",
    ANTHROPIC_API_KEY: "anthropic-secret",
    ANTHROPIC_MODEL: "claude-server-model",
  });
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(body.externalExecutionAvailable, false);
  assert.equal(body.providers.find(({ id }) => id === "kosif-local").canRun, true);
  assert.equal(body.providers.find(({ id }) => id === "openai").configured, true);
  assert.equal(body.providers.find(({ id }) => id === "openai").canRun, false);
  assert.equal(serialized.includes("sk-super-secret"), false);
  assert.equal(serialized.includes("anthropic-secret"), false);
  assert.equal(serialized.includes("API_KEY"), false);
});

test("rejects provider-registry writes and unknown APIs without asset fallback", async () => {
  let calls = 0;
  for (const request of [
    new Request("https://example.test/api/council/providers", { method: "POST" }),
    new Request("https://example.test/api/council/run", { method: "POST" }),
  ]) {
    const response = await worker.fetch(request, { ASSETS: { fetch: async () => { calls += 1; return new Response("asset"); } } });
    assert.equal(response.status, 403);
    assert.match(response.headers.get("content-type"), /application\/json/);
  }
  assert.equal(calls, 0);
});

test("R2 every declared API route rejects anonymous requests", async () => {
  assert.ok(API_ROUTE_MANIFEST.length >= 5);
  for (const route of API_ROUTE_MANIFEST) {
    const path = route.path.replace(":id", "eng_0123456789abcdef0123456789");
    const response = await worker.fetch(new Request(`https://example.test${path}`, {
      method: route.method,
      headers: route.method === "POST" ? { "content-type": "application/json" } : undefined,
      body: route.method === "POST" ? "{}" : undefined,
    }), { ASSETS: { fetch: async () => new Response("must-not-run", { status: 500 }) } });
    assert.equal(response.status, 401, `${route.method} ${route.path}`);
  }
});

test("deny-by-default returns 403 even for authenticated unknown APIs", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/undeclared", { headers: AUTH_HEADERS }), {
    ASSETS: { fetch: async () => new Response("must-not-run", { status: 500 }) },
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "route_not_authorized");
});

test("route permissions are enforced by an explicit role matrix", () => {
  assert.deepEqual(Object.keys(ROLE_PERMISSIONS), ["owner", "partner", "manager", "senior", "viewer"]);
  assert.equal(authorizeRole("owner", "engagement:archive"), true);
  assert.equal(authorizeRole("partner", "engagement:archive"), true);
  assert.equal(authorizeRole("manager", "engagement:create"), true);
  assert.equal(authorizeRole("manager", "engagement:archive"), false);
  assert.equal(authorizeRole("senior", "engagement:read"), true);
  assert.equal(authorizeRole("viewer", "integrity:read"), true);
  assert.equal(authorizeRole("viewer", "engagement:create"), false);
  assert.equal(authorizeRole("unknown", "engagement:read"), false);
  assert.equal(authorizeRole("owner", "unknown:permission"), false);
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
  const migrations = (await readdir(new URL("../dist/.openai/drizzle/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"));
  assert.deepEqual(migrations.sort(), ["0000_execution_contract_v1_1.sql", "0001_execution_guards.sql"]);
});
