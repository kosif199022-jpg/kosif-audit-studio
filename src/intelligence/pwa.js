const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
let lastUpdateCheckAt = 0;

function announceUpdate(registration) {
  if (!registration?.waiting) return;
  window.dispatchEvent(new CustomEvent("kosif:pwa-update-ready", {
    detail: { registration },
  }));
}

async function registerKosifServiceWorker() {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !import.meta.env.PROD ||
    !window.isSecureContext
  ) return;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    announceUpdate(registration);

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          announceUpdate(registration);
        }
      });
    });

    const checkForUpdate = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastUpdateCheckAt < UPDATE_CHECK_INTERVAL_MS) return;
      lastUpdateCheckAt = now;
      registration.update().catch(() => {});
    };

    document.addEventListener("visibilitychange", checkForUpdate, { passive: true });
    window.addEventListener("online", checkForUpdate, { passive: true });
  } catch {
    // PWA support is an enhancement; audit work must remain available without it.
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("load", registerKosifServiceWorker, { once: true });
}
