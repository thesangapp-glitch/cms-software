import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  // The CRM is served at the root of its own host, https://events.sangapp.in/, from a
  // Pages project separate from the marketing site at the apex (see root package.json).
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
