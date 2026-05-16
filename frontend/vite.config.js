import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

function rewriteRootToApp() {
  return {
    name: 'rewrite-root-to-app',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, qs] = (req.url || '').split('?')
        if (path === '/' || path.startsWith('/#') || path.startsWith('/auth/')) {
          req.url = '/app.html' + (qs ? '?' + qs : '')
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), rewriteRootToApp()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'
    ),
  },
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'app.html'),
        landing: resolve(__dirname, 'landing.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
