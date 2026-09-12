import React, { Suspense, lazy } from "react";
import "./intelligence/pwa.js";
import { createRoot } from "react-dom/client";
import { AppErrorBoundary } from "./components/AppErrorBoundary.jsx";
import { OperatingModelGuide } from "./components/OperatingModelGuide.jsx";
import "./app-recovery.css";
import "../operating-model.css";

const App = lazy(() => import("./ResetApp.jsx").then((module) => ({ default: module.ResetApp })));
const ResetVoiceLauncher = lazy(() => import("./components/ResetVoiceLauncher.jsx").then((module) => ({ default: module.ResetVoiceLauncher })));

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
      <Suspense fallback={<AppBootFallback />}>
        <App />
      </Suspense>
      <Suspense fallback={null}>
        <ResetVoiceLauncher />
      </Suspense>
      <OperatingModelGuide />
    </AppErrorBoundary>
  </React.StrictMode>,
);
