import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Dev: the API runs on the Hangar server.
    proxy: { '/api': 'http://127.0.0.1:4777' },
  },
})
