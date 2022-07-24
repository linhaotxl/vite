import path from 'node:path'
import type {
  LoadResult,
  SourceDescription,
  CustomPluginOptions,
  PartialResolvedId,
  ResolvedId,
} from 'rollup'
import { ResolvedConfig } from '../config'
import { Plugin } from '../plugin'
import { isNil, isObject, isString } from '../utils'

/**
 * 插件容器对象
 */
export interface PluginContainer {
  resolveId: (
    id: string,
    impoter?: string,
    options?: {
      skip?: Set<Plugin>
      custom?: CustomPluginOptions | undefined
      isEntry?: boolean | undefined
    }
  ) => Promise<PartialResolvedId | null>

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
  const { plugins, root } = config

  class Context {
    _activePlugin: Plugin | undefined

    async resolve(
      source: string,
      importer?: string | undefined,
      options?:
        | {
            custom?: CustomPluginOptions | undefined
            isEntry?: boolean | undefined
            skipSelf?: boolean | undefined
          }
        | undefined
    ) {
      const skip: Set<Plugin> | undefined =
        !!options?.skipSelf && this._activePlugin
          ? new Set([this._activePlugin])
          : undefined

      return (await container.resolveId(source, importer, {
        ...options,
        skip,
      })) as ResolvedId | null
    }
  }

  class TransformContext extends Context {}

  const container: PluginContainer = {
    async resolveId(
      id,
      impoter = path.resolve(root, 'index.html'),
      options = {}
    ) {
      const ctx = new Context()
      let resolveId: PartialResolvedId | null = null

      for (const plugin of plugins) {
        if (!plugin.resolveId) {
          continue
        }
        if (options.skip?.has(plugin)) {
          continue
        }

        ctx._activePlugin = plugin
        const result = await plugin.resolveId.call(ctx as any, id, impoter, {
          isEntry: !!options.isEntry,
          custom: options.custom,
        })

        if (result) {
          if (isString(result)) {
            resolveId = { id: result }
          } else if (isObject(result)) {
            resolveId = result
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
      const ctx = new TransformContext()

      for (const plugin of plugins) {
        if (!plugin.transform) {
          continue
        }
        const result = await plugin.transform.call(ctx as any, code, resolveId)

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
