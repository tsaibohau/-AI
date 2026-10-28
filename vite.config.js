import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// 使用相對路徑，部署在 GitHub Pages 子路徑（/-AI/）也能正常載入
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '數學解惑',
        short_name: '數學解惑',
        description: '高中數學解題教學：四階段逐步提示，完全離線、免費',
        lang: 'zh-Hant-TW',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f7f8fa',
        theme_color: '#2b5fab',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // 本機 AI 的程式很大，只有啟用 AI 的人才需要：不預先快取，用到時再存起來
        // 「聽懂你的話」小模型的程式與模型檔也一樣：啟用的人才下載
        globIgnores: ['**/webllm-*.js', '**/transformers-*.js', '**/models/**'],
        runtimeCaching: [
          { urlPattern: /webllm-.*\.js$/, handler: 'CacheFirst', options: { cacheName: 'webllm-lib' } },
          { urlPattern: /transformers-.*\.js$/, handler: 'CacheFirst', options: { cacheName: 'nlu-lib' } },
        ],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'webllm', test: /node_modules[\\/]@mlc-ai/ }, { name: 'jsxgraph', test: /node_modules[\\/]jsxgraph/ }, { name: 'transformers', test: /node_modules[\\/](@huggingface|onnxruntime)/ }] },
      },
    },
    chunkSizeWarningLimit: 7000,
  },
  test: {
    include: ['tests/**/*.test.js'],
  },
});
