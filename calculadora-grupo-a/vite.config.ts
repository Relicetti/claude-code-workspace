import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { apiHandler } from './server/api.ts'

function apiPlugin(): Plugin {
  return {
    name: 'api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res, next) => apiHandler(req, res, next))
    },
  }
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
})
