import fs, { promises as fsp } from 'fs'
import path from 'path'
import debug from 'debug'
import os from 'os'
import resolve from 'resolve'
import { URL } from 'node:url'
import {
  DEFAULT_EXTENSIONS,
  OptimizableEntryRE,
  VALID_ID_PREFIX,
} from './constants'
import { AliasOptions } from 'types/alias'
import { Alias } from '@rollup/plugin-alias'

const isWindows = os.platform() === 'win32'

interface LookupFileOptions {
  pathOnly?: boolean
}

export const lookupFile = (
  dir: string,
  formats: string[],
  options?: LookupFileOptions
) => {
  for (const format of formats) {
    const fullpath = path.join(dir, format)
    if (fs.existsSync(fullpath) && fs.statSync(fullpath).isFile()) {
      return options?.pathOnly ? fullpath : fs.readFileSync(fullpath, 'utf-8')
    }
  }
}

export type ViteDebugScope = `vite:${string}`

// export interface DebugerOptions {}

export const createDebugger = (
  namepsace: ViteDebugScope
  // options?: DebugerOptions
) => {
  const log = debug(namepsace)

  return (message: string, ...args: unknown[]) => {
    log(message, ...args)
  }
}
process
export const dynamicImport = (file: string) => import(file)

const toString = Object.prototype.toString
const toType = (value: unknown): string => toString.call(value)
const toRawType = (value: unknown) => toType(value).slice(8, -1)

export const isObject = (value: unknown): value is Record<string, any> =>
  toRawType(value) === 'Object'

export const isFunction = (value: unknown): value is Function =>
  typeof value === 'function'

export const isString = (value: unknown): value is string =>
  typeof value === 'string'

export const isBoolean = (value: unknown): value is boolean =>
  typeof value === 'boolean'

export const isUndefined = (value: unknown): value is undefined =>
  typeof value === 'undefined'

export const isNull = (value: unknown): value is null => null === value

export const isNil = (value: unknown): value is undefined | null | void =>
  isUndefined(value) || isNull(value)

export const isArray = Array.isArray

export const arraify = <T>(value: T | T[]): T[] =>
  Array.isArray(value) ? value : [value]

export const slash = (p: string) => p.replace(/\\/g, '/')

export const normalizePath = (p: string) =>
  path.posix.normalize(isWindows ? slash(p) : p)

export const queryRE = /\?.*$/
export const hashRE = /#.*$/
export const cleanUrl = (url: string) =>
  url.replace(hashRE, '').replace(queryRE, '')

/**
 * 检测文件是否可读
 */
export const isFileReadable = (fileName: string) => {
  const res = fs.existsSync(fileName)
  return !!res
}

/**
 * 检测是否是 js 请求
 */
const knownJsRequest = /\.(mjs|js|ts|jsx|tsx|vue)($|\?)/
export const isJSRequest = (url: string) => {
  url = cleanUrl(url)
  // 已知后缀的 js 文件请求
  if (knownJsRequest.test(url)) {
    return true
  }

  // 没有后缀，且不是以 / 结尾也视为 js 请求
  if (!path.extname(url) && !url.endsWith('/')) {
    return true
  }

  return false
}

/**
 * 向 url 中注入 query
 */
export const injectQuery = (url: string, inject: string) => {
  const resolvedUrl = new URL(url, 'relative:///')
  const { pathname, hash, search } = resolvedUrl

  const resolveSearch = search ? `&${search.slice(1)}` : ''
  const resolveHash = hash ? hash : ''
  return `${pathname}?${inject}${resolveSearch}${resolveHash}`
}

const trailingSeparatorRE = /[?&]$/

/**
 * import query 检测、删除
 */
const importRequestRE = /(\?|&)import=?(?:$|&)/
export const isImportRequest = (url: string) => importRequestRE.test(url)
export const removeImportQuery = (url: string) =>
  url.replace(importRequestRE, '$1').replace(trailingSeparatorRE, '')

/**
 * raw query 检测、删除
 */
const rawRE = /(\?|&)?raw[$&]?/
export const isRawRequest = (url: string) => rawRE.test(url)
export const removeRawQuery = (url: string) =>
  url.replace(rawRE, '$1').replace(trailingSeparatorRE, '')

/**
 * url query 检测、删除
 */
const urlRE = /(\?|&)?url[$&]?/
export const isUrlRequest = (url: string) => urlRE.test(url)
export const removeUrlQuery = (url: string) =>
  url.replace(urlRE, '$1').replace(trailingSeparatorRE, '')

/**
 * inline query 检测、删除
 */
const inlineRE = /(\?|&)?inline[$&]?/
export const isInlineRequest = (url: string) => inlineRE.test(url)

/**
 * css url 属性检测
 */
export const cssUrlRE = /url\(\s*('[^']+'|"[^"]+"|[^'")]+)\s*\)/
export const isCssUrl = (source: string) => cssUrlRE.test(source)

/**
 * import css url 检测
 */
export const importCssUrlRE = /@import\s*('[^']+\.css'|"[^"]+\.css"|[^'"]\.css)/
export const isImportCssUrl = (source: string) => importCssUrlRE.test(source)

/**
 * 检测是否是 css 请求
 */
const cssLangs = '\\.(css|scss|sass|less|styl|stylus)($|\\?)'
const cssLangRE = new RegExp(cssLangs)
const cssModuleRE = new RegExp(`\\.module${cssLangs}`)
export const normalizeCssLang = (url: string) => cssLangRE.exec(url)?.[1]
export const isCssRequest = (url: string) => cssLangRE.test(url)
export const isCssModuleRequest = (url: string) => cssModuleRE.test(url)

/**
 * 检测是否是 data url 请求
 */
const dataUrlRE = /^\s*data:/i
export const isDataUrl = (url: string) => dataUrlRE.test(url)

/**
 * 加载第三方模块路径
 */
export const resolveForm = (id: string, basedir: string) =>
  resolve.sync(id, {
    basedir,
    extensions: DEFAULT_EXTENSIONS,
    paths: [],
    // TODO:
    preserveSymlinks: false,
  })

/**
 * 嵌套加载第三方模块路径
 * 'foo > bar > qux'
 */
export const nestedResolveFrom = (pkgs: string | string[], basedir: string) => {
  // 解析 qux 必须从 bar 所在目录开始查找，如果直接在 foo 目录查找是不存在的
  const resolvePkgs = isArray(pkgs)
    ? pkgs
    : pkgs.split('>').map(pkgName => pkgName.trim())

  for (const pkg of resolvePkgs) {
    basedir = resolveForm(pkg, basedir)
  }
  return basedir
}

export const bareImportRE = /^[@\w](.*)/

/**
 * 合并 alias 配置
 */
export const mergeAlias = (a: AliasOptions, b: AliasOptions): AliasOptions => {
  if (isObject(a) && isObject(b)) {
    return { ...a, ...b }
  }
  return [...normalizeAlias(b), ...normalizeAlias(a)]
}

/**
 * 格式化 alias 配置
 */
export const normalizeAlias = (alias: AliasOptions): Alias[] => {
  if (isArray(alias)) {
    return alias
  }
  return Object.entries(alias).map(([find, replacement]) => ({
    find,
    replacement,
  }))
}

/**
 * 去除文件开头的 BOM
 */
export const stripBomTag = (code: string) =>
  code.charCodeAt(0) === 0xfeff ? code.slice(1) : code

/**
 * 去除 VALID_ID_PREFIX
 */
export const unwrapId = (id: string) =>
  id.startsWith(VALID_ID_PREFIX) ? id.slice(VALID_ID_PREFIX.length) : id

/**
 * 检测是否带有内置 query
 */
const SPECIAL_QUERY_RE = /[?&](raw)/
export const isSpecialQuery = (url: string) => SPECIAL_QUERY_RE.test(url)

/**
 *
 */
export const htmlTypesRE = /\.(html|vue)$/

export const virtualModuleRE = /^virtural-module:.*/
export const virturalModulePrefix = 'virtural-module:'

/**
 * 异步 String.prototype.replace
 */
export const asyncReplace = async (
  source: string,
  regexp: RegExp,
  replacer: (match: RegExpExecArray) => Promise<string>
) => {
  let input = source
  let rewriteSource = ''
  let match: RegExpExecArray | null = null
  if ((match = regexp.exec(source))) {
    rewriteSource += source.slice(0, match.index)
    rewriteSource += await replacer(match)
    input = source.slice(match.index + match[0].length)
  }

  return rewriteSource + input
}

/**
 * 检测是否是绝对路径
 */
const windowsDrivePathPrefixRE = /^[A-Za-z]:[/\\]/
export const isAbsolutePath = (path: string) => {
  if (!isWindows) {
    return path.startsWith('/')
  }
  return windowsDrivePathPrefixRE.test(path)
}

/**
 * 清空目录
 */
export const emptyDir = (dir: string, skip?: string[]) => {
  for (const file of fs.readdirSync(dir)) {
    if (skip?.includes(file)) {
      continue
    }
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true })
  }
}

/**
 * 写入文件
 */
export const asyncWriteFile = async (
  file: string,
  content: string,
  options?: fs.WriteFileOptions
) => {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) {
    await fsp.mkdir(dir, { recursive: true })
  }
  await fsp.writeFile(file, content, options)
}

export const flattenId = (id: string) =>
  id
    .replace(/[/:]/g, '_')
    .replace(/\./g, '__')
    .replace(/\s*>\s*/, '___')

export const normalizeId = (id: string) => id.replace(/\s*>\s*/, ' > ')

/**
 * 检查资源是否可以被预构建
 */
export const isOptimizable = (id: string) => OptimizableEntryRE.test(id)
