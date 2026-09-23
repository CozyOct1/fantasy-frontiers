import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  // Production is served below this Nginx path; local Vite development remains at `/`.
  base: process.env.VITE_BASE_PATH ?? (process.env.NODE_ENV === "production" ? "/fantasy-frontiers/" : "/"),
  server: {
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: { game: resolve(import.meta.dirname, "index.html"), mapEditor: resolve(import.meta.dirname, "map-editor.html") },
    },
  },
});
