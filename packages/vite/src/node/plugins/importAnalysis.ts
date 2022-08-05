import type { ViteDevServer } from '../server'
import path from 'node:path'
import fs from 'node:fs'
import colors from 'picocolors'
import { ResolvedConfig } from '../config'
import type { Plugin } from '../plugin'
import { init, parse as parseImports } from 'es-module-lexer'
import type { ImportSpecifier } from 'es-module-lexer'
import {
  cleanUrl,
  createDebugger,
  injectQuery,
  isCssRequest,
  isDataUrl,
  isJSRequest,
  stripBomTag,
  normalizePath,
} from '../utils'
import MagicString from 'magic-string'
import { CLIENT_PUBLIC_PATH, FS_PREFIX, VALID_ID_PREFIX } from '../constants'
import { lexAcceptedHmrDeps } from '../server/hmr'
import { findStaticImports, parseStaticImport } from 'mlly'

const isDebug = !!process.env.DEBUG
const debug = createDebugger('vite:import-analysis')

export const importAnalysisPlugin = (config: ResolvedConfig): Plugin => {
  const { root } = config
  let server: ViteDevServer

  return {
    name: 'vite:import-analysis',

    configureServer(_server) {
      server = _server
    },

    async transform(code, resolveId) {
      // 跳过不需要处理的文件类型
      if (canSkipImportAnalysis(resolveId)) {
        isDebug && debug(colors.dim(`[skipped] ${resolveId}`))
        return null
      }
      debugger
      // 去除 BOM，否则 parseImports 会解析失败
      code = stripBomTag(code)

      // 解析 import 语句
      await init
      const [imports, exports] = parseImports(code)

      const normalizeUrl = async (url: string): Promise<[string, string]> => {
        // 解析 url 对应的文件路径
        const resolved = await this.resolve(url, resolveId)

        if (!resolved) {
          throw new Error(`${url} 找不到具体文件`)
        }

        // url 对应的文件在 root 下，则将 root 替换为空，这样 url 就是以 / 开头
        // 在浏览器中发起新的资源请求，然后再处理
        if (resolved.id.startsWith(root)) {
          url = resolved.id.replace(root, '')
        } else if (fs.existsSync(cleanUrl(resolved.id))) {
          // 不在 root 下面，标记 FS_PREFIX
          url = normalizePath(path.join(FS_PREFIX, resolved.id))
        } else {
          // 否则直接将 url 替换为解析结果
          url = resolved.id
        }

        // 如果 url 不是以 . 和 / 开头，说明上一步解析的是一个无效的 id，需要标记 VALID_ID_PREFIX
        if (!url.startsWith('.') && !url.startsWith('/')) {
          url = `${VALID_ID_PREFIX}${url}`
        }

        // 向非 js、css 请求注入 import
        url = markExplicitImport(url)

        return [url, resolved.id]
      }

      const importedModule = server.moduleGraph.idToModuleMap.get(resolveId)!
      let hasEnv = false
      let hasHMR = false
      // 自引入
      let isSelfAccepting = false
      const importedUrls = new Set<string>()
      // 记录 import.meta.hot.accept 的依赖
      const acceptedUrls = new Set<{
        url: string
        start: number
        end: number
      }>()
      // 记录静态导入语句导入的模块
      const importBindings = new Set<string>()
      const staticImportedUrls: Set<string> = new Set()
      let s: MagicString | undefined
      const str = () => s || (s = new MagicString(code))

      for (let index = 0; index < imports.length; ++index) {
        const {
          s: start,
          e: end,
          ss: expStart,
          se: expEnd,
          n: specifier,
          d: dynamicIndex,
        } = imports[index]

        const isDynamicImport = dynamicIndex > -1
        const rawUrl = code.slice(start, end)

        if (rawUrl === 'import.meta') {
          const method = code.slice(end, end + 4)
          if (method === '.env') {
            hasEnv = true
          }
          if (method === '.hot') {
            hasHMR = true
            if (code.slice(end + 4, end + 11) === '.accept') {
              // 检测是否是自引入，并记录依赖
              if (
                lexAcceptedHmrDeps(
                  code,
                  code.indexOf('(', end + 11) + 1,
                  acceptedUrls
                )
              ) {
                isSelfAccepting = true
              }
            }
          }
          continue
        }

        if (specifier) {
          // 不会重写 data url，直接让 data url 以原样形式发起请求
          if (isDataUrl(specifier)) {
            continue
          }

          // 跳过 client，不再重复请求
          if (specifier === CLIENT_PUBLIC_PATH) {
            continue
          }

          // 解析重写后的 url 和 resolveId
          const [url, resolveId] = await normalizeUrl(specifier)
          str().overwrite(start, end, isDynamicImport ? `'${url}'` : url)
          // if (!isDynamicImport) {
          //   staticImportedUrls.add(resolveId)
          // }

          // 提取静态导入的模块
          extractImportBindings(resolveId, code, imports[index], importBindings)
        }
      }

      // 注入 env 环境变量，以及以 import.meta.env 开头的全局变量
      if (hasEnv) {
        let env = `import.meta.env = ${JSON.stringify(
          { ...config.env },
          null,
          2
        )};\n`
        if (config.define) {
          for (const [key, value] of Object.entries(config.define)) {
            if (key.startsWith('import.meta.env.')) {
              env += `${key} = ${
                typeof value === 'string' ? `(${value})` : JSON.stringify(value)
              }\n`
            }
          }
        }

        str().prepend(env)
      }

      // 注入 hmr 所需要的函数
      if (hasHMR) {
        // TODO:
        str().prepend(
          [
            `\nimport { createHotContext as __vite__createHotContext } from ${JSON.stringify(
              '/' + CLIENT_PUBLIC_PATH
            )}`,
            `import.meta.hot = __vite__createHotContext(${JSON.stringify(
              importedModule.url
            )})\n`,
          ].join('\n')
        )
        // str().prepend(
        // `\nimport { createHotContext as __vite__createHotContext } from ${JSON.stringify(
        //   '/' + CLIENT_PUBLIC_PATH
        // )}
        // import.meta.hot = __vite__createHotContext(${JSON.stringify(
        //   importedModule.url
        // )})
        //   `
        // )
      }

      // 格式化 acceptedUrls 中的内容
      const normailzeAcceptedUrls = new Set<string>()
      for (const { url, start, end } of acceptedUrls) {
        normailzeAcceptedUrls.add(url)
      }

      // 更新 module 的内容
      server.moduleGraph.updateModuleInfo(
        importedModule,
        importedUrls,
        importBindings,
        normailzeAcceptedUrls,
        isSelfAccepting
      )

      return s ? s.toString() : code
      // staticImportedUrls.forEach((id) => {
      // })
    },
  }
}

/**
 * 需要跳过分析的文件
 */
const skipRE = /\.json$/
export const canSkipImportAnalysis = (id: string) => {
  return skipRE.test(id)
}

/**
 * 检测是否是 js、css 请求
 */
export const isExplicitRequest = (url: string) => {
  url = cleanUrl(url)
  return !isJSRequest(url) && !isCssRequest(url)
}

/**
 * 标记非 js、css 请求为 import
 */
const markExplicitImport = (url: string) => {
  if (isExplicitRequest(url)) {
    return injectQuery(url, 'import')
  }
  return url
}

/**
 * 提取 import 导入的变量
 */
const extractImportBindings = (
  id: string,
  code: string,
  specifier: ImportSpecifier,
  binding: Set<string>
) => {
  const importStatement = code.slice(specifier.ss, specifier.se)
  const [match] = findStaticImports(importStatement)
  const parsed = parseStaticImport(match)

  if (parsed.defaultImport) {
    binding.add('default')
  }

  if (parsed.namespacedImport) {
    binding.add('*')
  }

  if (parsed.namedImports) {
    for (const name of Object.keys(parsed.namedImports)) {
      binding.add(name)
    }
  }
}
