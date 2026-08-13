import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Output built files directly into ../backend/ for Hostinger deployment
    outDir: '../backend',
    emptyOutDir: false
  },
  server: {
    port: 5173,
    proxy: {
      // During local dev, proxy /api requests to the PHP dev server
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
