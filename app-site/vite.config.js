import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // The Sang app marketing site owns the apex: https://www.sangapp.in/. The Event CRM
  // moved off "/" onto its own host (events.sangapp.in) and its own Pages project, so
  // this site builds at base "/" into app-site/dist. src/main.jsx derives the react-router
  // basename from import.meta.env.BASE_URL, so the router follows this value.
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
