import { isImportCssUrl, normalizePath } from './../utils'
import { promises as fs } from 'node:fs'
import colors from 'picocolors'
import path from 'node:path'
import { ResolvedConfig, ResolveFn } from '../config'
import type { Plugin } from '../plugin'
import {
  asyncReplace,
  cssUrlRE,
  importCssUrlRE,
  isCssModuleRequest,
  isCssRequest,
  isCssUrl,
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
import type * as Less from 'less'
import MagicString from 'magic-string'
import { fileToUrl } from './assets'

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
  less: ResolveFn
}

/**
 * vite css 配置
 */
export interface CssOptions {
  // css module 配置
  modules?: CSSModulesOptions | false

  // postcss 配置
  postcss?:
    | string
    | (PostCss.ProcessOptions & {
        plugins: PostCss.Plugin[]
      })

  // 预处理配置
  preprocessorOptions?: Record<
    keyof typeof PreprocessLang,
    StylePreprocessOptions
  >
}

/**
 * css module 配置
 */
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
type PreprocessorAdditionalResult = string

type PreprocessorAdditionalData =
  | string
  | ((
      code: string
    ) => PreprocessorAdditionalResult | Promise<PreprocessorAdditionalResult>)

/**
 * 预处理配置
 */
export interface StylePreprocessOptions {
  additionalData?: PreprocessorAdditionalData
  filename: string

  [key: string]: any
}

/**
 * 预处理解析器
 */
type StylePreprocessor = (
  code: string,
  root: string,
  options: StylePreprocessOptions,
  replacer: CssUrlReplacer,
  atImportResolves: CSSAtImportResolvers
) => Promise<{ code: string }>

const cssModulesCache: WeakMap<
  ResolvedConfig,
  Map<string, Record<string, string>>
> = new WeakMap()

/**
 * 替换 url 函数
 */
type CssUrlReplacer = (
  rawUrl: string,
  importer?: string | undefined
) => Promise<string> | string

/**
 * 创建预处理 css 解析器
 */
const createCSSResolvers = (config: ResolvedConfig): CSSAtImportResolvers => {
  let cssResovler: ResolveFn
  let lessResovler: ResolveFn

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

    // less 解析器主要解析 .less 和 .css 文件，以及 package.json 中的 less 和 style 字段所指文件
    get less() {
      return (
        lessResovler ||
        (lessResovler = config.createResolver({
          extensions: ['.less', '.css'],
          mainFields: ['less', 'style'],
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

  // 资源解析器，只能解析 css url 中的资源，必须是带有扩展名的全路径
  const resolver = config.createResolver({
    tryIndex: false,
    extensions: [],
  })

  const atImportResolves = createCSSResolvers(config)

  return {
    name: 'vite:css',

    async transform(raw, resolveId) {
      if (!isCssRequest(resolveId) || isSpecialQuery(resolveId)) {
        return null
      }

      const urlReplacer: CssUrlReplacer = async (rawUrl, importer) => {
        const resolveId = await resolver(rawUrl, importer)
        if (resolveId) {
          return fileToUrl(resolveId, config)
        }

        return rawUrl
      }

      const { code, modules } = await compileCss(
        resolveId,
        raw,
        config,
        urlReplacer,
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
  replacer: CssUrlReplacer,
  atImportResolves: CSSAtImportResolvers
): Promise<{ code: string; modules?: Record<string, string> | undefined }> => {
  // css module options
  const { css: { modules: cssModuleOptions, preprocessorOptions } = {}, root } =
    config

  // 是否是 css module
  const isModule = cssModuleOptions !== false && isCssModuleRequest(id)
  // 是否包含 @import
  const needInlineImport = code.includes('@import')
  // 是否包含 url()
  const hasUrl = cssUrlRE.test(code)
  // (pre)css 语言
  const lang = normalizeCssLang(id) as CssLangs | undefined
  // postcss config
  const postcssConfig = await resolvePostcssConfig(config)

  // 普通 css，直接返回，不再做任何处理
  if (
    !isModule &&
    !needInlineImport &&
    !hasUrl &&
    !postcssConfig &&
    lang === 'css'
  ) {
    return { code }
  }

  // // 预处理 css
  // if (lang && isPreprocessor(lang)) {
  //   const preprocessor = preProcessor[lang]
  //   const preprocessOption = preprocessorOptions?.[lang] ?? { filename: '' }
  //   // preprocessOption.filename = id

  //   const preprocessResult = await preprocessor(
  //     code,
  //     root,
  //     preprocessOption,
  //     replacer,
  //     atImportResolves
  //   )

  //   code = preprocessResult.code
  // }

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

  postCssPlugins.push(UrlRewritePostcssPlugin({ replacer }))

  const postcssResult = await (await import('postcss'))
    .default(postCssPlugins)
    .process(code, {
      ...postCssOptions,
      // TODO: 必须要加上 from 和 to，能保证每个 plugin 中能正确取得 impoter
      to: id,
      from: id,
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

const createViteLessPlugin = (less: typeof Less) => {
  class ViteLessManager extends less.FileManager {
    constructor(
      private rootFile: string,
      private atImportResolves: CSSAtImportResolvers,
      private replacer: CssUrlReplacer
    ) {
      super()
    }

    /**
     * 允许通过 loadFile 加载 @import 的文件
     */
    override supports(): boolean {
      return true
    }

    /**
     * 禁止通过 loadFileSync 加载 @import 的文件
     */
    override supportsSync(): boolean {
      return false
    }

    override async loadFile(
      id: string,
      dir: string,
      options: Less.LoadFileOptions,
      environment: Less.Environment
    ): Promise<Less.FileLoadResult> {
      const resolveId = await this.atImportResolves.less(
        id,
        path.join(dir, '*')
      )
      if (resolveId) {
        return {
          filename: resolveId,
          contents: await rebaseUrls(resolveId, this.rootFile, this.replacer),
          // contents: await fs.readFile(resolveId, 'utf-8'),
        }
      }
      return super.loadFile(id, dir, options, environment)
    }
  }

  return ViteLessManager
}

/**
 * less 预处理
 */
const less: StylePreprocessor = async (
  source,
  root,
  { additionalData, filename, ...rest },
  replacer,
  atImportResolves
) => {
  const nodeLess = await loadPreprocessor(PreprocessLang.less, root)

  const { code } = await getSource(source, additionalData)

  const lessResult = await nodeLess.render(code, {
    ...rest,
    filename,
    plugins: [
      {
        install(less, pluginManager) {
          const ViteLessManager = createViteLessPlugin(nodeLess)
          pluginManager.addFileManager(
            new ViteLessManager(root, atImportResolves, replacer)
          )
        },
      },
    ],
  })

  return {
    code: lessResult.css,
  }
}

/**
 * 检测是否是 css 预处理
 */
const preProcessor: Record<PreprocessLang, StylePreprocessor> = {
  [PreprocessLang.less]: less,
  [PreprocessLang.sass]: less,
  [PreprocessLang.scss]: less,
  [PreprocessLang.styl]: less,
  [PreprocessLang.stylus]: less,
}
export const isPreprocessor = (lang: string): lang is PreprocessLang =>
  lang in preProcessor

/**
 * 加载各种预处理包
 */
const loadedPreProcessor: Partial<Record<PreprocessLang, any>> = {}
function loadPreprocessor(
  lang: PreprocessLang.less,
  root: string
): Promise<typeof Less>
async function loadPreprocessor(lang: PreprocessLang, root: string) {
  if (loadedPreProcessor[lang]) {
    return loadedPreProcessor[lang]
  }
  try {
    const langPath = require.resolve(lang, {
      paths: [root, ...(require.resolve.paths(lang) ?? [])],
    })

    return (await import(langPath)).default
  } catch (e) {
    console.log(`${colors.red(`${lang} 模块加载失败`)}`)
  }
}

/**
 * 获取加载完预处理配置的代码
 */
export const getSource = async (
  code: string,
  additionalData?: PreprocessorAdditionalData
) => {
  if (!additionalData) {
    return { code }
  }

  if (isFunction(additionalData)) {
    const newContent = await additionalData(code)
    return { code: newContent }
  }

  const s = new MagicString(code)
  s.appendLeft(0, additionalData)

  return { code: s.toString() }
}

/**
 * postcss plugin - 重写 url
 */
export const UrlRewritePostcssPlugin: PostCss.PluginCreator<{
  replacer: CssUrlReplacer
}> = options => {
  if (!options) {
    throw new Error('UrlRewritePostcssPlugin 参数错误')
  }

  return {
    postcssPlugin: 'vite-url-rewrite',

    Once(root) {
      const tasks: Promise<void>[] = []

      // 遍历每一个 css 属性，如果属性中包含 url()，则对 url() 中的值使用 replacer 解析并重写
      root.walkDecls(decl => {
        const importer = decl.source?.input.file
        const cssValue = decl.value
        const hasCssUrl = isCssUrl(cssValue)

        if (hasCssUrl) {
          const task = () =>
            rewriteCssUrls(cssValue, importer, options.replacer).then(
              rewriteUrl => {
                decl.value = rewriteUrl
              }
            )
          tasks.push(task())
        }
      })

      if (tasks.length) {
        return Promise.all(tasks) as any
      }
    },
  }
}
UrlRewritePostcssPlugin.postcss = true

/**
 * 重写 css 属性中的 url
 */
const rewriteCssUrls = (
  cssValue: string,
  importer: string | undefined,
  replacer: CssUrlReplacer
) => {
  return asyncReplace(cssValue, cssUrlRE, async ([, matched]) =>
    doUrlReplace(matched, replacer, 'url', importer)
  )
}

/**
 * 将 css 属性中的 url 重写为 url 函数调用
 */
const doUrlReplace = async (
  matched: string,
  replacer: CssUrlReplacer,
  funcName: 'url',
  importer?: string
) => {
  let wrap = ''
  const first = matched[0]
  if (first === `'` || first === `"`) {
    wrap = first
    matched = matched.slice(1, -1)
  }

  const resolveId = await replacer(matched, importer)

  // 对解析后的地址进行编码，如果中间存在空格，则默认加入 '
  if (wrap === '' && resolveId !== encodeURI(resolveId)) {
    wrap = `'`
  }

  return `${funcName}(${wrap}${resolveId}${wrap})`
}

/**
 * 替换 css url
 */
const rebaseUrls = async (
  resolveId: string,
  rootFile: string,
  replacer: CssUrlReplacer
) => {
  let content = await fs.readFile(resolveId, 'utf-8')
  // 处理在 less 文件中存在 url()
  const hasCssUrl = isCssUrl(content)

  // 处理在 less 文件中存在 @import url('***.css')
  const hasImportCssUrl = isImportCssUrl(content)

  const rebaseFn = (url: string) => {
    const absolute = path.resolve(path.dirname(resolveId), url)
    const relative = path.relative(rootFile, absolute)
    return normalizePath(relative)
  }

  if (hasCssUrl) {
    content = await rewriteCssUrls(content, resolveId, rebaseFn)
  }

  // if (hasImportCssUrl) {
  //   console.log('存在 @import')
  //   content = await rewriteImportCssUrls(content, resolveId, replacer)
  // }

  return content
}

/**
 * 重写 @import css 的 url
 */
const rewriteImportCssUrls = (
  content: string,
  importer: string | undefined,
  replacer: CssUrlReplacer
) => {
  return asyncReplace(content, importCssUrlRE, async ([, rawUrl]) =>
    doUrlImportReplace(content, await replacer(rawUrl, importer))
  )
}

/**
 * 将 @import 的 url 重写为 url 导入
 */
const doUrlImportReplace = (importValue: string, resolveId: string) => {
  let wrap = ''
  if (importValue[0] === `'` || importValue[0] === `"`) {
    wrap = importValue[0]
  }

  if (wrap === '' && resolveId !== encodeURI(resolveId)) {
    wrap = `'`
  }

  return `@import ${wrap}${resolveId}${wrap}`
}
