export default {
  entries: ['src/index.ts'],
  outDir: './dist',
  clean: true,
  declaration: true,
  sourcemap: true,
  rollup: {
    emitCJS: true,
  },
}
