import { ResolvedConfig } from '../config'
import type { Plugin } from '../plugin'
import {
  isCssModuleRequest,
  isCssRequest,
  isFunction,
  isObject,
  isSpecialQuery,
  normalizeCssLang,
} from '../utils'
import type * as PostCss from 'postcss'
import postcssrc from 'postcss-load-config'
import type { Result as PostCssLoadConfigResult } from 'postcss-load-config'
import { dataToEsm } from '@rollup/pluginutils'

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

export const cssPlugin = (config: ResolvedConfig): Plugin => {
  const moduleCache = new Map()
  cssModulesCache.set(config, moduleCache)

  return {
    name: 'vite:css',

    async transform(raw, resolveId) {
      if (!isCssRequest(resolveId) || isSpecialQuery(resolveId)) {
        return null
      }

      const { code, modules } = await compileCss(resolveId, raw, config)

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

      const modules = modulesCache.get(resolveId)
      const modulesCode = modules
        ? dataToEsm(modules, { preferConst: true })
        : undefined

      return `
const __vite__css = ${JSON.stringify(code)}
${modulesCode || 'export default __vite__css'}
      `.trim()
    },
  }
}

const compileCss = async (
  id: string,
  code: string,
  config: ResolvedConfig
): Promise<{ code: string; modules?: Record<string, string> | undefined }> => {
  const { css: { modules: cssModuleOptions } = {} } = config

  const isModule = cssModuleOptions !== false && isCssModuleRequest(id)
  const needInlineImport = code.includes('@import')
  const lang = normalizeCssLang(id) as CssLangs | undefined
  const postcssConfig = await resolvePostcssConfig(config)

  // 普通 css，直接返回
  if (!isModule && !needInlineImport && !postcssConfig && lang === 'css') {
    return { code }
  }

  const { options: postCssOptions = {}, plugins: postCssPlugins = [] } =
    postcssConfig || {}
  let modules: Record<string, string> | undefined

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
