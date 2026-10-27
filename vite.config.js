import { defineConfig } from 'vite';

// 使用相對路徑，部署在 GitHub Pages 子路徑（/-ai/）也能正常載入
export default defineConfig({
  base: './',
  test: {
    include: ['tests/**/*.test.js'],
  },
});
