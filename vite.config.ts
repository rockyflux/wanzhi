import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 项目站：构建时设 VITE_BASE=/repo-name/
  base: process.env.VITE_BASE || '/',
  plugins: [vue()],
})
