/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    allowedHosts: ['watch.padilladevx.com'],
    proxy: {
      '/api': { target: 'http://localhost:3002', changeOrigin: true, credentials: true },
      '/socket.io': { target: 'http://localhost:3002', ws: true, changeOrigin: true },
      '/join': { target: 'http://localhost:3002', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/hooks/**'],
    },
  },
});
