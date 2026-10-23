import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the UI runs on :3000 and proxies /api to garry serve on :8123, so
// the browser talks to one origin, as it does when garry serve hosts the build.
export default defineConfig({
  plugins: [react()],
  envDir: "..",
  server: {
    port: 3000,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8123" },
  },
  preview: { port: 3000, proxy: { "/api": "http://127.0.0.1:8123" } },
  build: { outDir: "dist" },
});
