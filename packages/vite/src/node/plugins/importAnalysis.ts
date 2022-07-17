import colors from 'picocolors'
import { ResolvedConfig } from '../config'
import type { Plugin } from '../plugin'
import { init, parse as parseImports } from 'es-module-lexer'
import {
  cleanUrl,
  createDebugger,
  injectQuery,
  isCssRequest,
  isJSRequest,
  stripBomTag,
} from '../utils'
import MagicString from 'magic-string'
import { VALID_ID_PREFIX } from '../constants'

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

      // 去除 BOM，否则 parseImports 会解析失败
      code = stripBomTag(code)

      // 解析 import 语句
      await init
      const [imports, exports] = parseImports(code)

      const normalizeUrl = async (url: string): Promise<[string, string]> => {
        // 解析 url 对应的文件路径
        const resolved = await this.resolve(url, resolveId)
        console.log(`import 路径是 `, resolved)

        if (!resolved) {
          throw new Error(`${url} 找不到具体文件`)
        }

        // 如果解析好路径是在 root 里面，则将 root 替换为空，这样 url 就是以 / 开头
        // 在浏览器中发起新的资源请求，然后再处理
        if (resolved.id.startsWith(root)) {
          url = resolved.id.replace(root, '')
        } else {
          // 否则直接将 url 替换为解析结果
          url = resolved.id
        }

        // 如果 url 不是以 . 和 / 开头，说明上一步解析的是一个无效的 id，需要标记
        if (!url.startsWith('.') && !url.startsWith('/')) {
          url = `${VALID_ID_PREFIX}${url}`
        }

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
          console.log(`将 ${specifier} 重写为 ${url}`)
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
