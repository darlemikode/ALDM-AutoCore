import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_API_TARGET: a qué backend reenviar /api (las pruebas de Playwright
// levantan uno aparte sobre una base de pruebas, ver e2e/README.md)
const BACKEND = process.env.VITE_API_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: BACKEND,
        changeOrigin: true,
        ws: true,
      },
      "/uploads": {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
});
