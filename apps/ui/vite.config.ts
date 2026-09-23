import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5183,
    proxy: {
      "/api": { target: "http://127.0.0.1:5180", changeOrigin: false },
      "/ws": { target: "ws://127.0.0.1:5180", ws: true },
    },
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 1200 },
});
