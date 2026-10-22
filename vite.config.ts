import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { createRequire } from "node:module";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
  ],
  test: {
    // Real SQLite (node:sqlite) backs the Drizzle query tests. It is
    // behind a flag on Node 22/23 and unflagged on Node 24+, so the flag is
    // added only when the runtime does not already expose the module.
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: sqliteExecArgv(),
      },
    },
  },
  server: {
    allowedHosts: true,
    // Runtime state and build output change on their own (local D1 writes
    // under .wrangler on every API call, dist on build). Watching them makes
    // the dev server reload the page spuriously — sometimes in a loop, since
    // each reload refetches APIs that write D1 again.
    watch: {
      ignored: ["**/.wrangler/**", "**/dist/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});

/**
 * `--experimental-sqlite` is only needed where node:sqlite is still flagged
 * (Node 22/23). Node 24+ exposes it unflagged, and passing the flag there
 * would be an unknown option, so it is only added when the module is not
 * already importable.
 */
function sqliteExecArgv(): string[] {
  try {
    createRequire(import.meta.url)("node:sqlite");
    return [];
  } catch {
    return ["--experimental-sqlite"];
  }
}
