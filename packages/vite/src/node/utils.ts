import fs from 'fs'
import path from 'path'
import debug from 'debug'
import os from 'os'

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
const toRawType = (value: unknown) => toType(value).slice(-1, 8)

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

export const forEach = <T>(
  arr: T[],
  fn: (item: T, index: number, array: T[]) => void
) => {
  let i = -1
  while (++i) {
    fn(arr[i], i, arr)
  }
}

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
