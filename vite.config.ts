import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'shape',
        short_name: 'shape',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000',
        icons: []
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        globIgnores: [
          '**/*.wasm',
          '**/ort*.*',
          '**/opencv*.*',
          '**/ort.all.js',
          '**/ort.js',
          '**/ort.webgl.js'
        ]
      }
    })
  ],
  build: {
    sourcemap: true,
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  },
  preview: {
    port: 4173,
    strictPort: true
  }
})
