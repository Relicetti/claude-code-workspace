import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { apiHandler } from './server/api'

function aneelApiPlugin(): Plugin {
  return {
    name: 'aneel-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res, next) => apiHandler(req, res, next))
      console.log('[aneel-api] montado em /api')
    },
  }
}

export default defineConfig({
  plugins: [react(), aneelApiPlugin()],
})
