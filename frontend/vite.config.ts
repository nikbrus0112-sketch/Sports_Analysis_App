/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev-only cross-origin fix: Vite serves the frontend on :5173, FastAPI runs
// separately on :8000 in development. In production the frontend is served BY
// FastAPI itself (see backend/app/main.py's frontend_dist_dir static mount) —
// same origin, so this proxy (and no CORS middleware) is all dev needs; the
// frontend can use relative fetch() paths unmodified in both environments.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/reference-clips': 'http://localhost:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    globals: true,
  },
})
