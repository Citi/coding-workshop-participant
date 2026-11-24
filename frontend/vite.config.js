import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/  -  `test` is read by Vitest (npm test)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    // Pages are lazy-loaded (see App.jsx); the shared vendor chunk (React + MUI, ~190 kB gzip) is
    // left to Rollup. A hand-written manualChunks split put CommonJS react-is in a separate chunk
    // and broke module initialisation in production ("setting 'AsyncMode'"), so it was removed.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/test/**', 'src/**/*.test.{js,jsx}'],
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
    },
  },
})
