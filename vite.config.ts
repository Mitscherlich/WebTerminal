import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    solid(),
    nodePolyfills({
      include: ['path', 'process', 'buffer', 'assert', 'util', 'stream'],
      globals: {
        global: true,
        process: true,
      },
      overrides: {
        fs: 'memfs',
      },
    }),
  ],
})
