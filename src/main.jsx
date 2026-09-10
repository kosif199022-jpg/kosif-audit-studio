import React, { Suspense, lazy } from "react";
import "./intelligence/pwa.js";
import { createRoot } from "react-dom/client";
import { CloudPersistenceBoundary } from "./CloudPersistenceBoundary.jsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary.jsx";
import { GlobalAuditLauncher } from "./components/GlobalAuditLauncher.jsx";
import "./app-recovery.css";

const App = lazy(async () => {
  const [, , , appModule] = await Promise.all([
    import("./styles.css"),
    import("./design-v66.css"),
    import("./space-cinematic.css"),
    import("./App.jsx"),
  ]);
  return { default: appModule.App };
});

function AppBootFallback() {
  return (
    <main className="app-boot-shell" role="status" aria-live="polite" aria-busy="true" dir="rtl">
      <section>
        <span className="app-boot-mark" aria-hidden="true">K</span>
        <div>
          <strong>KOSIF</strong>
          <span>جارٍ تجهيز مساحة المراجعة…</span>
        </div>
        <span className="app-boot-progress" aria-hidden="true"><i /></span>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <CloudPersistenceBoundary>
        <Suspense fallback={<AppBootFallback />}>
          <App />
        </Suspense>
        <GlobalAuditLauncher />
      </CloudPersistenceBoundary>
    </AppErrorBoundary>
  </React.StrictMode>,
);
