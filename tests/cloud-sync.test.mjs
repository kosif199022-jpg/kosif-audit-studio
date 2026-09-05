import assert from "node:assert/strict";
import test from "node:test";

async function cloudSync() {
  return import("../src/cloud-sync.js");
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("cloud transport uses same-origin session, list, load, and versioned save contracts", async () => {
  const {
    getCloudSession,
    listCloudEngagements,
    loadCloudWorkspace,
    saveCloudWorkspace,
  } = await cloudSync();
  const calls = [];
  const engagementId = "eng_0123456789abcdef0123456789";
  const fakeFetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, method: init.method || "GET", body: init.body || null, headers: init.headers || null });
    if (url === "/api/session") return jsonResponse({ session: { role: "owner" } });
    if (url === "/api/engagements") return jsonResponse({ engagements: [{ id: engagementId }] });
    if (url.endsWith("/workspace") && (init.method || "GET") === "GET") {
      return jsonResponse({ workspace: { revision: 2, state: { version: 7 } } });
    }
    if (url.endsWith("/workspace") && init.method === "PUT") {
      return jsonResponse({ workspace: { revision: 3, state: { version: 7 } } }, 201);
    }
    return jsonResponse({ error: "unexpected" }, 500);
  };

  assert.equal((await getCloudSession(fakeFetch)).role, "owner");
  assert.equal((await listCloudEngagements(fakeFetch))[0].id, engagementId);
  assert.equal((await loadCloudWorkspace(engagementId, fakeFetch)).revision, 2);
  assert.equal((await saveCloudWorkspace(engagementId, { baseRevision: 2, state: { version: 7 } }, fakeFetch)).revision, 3);

  assert.deepEqual(calls.map(({ url, method }) => [url, method]), [
    ["/api/session", "GET"],
    ["/api/engagements", "GET"],
    [`/api/engagements/${engagementId}/workspace`, "GET"],
    [`/api/engagements/${engagementId}/workspace`, "PUT"],
  ]);
  const save = calls[3];
  assert.deepEqual(JSON.parse(save.body), { base_revision: 2, state: { version: 7 } });
  assert.equal(save.headers["content-type"], "application/json");
});

test("cloud transport surfaces revision conflicts without overwriting server state", async () => {
  const { CloudSyncError, saveCloudWorkspace } = await cloudSync();
  const engagementId = "eng_0123456789abcdef0123456789";
  const fakeFetch = async () => jsonResponse({
    error: "workspace_revision_conflict",
    current_revision: 9,
  }, 409);

  await assert.rejects(
    saveCloudWorkspace(engagementId, { baseRevision: 8, state: { version: 7 } }, fakeFetch),
    (error) => {
      assert.equal(error instanceof CloudSyncError, true);
      assert.equal(error.status, 409);
      assert.equal(error.code, "workspace_revision_conflict");
      assert.equal(error.currentRevision, 9);
      return true;
    },
  );
});

test("autosave coalesces rapid snapshots and keeps the last acknowledged revision", async () => {
  const { createWorkspaceAutosave } = await cloudSync();
  const saves = [];
  const autosave = createWorkspaceAutosave({
    delay: 5,
    initialRevision: 4,
    save: async ({ baseRevision, state }) => {
      saves.push({ baseRevision, state });
      return { revision: baseRevision + 1, state };
    },
  });

  autosave.schedule({ version: 7, entity: { name: "أ" } });
  autosave.schedule({ version: 7, entity: { name: "ب" } });
  autosave.schedule({ version: 7, entity: { name: "ج" } });
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.deepEqual(saves, [{ baseRevision: 4, state: { version: 7, entity: { name: "ج" } } }]);
  assert.equal(autosave.getRevision(), 5);

  autosave.schedule({ version: 7, report: { status: "draft" } });
  await autosave.flush();
  assert.deepEqual(saves[1], { baseRevision: 5, state: { version: 7, report: { status: "draft" } } });
  assert.equal(autosave.getRevision(), 6);
  autosave.cancel();
});

test("cloud transport rejects unsafe engagement ids before fetch", async () => {
  const { loadCloudWorkspace } = await cloudSync();
  let calls = 0;
  await assert.rejects(
    loadCloudWorkspace("../../api/session", async () => { calls += 1; return jsonResponse({}); }),
    /invalid_engagement_id/,
  );
  assert.equal(calls, 0);
});
