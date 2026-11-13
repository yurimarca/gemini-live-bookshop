import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  server: {
    port: 5173,
    host: true,
    // Prefer localhost so the printed URL works with microphone (secure context)
    open: 'http://localhost:5173',
  },
})
