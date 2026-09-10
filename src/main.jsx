import React from "react";
import "./intelligence/pwa.js";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { CloudPersistenceBoundary } from "./CloudPersistenceBoundary.jsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary.jsx";
import "./styles.css";
import "./design-v66.css";
import "./space-cinematic.css";
import "./app-recovery.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <CloudPersistenceBoundary>
        <App />
      </CloudPersistenceBoundary>
    </AppErrorBoundary>
  </React.StrictMode>,
);
