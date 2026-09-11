import React, { Suspense, lazy } from "react";
import "./intelligence/pwa.js";
import { createRoot } from "react-dom/client";
import { CloudPersistenceBoundary } from "./CloudPersistenceBoundary.jsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary.jsx";
import { GlobalAuditLauncher } from "./components/GlobalAuditLauncher.jsx";
import "./app-recovery.css";

// Keep the previous application module available to the repository test suite and
// future migrations, but production now mounts the clean closed-loop workflow.
const LegacyApp = lazy(async () => {
  const [, , , appModule] = await Promise.all([
    import("./styles.css"),
    import("./design-v66.css"),
    import("./space-cinematic.css"),
    import("./App.jsx"),
  ]);
  return { default: appModule.App };
});
void LegacyApp;

const App = lazy(() => import("./ResetApp.jsx").then((module) => ({ default: module.ResetApp })));

function AppBootFallback() {
  return (
    <main className="app-boot-shell" role="status" aria-live="polite" aria-busy="true" dir="rtl">
      <section>
        <span className="app-boot-mark" aria-hidden="true">K</span>
        <div>
          <strong>KOSIF</strong>
          <span>جارٍ تجهيز ملف مراجعة جديد…</span>
        </div>
        <span className="app-boot-progress" aria-hidden="true"><i /></span>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <CloudPersistenceBoundary disabled>
        <Suspense fallback={<AppBootFallback />}>
          <App />
        </Suspense>
        <GlobalAuditLauncher disabled />
      </CloudPersistenceBoundary>
    </AppErrorBoundary>
  </React.StrictMode>,
);
