import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Sang app marketing site is served under "/app" (the CMS owns "/"). Assets and
  // the router basename both key off this. Built into the shared monorepo dist/app
  // so Cloudflare Pages serves it alongside the CMS (see root package.json).
  base: '/app/',
  build: {
    outDir: '../dist/app',
    emptyOutDir: true,
  },
})
