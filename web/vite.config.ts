import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  // CMS is the main site, served at "/". Built into the shared monorepo dist so
  // Cloudflare Pages serves it alongside the /app marketing site (see root package.json).
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
})
