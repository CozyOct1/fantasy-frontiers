import { defineConfig } from "vite";

export default defineConfig({
  // Production is served below this Nginx path; local Vite development remains at `/`.
  base: process.env.VITE_BASE_PATH ?? (process.env.NODE_ENV === "production" ? "/fantasy-frontiers/" : "/"),
  server: {
    strictPort: true,
  },
});
