import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

test("serves /audit/ through the SPA shell instead of a 404 page", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/audit/?source=verification", {
      headers: { accept: "text/html,application/xhtml+xml" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const { pathname, search } = new URL(request.url);
          calls.push(pathname + search);
          return new Response(pathname === "/index.html" ? "<!doctype html><main>audit app</main>" : "not found", {
            status: pathname === "/index.html" ? 200 : 404,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.match(await response.text(), /audit app/);
  assert.deepEqual(calls, ["/audit/?source=verification", "/index.html"]);
});

test("keeps the Arabic HTML shell responsive and free of the legacy mobile frame", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const source = `${html}\n${css}`;

  assert.match(html, /<html\b[^>]*\blang=["']ar["'][^>]*>/i);
  assert.match(html, /<html\b[^>]*\bdir=["']rtl["'][^>]*>/i);
  assert.match(html, /<meta\b[^>]*\bname=["']viewport["'][^>]*\bcontent=["'][^"']*width=device-width/i);
  assert.doesNotMatch(source, /mobile-prototype/i);
  assert.doesNotMatch(css, /\b(?:width|height)\s*:\s*min\(\s*100(?:d?v[wh])\s*,\s*(?:390|844)px\s*\)/i);
  assert.match(css, /@media\s*\(max-width:\s*720px\)/i);
  assert.match(css, /\.bottom-nav\s*\{[^}]*display:\s*grid/is);
  assert.match(css, /\.table-scroll\s*\{[^}]*overflow-x:\s*auto/is);
  assert.match(css, /(?:html|body)\s*\{[^}]*overflow-x:\s*clip/is);
  assert.match(css, /\.search-field[^}]*font-size:\s*16px/is);
});
