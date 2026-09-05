const ENGAGEMENT_ID_RE = /^eng_[a-f0-9]{26}$/;

export class CloudSyncError extends Error {
  constructor(message, { status = 0, code = "request_failed", currentRevision = null, details = null } = {}) {
    super(message);
    this.name = "CloudSyncError";
    this.status = status;
    this.code = code;
    this.currentRevision = currentRevision;
    this.details = details;
  }
}

function requireEngagementId(engagementId) {
  const value = String(engagementId || "");
  if (!ENGAGEMENT_ID_RE.test(value)) throw new Error("invalid_engagement_id");
  return value;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function requestJson(path, init, fetchImpl) {
  if (typeof fetchImpl !== "function") throw new CloudSyncError("fetch_unavailable", { code: "fetch_unavailable" });
  let response;
  try {
    response = await fetchImpl(path, init);
  } catch (cause) {
    throw new CloudSyncError("network_error", { code: "network_error", details: cause });
  }
  const body = await readJson(response);
  if (!response.ok) {
    throw new CloudSyncError(body?.error || `http_${response.status}`, {
      status: response.status,
      code: body?.error || "request_failed",
      currentRevision: Number.isInteger(body?.current_revision) ? body.current_revision : null,
      details: body,
    });
  }
  return body;
}

export async function getCloudSession(fetchImpl = globalThis.fetch) {
  const body = await requestJson("/api/session", { method: "GET", headers: { accept: "application/json" } }, fetchImpl);
  return body.session || null;
}

export async function listCloudEngagements(fetchImpl = globalThis.fetch) {
  const body = await requestJson("/api/engagements", { method: "GET", headers: { accept: "application/json" } }, fetchImpl);
  return Array.isArray(body.engagements) ? body.engagements : [];
}

export async function loadCloudWorkspace(engagementId, fetchImpl = globalThis.fetch) {
  const id = requireEngagementId(engagementId);
  const body = await requestJson(`/api/engagements/${id}/workspace`, {
    method: "GET",
    headers: { accept: "application/json" },
  }, fetchImpl);
  return body.workspace || { revision: 0, state: null };
}

export async function saveCloudWorkspace(engagementId, { baseRevision, state }, fetchImpl = globalThis.fetch) {
  const id = requireEngagementId(engagementId);
  if (!Number.isInteger(baseRevision) || baseRevision < 0) throw new Error("invalid_base_revision");
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("invalid_workspace_state");
  const body = await requestJson(`/api/engagements/${id}/workspace`, {
    method: "PUT",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ base_revision: baseRevision, state }),
  }, fetchImpl);
  return body.workspace;
}

export function createWorkspaceAutosave({
  save,
  initialRevision = 0,
  delay = 800,
  onSaved = null,
  onError = null,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  if (typeof save !== "function") throw new Error("save_function_required");
  if (!Number.isInteger(initialRevision) || initialRevision < 0) throw new Error("invalid_initial_revision");
  if (!Number.isFinite(delay) || delay < 0) throw new Error("invalid_autosave_delay");

  let revision = initialRevision;
  let pendingState = null;
  let timer = null;
  let activeSave = null;
  let cancelled = false;

  const clearPendingTimer = () => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const performSave = async () => {
    clearPendingTimer();
    if (cancelled || pendingState === null) return null;
    if (activeSave) {
      await activeSave;
      if (cancelled || pendingState === null) return null;
    }

    const state = pendingState;
    pendingState = null;
    const baseRevision = revision;
    activeSave = Promise.resolve(save({ baseRevision, state }))
      .then((workspace) => {
        if (!workspace || !Number.isInteger(workspace.revision) || workspace.revision <= baseRevision) {
          throw new CloudSyncError("invalid_save_response", { code: "invalid_save_response" });
        }
        revision = workspace.revision;
        onSaved?.(workspace);
        return workspace;
      })
      .catch((error) => {
        if (pendingState === null) pendingState = state;
        onError?.(error);
        throw error;
      })
      .finally(() => {
        activeSave = null;
      });

    return activeSave;
  };

  const schedule = (state) => {
    if (cancelled) return;
    pendingState = state;
    clearPendingTimer();
    timer = setTimer(() => {
      performSave().catch(() => {});
    }, delay);
  };

  const flush = async () => {
    clearPendingTimer();
    if (activeSave) await activeSave;
    return performSave();
  };

  const cancel = () => {
    cancelled = true;
    pendingState = null;
    clearPendingTimer();
  };

  return {
    schedule,
    flush,
    cancel,
    getRevision: () => revision,
    hasPending: () => pendingState !== null || activeSave !== null,
  };
}
