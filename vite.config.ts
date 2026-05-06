import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-flow": ["@xyflow/react"],
          framer: ["framer-motion"],
          icons: ["lucide-react"],
          // sql.js bundles a copy of SQLite + WASM; keeping it as its
          // own chunk means the rest of the app's hot reload doesn't
          // re-bundle the WASM glue.
          sqlite: ["sql.js"],
        },
      },
    },
  },
  server: {
    port: 1420,
  },
});
