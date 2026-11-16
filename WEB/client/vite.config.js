import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const clientDir = fileURLToPath(new URL(".", import.meta.url));
const webRoot = path.resolve(clientDir, "..");

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:4000",
    },
    fs: {
      allow: [webRoot],
    },
  },
});
