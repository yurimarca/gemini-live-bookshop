/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const gateway = process.env.VITE_DEV_GATEWAY ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  server: {
    port: 5173,
    strictPort: true, // another port would not match the gateway's ALLOWED_ORIGINS
    host: 'localhost', // a secure context for the microphone
    // Same-origin in development, like the Hosting rewrite in production.
    proxy: {
      '/api': { target: gateway, changeOrigin: false },
      '/ws': { target: gateway, ws: true, changeOrigin: false },
    },
  },
  build: {
    sourcemap: false,
    assetsInlineLimit: 0, // the audio worklet must be a real file: the CSP forbids data: scripts
    rollupOptions: {
      output: {
        manualChunks: { a2ui: ['@a2ui/react', '@a2ui/web_core'], firebase: ['firebase/app', 'firebase/auth', 'firebase/app-check'] },
      },
    },
  },
})
