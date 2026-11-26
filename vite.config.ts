import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base './' ensures GitHub Pages subpath hosting (/please-pay-me/) works cleanly.
export default defineConfig({
  base: './',
  plugins: [react()],
})
