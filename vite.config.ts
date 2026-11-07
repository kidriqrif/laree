/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps the build path-agnostic: the repo may be renamed later.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022' },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}', 'brand/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
