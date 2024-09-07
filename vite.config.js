import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  //base: '/0709/',
  build: {
    assetsInlineLimit: 0, // 确保所有资源文件都作为单独的文件被复制
  }
})
