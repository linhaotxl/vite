import { defineConfig } from 'rollup'
import esbuild from 'rollup-plugin-esbuild'
import eslint from 'rollup-plugin-eslint2'
import path from 'path'

const base = __dirname
const resolve = (...p: string[]) =>  path.resolve(base, ...p)

export default defineConfig({

  input: {
    index: resolve('src/node/index.ts'),
    cli: resolve('src/node/cli.ts'),
  },

  output: {
    format: 'commonjs',
    dir: resolve('dist/node')
  },

  plugins: [
    esbuild(),

    eslint({ fix: true, throwOnError: false })
  ]

})
