import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl'

// Relative base so the build works on GitHub Pages, behind the FastAPI server, or as a static artifact.
export default defineConfig({
  base: './',
  plugins: [react(), glsl({ compress: true })],
  server: { host: true, port: 5173, proxy: { '/api': 'http://127.0.0.1:8000' } },
  build: { target: 'es2020', chunkSizeWarningLimit: 1600 },
})
