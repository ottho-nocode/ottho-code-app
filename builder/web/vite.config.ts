import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL("../dist", import.meta.url)), emptyOutDir: true },
  server: {
    port: 3100,
    proxy: {
      // L'API n'accepte les écritures que depuis sa propre origine : le proxy de dev la réécrit.
      "/api": {
        target: "http://127.0.0.1:4317",
        changeOrigin: true,
        configure: (proxy) => proxy.on("proxyReq", (req) => req.setHeader("origin", "http://127.0.0.1:4317")),
      },
    },
  },
});
