import { LoadResult, SourceDescription } from 'rollup'
import { ResolvedConfig } from '../config'
import { isNil, isObject, isString } from '../utils'

/**
 * 插件容器对象
 */
export interface PluginContainer {
  resolveId: (id: string, impoter?: string) => Promise<string | null>

  load: (id: string) => Promise<LoadResult>

  transform: (
    code: string,
    resolveId: string
  ) => Partial<SourceDescription> | Promise<Partial<SourceDescription>>
}

/**
 * 插件插件容器
 */
export const createPluginContainer = (config: ResolvedConfig) => {
  const { plugins } = config

  const container: PluginContainer = {
    async resolveId(id, impoter?) {
      let resolveId: string | null = null

      for (const plugin of plugins) {
        if (!plugin.resolveId) {
          continue
        }

        const result = await plugin.resolveId(id, impoter)

        if (result) {
          if (isString(result)) {
            resolveId = result
          } else if (isObject(result)) {
            resolveId = result.id
          }

          break
        }
      }

      return resolveId
    },

    async load(id) {
      for (const plugin of plugins) {
        if (!plugin.load) {
          continue
        }

        const result = await plugin.load(id)
        if (!isNil(result)) {
          return result
        }
      }

      return null
    },

    async transform(code, resolveId) {
      for (const plugin of plugins) {
        if (!plugin.transform) {
          continue
        }
        const result = await plugin.transform(code, resolveId)

        if (isObject(result)) {
          result.code && (code = result.code || code)
        } else if (isString(result)) {
          code = result
        }
      }

      return {
        code,
      }
    },
  }

  return container
}
