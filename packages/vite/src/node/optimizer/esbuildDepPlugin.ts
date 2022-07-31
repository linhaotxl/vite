import { normalizePath } from './../utils'
import path from 'node:path'
import type { ImportKind, OnResolveResult, Plugin } from 'esbuild'
import type { ResolvedConfig } from '../config'
import type { ExportData } from '.'
import { KNOWN_ASSET_TYPES } from '../constants'

const externalTypes: string[] = [
  'css',
  'less',
  'sass',
  'scss',
  'styl',
  'stylus',

  ...KNOWN_ASSET_TYPES,
]

export const esbuildDepPlugin = (
  flatIdDeps: Record<string, string>,
  flatIdExports: Record<string, ExportData>,
  config: ResolvedConfig
): Plugin => {
  // 解析是否为入口，如果存在于 flatIdDeps 中说明是 dep 的入口
  const resolveEntry = (flatId: string): OnResolveResult | undefined => {
    if (flatId in flatIdDeps) {
      return {
        path: flatId,
        namespace: 'deps',
      }
    }
  }

  const _resolve = config.createResolver({})

  const _resolveRequire = config.createResolver({})

  const resolve = async (
    id: string,
    importer: string | undefined,
    kind: ImportKind
  ) => {
    const resolver = kind.startsWith('require') ? _resolveRequire : _resolve
    return await resolver(id, importer)
  }

  return {
    name: 'vite:dep-pre-bundle',

    setup(build) {
      // 解析资源
      build.onResolve(
        { filter: new RegExp(`\\.(${externalTypes.join('|')})$`) },
        async ({ path: id, importer, kind }) => {
          const resolveId = await resolve(id, importer, kind)
          if (resolveId) {
            return {
              // TODO:
              path: resolveId,
              external: true,
            }
          }
        }
      )

      // 解析模块
      build.onResolve({ filter: /^[@\w]/ }, async ({ path: id, importer }) => {
        const entry = resolveEntry(id)
        if (entry) {
          return entry
        }
      })

      // 加载预构建模块的入口文件
      build.onLoad({ filter: /.*/, namespace: 'deps' }, ({ path: flatId }) => {
        const resolveId = flatIdDeps[flatId]
        const { hasImports, exports } = flatIdExports[flatId]
        console.log(`${flatId} -------- `, resolveId, flatIdExports[flatId])

        const relativePath = normalizePath(
          path.relative(config.root, resolveId)
        )
        const relativeImportPath = JSON.stringify(relativePath)

        let contents = ''
        if (!hasImports && !exports.length) {
          // TODO:
          // 使用 export default 是将模块转换为 esm 形式并默认导出(export { xxx as default })
          // 使用 require 形式导入，保持模块自身的 cjs 形式不变
          // 使用 import 形式导入，会将模块自身转换为 esm 形式，即 module.exports 会挂载在 default 上，再将 default 默认导出
          // 无论使用哪种形式，导出的内容是不变的
          contents = `export default require(${JSON.stringify(relativePath)})`
          // contents = `import d from ${relativeImportPath};\nexport default d;`
        } else {
          // esm
          if (exports.includes('default')) {
            // 存在默认导出，只会将 default 导出
            contents += `import d from ${relativeImportPath};\nexport default d;\n`
          }
          if (exports.length > 1 || exports[0] !== 'default') {
            // 以下情况会将模块内的所有内容导出
            // 存在多个导出
            // 只有一个导出且不是 default
            contents += `export * from ${relativeImportPath};\n`
          }
        }

        console.log(contents)

        return {
          contents: contents,
          loader: 'js',
          // TODO: why
          resolveDir: config.root,
        }
      })
    },
  }
}
