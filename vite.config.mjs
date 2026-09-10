import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function manualChunks(id) {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "vendor-react";
  if (id.includes("lucide-react")) return "vendor-icons";
  if (id.includes("pdfjs-dist")) return "vendor-pdf";
  if (id.includes("xlsx")) return "vendor-xlsx";
  if (id.includes("docx") || id.includes("jszip")) return "vendor-documents";
  return "vendor-misc";
}

export default defineConfig({
  build: {
    outDir: "dist/client",
    rollupOptions: {
      output: { manualChunks },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
