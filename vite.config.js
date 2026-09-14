import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const pages = mode === 'github-pages'
  const apiClient = fileURLToPath(new URL(pages ? './src/demoApi.js' : './src/liveApi.js', import.meta.url))

  return {
    base: pages ? '/learn-qa/' : '/',
    plugins: [react()],
    resolve: {
      alias: {
        'virtual:qa-api': apiClient,
      },
    },
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:3001',
        '/live': { target: 'ws://127.0.0.1:3001', ws: true },
      },
    },
  }
})
