import React, { useEffect, useState } from "react";
import { STORAGE_KEY, initialEngagement } from "./data.js";
import {
  createWorkspaceAutosave,
  getCloudSession,
  listCloudEngagements,
  loadCloudWorkspace,
  saveCloudWorkspace,
} from "./cloud-sync.js";
import {
  buildCloudWorkspaceState,
  mergeCloudWorkspaceState,
  selectCloudEngagement,
} from "./cloud-workspace.js";

const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 1_500;
const DEFAULT_POLL_MS = 500;

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readLocalEngagement(storage) {
  if (!storage) return initialEngagement;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return initialEngagement;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : initialEngagement;
  } catch {
    return initialEngagement;
  }
}

function writeLocalEngagement(storage, engagement) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(engagement));
    return true;
  } catch {
    return false;
  }
}

export function CloudPersistenceBoundary({
  children,
  storage: storageOverride = null,
  fetchImpl = globalThis.fetch,
  bootstrapTimeoutMs = DEFAULT_BOOTSTRAP_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS,
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let localRendered = false;
    let pollTimer = null;
    let autosave = null;
    let lastSnapshotJson = null;
    const storage = storageOverride || safeLocalStorage();

    const timeout = setTimeout(() => {
      if (disposed) return;
      localRendered = true;
      setReady(true);
    }, Math.max(0, Number(bootstrapTimeoutMs) || DEFAULT_BOOTSTRAP_TIMEOUT_MS));

    async function bootstrap() {
      if (!storage || typeof fetchImpl !== "function") {
        clearTimeout(timeout);
        if (!disposed) setReady(true);
        return;
      }

      const local = readLocalEngagement(storage);
      if (local?.sourceDataset?.source === "import") {
        clearTimeout(timeout);
        if (!disposed) setReady(true);
        return;
      }

      try {
        await getCloudSession(fetchImpl);
        const list = await listCloudEngagements(fetchImpl);
        if (disposed || localRendered) return;

        const selected = selectCloudEngagement(list?.engagements, local);
        if (!selected) return;

        const loaded = await loadCloudWorkspace(selected.id, fetchImpl);
        if (disposed || localRendered) return;
        const workspace = loaded?.workspace || { revision: 0, state: null };

        let hydrated = local;
        if (workspace.state) {
          hydrated = mergeCloudWorkspaceState(local, workspace.state);
          writeLocalEngagement(storage, hydrated);
        }

        let initialSnapshot;
        try {
          initialSnapshot = buildCloudWorkspaceState(hydrated);
        } catch {
          return;
        }
        lastSnapshotJson = JSON.stringify(initialSnapshot);

        let cloudDisabled = false;
        autosave = createWorkspaceAutosave({
          initialRevision: Number(workspace.revision || 0),
          delay: 800,
          save: (state, baseRevision) => saveCloudWorkspace(selected.id, state, baseRevision, fetchImpl),
          onError: (error) => {
            if (error?.status === 409) {
              cloudDisabled = true;
              autosave?.cancel();
            }
          },
        });

        if (!workspace.state && Number(workspace.revision || 0) === 0) {
          autosave.schedule(initialSnapshot);
        }

        pollTimer = setInterval(() => {
          if (disposed || cloudDisabled || !autosave) return;
          const current = readLocalEngagement(storage);
          let snapshot;
          try {
            snapshot = buildCloudWorkspaceState(current);
          } catch {
            cloudDisabled = true;
            autosave.cancel();
            return;
          }
          const snapshotJson = JSON.stringify(snapshot);
          if (snapshotJson === lastSnapshotJson) return;
          lastSnapshotJson = snapshotJson;
          autosave.schedule(snapshot);
        }, Math.max(100, Number(pollMs) || DEFAULT_POLL_MS));
      } catch {
        // Authentication, network, missing cloud binding, or D1 errors leave the app local-only.
      } finally {
        clearTimeout(timeout);
        if (!disposed && !localRendered) setReady(true);
      }
    }

    bootstrap();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      if (pollTimer) clearInterval(pollTimer);
      autosave?.cancel();
    };
  }, [bootstrapTimeoutMs, fetchImpl, pollMs, storageOverride]);

  return ready ? children : null;
}
