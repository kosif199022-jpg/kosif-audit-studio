import React from "react";
import "./intelligence/pwa.js";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { CloudPersistenceBoundary } from "./CloudPersistenceBoundary.jsx";
import "./styles.css";
import "./design-v66.css";
import "./space-cinematic.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CloudPersistenceBoundary>
      <App />
    </CloudPersistenceBoundary>
  </React.StrictMode>,
);
