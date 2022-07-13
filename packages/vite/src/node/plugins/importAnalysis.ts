import colors from 'picocolors'
import { ResolvedConfig } from '../config'
import type { Plugin } from '../plugin'
import { init, parse as parseImports } from 'es-module-lexer'
import { cleanUrl, createDebugger, injectQuery, isJSRequest } from '../utils'
import MagicString from 'magic-string'

const isDebug = !!process.env.DEBUG
const debug = createDebugger('vite:import-analysis')

export const importAnalysisPlugin = (config: ResolvedConfig): Plugin => {
  const { root } = config

  return {
    name: 'vite:import-analysis',

    async transform(code, resolveId) {
      // 跳过不需要处理的文件类型
      if (canSkipImportAnalysis(resolveId)) {
        isDebug && debug(colors.dim(`[skipped] ${resolveId}`))
        return null
      }

      // 解析 import 语句
      await init
      const [imports, exports] = parseImports(code)

      const normalizeUrl = async (url: string): Promise<[string, string]> => {
        // 解析 url 对应的文件路径
        const resolved = await this.resolve(url, resolveId)

        if (!resolved) {
          throw new Error('111')
        }

        // 将 url 解析为可以被 URL 构造的 url
        // if (resolved.id.startsWith(root)) {
        //   url = resolved.id.replace(root, '')
        // }

        // 向非 js、css 请求注入 import
        url = markExplicitImport(url)

        return [url, resolved.id]
      }

      let hasEnv = false
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
            console.log('hot')
          }
          continue
        }

        if (specifier) {
          const [url, resolveId] = await normalizeUrl(specifier)

          str().overwrite(start, end, url)
          // if (!isDynamicImport) {
          //   staticImportedUrls.add(resolveId)
          // }
        }
      }

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
  return !isJSRequest(url)
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
