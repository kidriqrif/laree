/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const THEME = '#FBF6EE'
const shortcutIcon = [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }]

// base './' keeps the build path-agnostic: the repo may be renamed later.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        start_url: './',
        scope: './',
        name: 'Laree',
        short_name: 'Laree',
        description: 'Training planner for triathlon, running and cycling.',
        lang: 'en-MY',
        display: 'standalone',
        theme_color: THEME,
        background_color: THEME,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-monochrome-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
        ],
        shortcuts: [
          { name: 'Log a session', url: './#/athlete/today?sheet=log', icons: shortcutIcon },
          { name: 'Today', url: './#/athlete/today', icons: shortcutIcon },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: { target: 'es2022' },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    // Above the 25 s async wait in the setup file, so a slow query fails with its own message.
    testTimeout: 60_000,
    // Page tests load whole lazy routes. With a worker per core they starve each other and time out.
    maxWorkers: '50%',
    include: ['src/**/*.test.{ts,tsx}', 'brand/**/*.test.ts', 'scripts/**/*.test.ts'],
    alias: {
      'virtual:pwa-register/react': fileURLToPath(new URL('./src/app/pwa/registerStub.ts', import.meta.url)),
    },
  },
})
