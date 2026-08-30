import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { API_ROUTE_MANIFEST } from "../worker/index.js";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const readMigrations = async () => Promise.all(
  (await readdir(new URL("../drizzle/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => read(`../drizzle/${name}`)),
).then((parts) => parts.join("\n"));

test("R2 route manifest is explicit and permissioned", () => {
  assert.ok(API_ROUTE_MANIFEST.length >= 5);
  assert.equal(new Set(API_ROUTE_MANIFEST.map(({ method, path }) => `${method} ${path}`)).size, API_ROUTE_MANIFEST.length);
  assert.equal(API_ROUTE_MANIFEST.every(({ method, path, permission }) => (
    ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)
    && path.startsWith("/api/")
    && /^[a-z]+:[a-z]+$/.test(permission)
  )), true);
});

test("I7 route metadata is consumed by server-side RBAC", async () => {
  const worker = await read("../worker/index.js");
  assert.match(worker, /ROLE_PERMISSIONS/);
  assert.match(worker, /memberRole\(requireDatabase\(env\), auth\.tenantId, auth\.subject\)/);
  assert.match(worker, /authorizeRole\(role, route\.permission\)/);
  assert.doesNotMatch(worker, /permission:\s*route\.permission\s*};\s*\/\/\s*trusted/i);
});

test("R3 Worker contains no outbound fetch path derived from user input", async () => {
  const worker = await read("../worker/index.js");
  const fetchLines = worker.split("\n").filter((line) => line.includes("fetch("));
  assert.equal(fetchLines.length, 3);
  assert.match(fetchLines[0], /async fetch\(request, env\)/);
  assert.equal(fetchLines.slice(1).every((line) => line.includes("env.ASSETS.fetch")), true);
  assert.doesNotMatch(worker, /globalThis\.fetch|window\.fetch|\bfetch\(\s*(?:url|input|body|payload)/);
});

test("R4 opinion type is generated in D1 and not writable in application state", async () => {
  const [schema, migration, source] = await Promise.all([
    read("../db/schema.ts"),
    readMigrations(),
    Promise.all([
      read("../src/App.jsx"),
      read("../src/data.js"),
      read("../src/reporting.js"),
    ]).then((parts) => parts.join("\n")),
  ]);
  assert.match(schema, /opinionType:[\s\S]*generatedAlwaysAs/);
  assert.match(migration, /`opinion_type` text GENERATED ALWAYS AS/);
  assert.doesNotMatch(source, /opinionSelection/);
});

test("R6 strict engine has no duplicate function declarations or ambient time and randomness", async () => {
  const core = await read("../src/audit-core.js");
  const names = [...core.matchAll(/(?:export\s+)?function\s+([A-Za-z0-9_]+)/g)].map((match) => match[1]);
  assert.equal(new Set(names).size, names.length);
  assert.doesNotMatch(core, /Math\.random\(|Date\.now\(/);
});

test("D1 migration enforces append-only history and archive guards", async () => {
  const [schema, migration, hosting, journal, guardSnapshot] = await Promise.all([
    read("../db/schema.ts"),
    readMigrations(),
    read("../.openai/hosting.json"),
    read("../drizzle/meta/_journal.json").then(JSON.parse),
    read("../drizzle/meta/0001_snapshot.json").then(JSON.parse),
  ]);
  assert.match(schema, /tenantId: text\("tenant_id"\)\.notNull/);
  assert.match(schema, /derivationInputs = sqliteTable\("derivation_inputs"/);
  assert.match(schema, /openingAmountMinor: text\("opening_amount_minor"\)/);
  assert.match(migration, /CREATE TRIGGER audit_log_no_update/);
  assert.match(migration, /CREATE TRIGGER journal_lines_no_delete/);
  assert.match(migration, /CREATE TRIGGER mapping_rules_archived_insert_guard/);
  assert.match(schema, /mapping_rules_engagement_ruleset_fk/);
  assert.match(migration, /accounts_opening_amount_canonical/);
  assert.match(migration, /archived_engagement_is_read_only/);
  assert.deepEqual(journal.entries.map(({ tag }) => tag), ["0000_execution_contract_v1_1", "0001_execution_guards"]);
  assert.equal(guardSnapshot.dialect, "sqlite");
  assert.equal(JSON.parse(hosting).d1, "DB");
});
