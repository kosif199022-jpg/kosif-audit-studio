import assert from "node:assert/strict";
import test from "node:test";
import { verifyRetainedEvidence } from "../src/evidence-store.js";
import { sha256BytesHex } from "../src/governance.js";

const bytes = new TextEncoder().encode("retained audit evidence").buffer;
const hash = await sha256BytesHex(bytes, null);
const item = {
  id: "PBC-TEST",
  attachmentStorage: "indexeddb-local",
  storageKey: "dataset:PBC-TEST:v1",
  fileSize: bytes.byteLength,
  hash,
};

test("revalidates retained evidence bytes before governed output", async () => {
  const result = await verifyRetainedEvidence([item], {
    readBytes: async () => bytes,
    hashBytes: (value) => sha256BytesHex(value, null),
  });
  assert.deepEqual(result, { ok: true, checked: 1 });
});

test("fails when retained evidence is missing, truncated, or changed", async () => {
  const empty = await verifyRetainedEvidence([{ ...item, fileSize: 0 }], { readBytes: async () => new ArrayBuffer(0) });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, "metadata");

  const unavailable = await verifyRetainedEvidence([item], { readBytes: async () => null });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.reason, "size");

  const truncated = await verifyRetainedEvidence([item], { readBytes: async () => bytes.slice(0, 3) });
  assert.equal(truncated.ok, false);
  assert.equal(truncated.reason, "size");

  const changed = await verifyRetainedEvidence([item], {
    readBytes: async () => bytes,
    hashBytes: async () => "f".repeat(64),
  });
  assert.equal(changed.ok, false);
  assert.equal(changed.reason, "digest");
});

test("does not require IndexedDB for the signed synthetic fixture metadata", async () => {
  const result = await verifyRetainedEvidence([{ ...item, attachmentStorage: "synthetic-fixture-metadata" }], {
    readBytes: async () => { throw new Error("must not read"); },
  });
  assert.deepEqual(result, { ok: true, checked: 0 });
});
