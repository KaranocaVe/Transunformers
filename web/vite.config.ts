import path from 'node:path'

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const isServe = command === 'serve'
  const dataFsRoot = isServe
    ? path.resolve(__dirname, '../data/models')
    : ''

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
