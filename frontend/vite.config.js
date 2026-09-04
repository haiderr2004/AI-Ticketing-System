import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const configuredBase = process.env.VITE_APP_BASE_PATH || '/'
const appBase = `${configuredBase.startsWith('/') ? configuredBase : `/${configuredBase}`}${configuredBase.endsWith('/') ? '' : '/'}`

// https://vitejs.dev/config/
export default defineConfig({
  base: appBase,
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_TICKET_SERVICE_URL || 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
