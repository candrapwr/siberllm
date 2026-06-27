import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// electron-vite outputs to <root>/dist by default. We keep it there so it
// doesn't collide with electron-forge's output folder (out/).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    build: {
      outDir: 'dist/main',
      emptyOutDir: true,
      // Electron's main process must be CommonJS: it relies on __dirname and
      // must be require()-able by the Electron runtime.
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        },
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    build: {
      outDir: 'dist/preload',
      emptyOutDir: true,
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        },
        input: { index: resolve('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@': resolve('src/renderer/src')
      }
    },
    build: {
      outDir: 'dist/renderer',
      emptyOutDir: true,
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      }
    },
    plugins: [react()]
  }
})
