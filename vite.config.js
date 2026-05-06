import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '粵讀 — JyutRead',
        short_name: '粵讀',
        description: '學習5000常用漢字嘅粵語發音',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/jyut-read/',
        icons: [
          { src: '/jyut-read/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/jyut-read/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/jyut-read/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  base: '/jyut-read/'
})
