import { ResolvedConfig } from '../config'
import type { Plugin } from '../plugin'
import { dataToEsm } from '@rollup/pluginutils'

export interface JsonOptions {
  /**
   * @default false
   */
  stringify?: boolean

  /**
   * @default true
   */
  namedExports?: boolean
}

const jsonRE = /\.(json)$/

export const jsonPlugin = (options: JsonOptions = {}): Plugin => {
  const { stringify = false, namedExports = true } = options

  return {
    name: 'vite:json',

    transform(code, resolveId) {
      if (!jsonRE.test(resolveId)) {
        return null
      }

      if (stringify) {
        return `export default JSON.parse(${JSON.stringify(code)})`
      }

      const data = JSON.parse(code)
      code = dataToEsm(data, {
        preferConst: true,
        namedExports,
      })

      return code
    },
  }
}
