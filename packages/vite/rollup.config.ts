import { defineConfig } from 'rollup'
import eslint from 'rollup-plugin-eslint2'
import nodeResolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import typescript from '@rollup/plugin-typescript'
import path from 'path'
import pkg from './package.json'

const base = __dirname
const resolve = (...p: string[]) => path.resolve(base, ...p)

export default (commandLine: any) => {
  const isDev = !!commandLine.watch
  const isProd = !isDev

  return defineConfig({
    input: {
      index: resolve('src/node/index.ts'),
      cli: resolve('src/node/cli.ts'),
    },

    output: {
      format: 'commonjs',
      dir: resolve('dist/node'),
    },

    external: [
      ...Object.keys(pkg.dependencies),
      ...(isProd ? [] : Object.keys(pkg.devDependencies)),
    ],

    plugins: [
      // alias({
      //   entries: {
      //     '@vue/compiler': require.resolve(
      //       '@vue/compiler-dom/dist/compiler-dom.cjs.js'
      //     )
      //   }
      // }),

      nodeResolve({
        // preferBuiltins: true
      }),

      typescript({
        tsconfig: resolve('src/node/tsconfig.json'),
        sourceMap: true,
        inlineSourceMap: true,
      }),

      // esbuild({
      //   tsconfig: resolve('tsconfig.json')
      // }),

      eslint({ fix: true, throwOnError: false }),

      commonjs({
        // extensions: ['.js'],
        // Optional peer deps of ws. Native deps that are mostly for performance.
        // Since ws is not that perf critical for us, just ignore these deps.
        // ignore: ['bufferutil', 'utf-8-validate']
      }),

      json(),
    ],
  })
}
