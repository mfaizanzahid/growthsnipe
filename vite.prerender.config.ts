import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Bundles scripts/prerender-entry.tsx (and the marketing components it pulls
// in) into a single Node script. No CSS or static-asset imports may enter
// this graph — page components must stay import-clean (verified by audit).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  build: {
    outDir: "dist-prerender",
    emptyOutDir: true,
    minify: false,
    target: "node20",
    lib: {
      entry: "scripts/prerender-entry.tsx",
      formats: ["es"],
      fileName: () => "prerender.js",
    },
    rollupOptions: {
      external: [/^node:/],
    },
  },
});
