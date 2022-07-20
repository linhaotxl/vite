import path from 'node:path'
import { ResolvedConfig, ResolveFn } from '../config'
import type { Plugin } from '../plugin'
import {
  isCssModuleRequest,
  isCssRequest,
  isFunction,
  isInlineRequest,
  isObject,
  isSpecialQuery,
  normalizeCssLang,
} from '../utils'
import type * as PostCss from 'postcss'
import postcssrc from 'postcss-load-config'
import type { Result as PostCssLoadConfigResult } from 'postcss-load-config'
import { dataToEsm } from '@rollup/pluginutils'
import { CLIENT_PUBLIC_PATH } from '../constants'

const enum PreprocessLang {
  less = 'less',
  sass = 'sass',
  scss = 'scss',
  styl = 'styl',
  stylus = 'stylus',
}

const enum PureCssLang {
  css = 'css',
}

type CssLangs = keyof typeof PureCssLang | keyof typeof PreprocessLang

interface CSSAtImportResolvers {
  css: ResolveFn
}

export interface CssOptions {
  modules?: CSSModulesOptions | false

  postcss?:
    | string
    | (PostCss.ProcessOptions & {
        plugins: PostCss.Plugin[]
      })
}

export interface CSSModulesOptions {
  getJSON?(
    cssFilename: string,
    json: { [name: string]: string },
    outputFilename?: string
  ): void

  localsConvention?: 'camelCase' | 'camelCaseOnly' | 'dashes' | 'dashesOnly'

  scopeBehaviour?: 'global' | 'local'
  globalModulePaths?: RegExp[]
  hashPrefix?: string
  generateScopedName?:
    | string
    | ((name: string, filename: string, css: string) => string)
}

const cssModulesCache: WeakMap<
  ResolvedConfig,
  Map<string, Record<string, string>>
> = new WeakMap()

/**
 * 创建 (pre)css 解析器
 */
const createCSSResolvers = (config: ResolvedConfig): CSSAtImportResolvers => {
  let cssResovler: ResolveFn

  return {
    get css() {
      // css 解析器主要解析 .css 文件，以及 package.json 中的 style 字段所指文件
      return (
        cssResovler ||
        (cssResovler = config.createResolver({
          extensions: ['.css'],
          mainFields: ['style'],
        }))
      )
    },
  }
}

/**
 * css 插件
 */
export const cssPlugin = (config: ResolvedConfig): Plugin => {
  const moduleCache = new Map()
  cssModulesCache.set(config, moduleCache)

  const atImportResolves = createCSSResolvers(config)

  return {
    name: 'vite:css',

    async transform(raw, resolveId) {
      if (!isCssRequest(resolveId) || isSpecialQuery(resolveId)) {
        return null
      }

      const { code, modules } = await compileCss(
        resolveId,
        raw,
        config,
        atImportResolves
      )

      if (modules) {
        moduleCache.set(resolveId, modules)
      }

      return { code }
    },
  }
}

export const cssPostPlugin = (config: ResolvedConfig): Plugin => {
  const modulesCache = cssModulesCache.get(config)!

  return {
    name: 'vite:css-post',

    transform(code, resolveId) {
      if (!isCssRequest(resolveId) || isSpecialQuery(resolveId)) {
        return null
      }

      const isInline = isInlineRequest(resolveId)

      const modules = modulesCache.get(resolveId)
      const modulesCode =
        modules && !isInline
          ? dataToEsm(modules, { preferConst: true })
          : undefined

      // 带有 ?inline 直接返回文件内容
      if (isInline) {
        return `export default ${JSON.stringify(code)}`
      }

      return [
        `import { updateStyle as __vite__updateStyle } from ${JSON.stringify(
          CLIENT_PUBLIC_PATH
        )}`,
        `const __vite__id = ${JSON.stringify(resolveId)}`,
        `const __vite__css = ${JSON.stringify(code)}`,
        `${modulesCode || 'export default __vite__css'}`,
        `__vite__updateStyle(__vite__id, __vite__css)`,
      ].join('\n')
    },
  }
}

/**
 * 编译 (pre)css
 */
const compileCss = async (
  id: string,
  code: string,
  config: ResolvedConfig,
  atImportResolves: CSSAtImportResolvers
): Promise<{ code: string; modules?: Record<string, string> | undefined }> => {
  // css module options
  const { css: { modules: cssModuleOptions } = {} } = config

  // 是否是 css module
  const isModule = cssModuleOptions !== false && isCssModuleRequest(id)
  // 是否包含 @import
  const needInlineImport = code.includes('@import')
  // (pre)css 语言
  const lang = normalizeCssLang(id) as CssLangs | undefined
  // postcss config
  const postcssConfig = await resolvePostcssConfig(config)

  // 普通 css，直接返回，不再做任何处理
  if (!isModule && !needInlineImport && !postcssConfig && lang === 'css') {
    return { code }
  }

  const { options: postCssOptions = {}, plugins: postCssPlugins = [] } =
    postcssConfig || {}
  let modules: Record<string, string> | undefined

  // 处理 @import
  if (needInlineImport) {
    postCssPlugins.push(
      (await import('postcss-import')).default({
        async resolve(id, basedir) {
          // 解析 @import 导入的路径，由于 resolve plugin 中会对 importer 进行 dirname 获取目录
          // 而这里的 basedir 已经是 id 所在的目录，为了统一所以需要往下级一层，以便 resolve plugin 中能正常工作
          const resolveId = await atImportResolves.css(
            id,
            path.join(basedir, '*')
          )
          console.log(`${id} 解析的结果是 ${resolveId}`)
          if (resolveId) {
            return resolveId
          }
          return id
        },
      })
    )
  }

  // 处理 css module
  if (isModule) {
    postCssPlugins.push(
      (await import('postcss-modules')).default({
        ...cssModuleOptions,
        getJSON(fileName, _modules, output) {
          modules = _modules
          if (isFunction(cssModuleOptions?.getJSON)) {
            cssModuleOptions!.getJSON(fileName, _modules, output)
          }
        },
        // resolve(file) {
        //   console.log('css module resolve file is ', file)
        //   return file
        // },
      })
    )
  }

  const postcssResult = await (await import('postcss'))
    .default(postCssPlugins)
    .process(code, {
      ...postCssOptions,
      // to: id,
      // from: id,
    })

  return { code: postcssResult.css, modules }
}

/**
 * 解析 postcss 配置
 */
const resolvePostcssConfig = async ({
  root,
  css: { postcss: postcssOptions } = {},
}: ResolvedConfig): Promise<
  Omit<PostCssLoadConfigResult, 'file'> | undefined
> => {
  let result: Omit<PostCssLoadConfigResult, 'file'> | undefined

  if (isObject(postcssOptions)) {
    result = {
      options: postcssOptions,
      plugins: postcssOptions.plugins,
    }
  } else {
    const searchPath = postcssOptions || root
    result = await postcssrc({}, searchPath)
  }

  return result
}
