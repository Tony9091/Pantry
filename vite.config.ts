import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base so the built app works from any sub-path (GitHub Pages,
  // a folder on a NAS, file-served previews, …) without reconfiguration.
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  server: {
    host: true,
    port: 5173,
  },
})
