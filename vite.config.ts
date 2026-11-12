import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Le manifeste est lui aussi derrière le code : le navigateur doit donc le demander avec le cookie.
      useCredentials: true,
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Mitch depann',
        short_name: 'Mitch depann',
        description: 'Suivi clients, véhicules et interventions',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f3f6fb',
        theme_color: '#1d4b86',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,woff2}'],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: { include: ['tests/**/*.test.ts'] },
})
