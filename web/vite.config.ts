import path from 'node:path'

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const isServe = command === 'serve'
  const env = loadEnv(mode, process.cwd(), '')
  const useFs = env.VITE_DATA_USE_FS === 'true'
  const dataFsRoot =
    isServe && useFs ? path.resolve(__dirname, '../data/models') : ''

  return {
    define: {
      __DATA_FS_ROOT__: JSON.stringify(dataFsRoot),
    },
    server: {
      fs: {
        allow: [path.resolve(__dirname, '..')],
      },
    },
    plugins: [react(), tailwindcss()],
  }
})
