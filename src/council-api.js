import { normalizeProviderRegistry } from "./council-providers.js";

export async function fetchProviderRegistry({ fetchImpl = globalThis.fetch, timeoutMs = 5_000 } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Fetch is unavailable.");
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetchImpl("/api/council/providers", {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`provider-registry-${response.status}`);
    const payload = await response.json();
    return normalizeProviderRegistry(payload, new Date().toISOString());
  } finally {
    globalThis.clearTimeout(timeout);
    void startedAt;
  }
}

