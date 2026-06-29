import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  plugins: [
    electron([
      {
        entry: '../electron/main.js',
        vite: { build: { outDir: '../dist-electron' } }
      },
      {
        entry: '../electron/preload.js',
        onstart(args) { args.reload() },
        vite: { build: { outDir: '../dist-electron' } }
      }
    ]),
    renderer()
  ]
})
