import fs from 'fs'
import path from 'path'
import debug from 'debug'

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

export interface DebugerOptions {}

export const createDebugger = (
  namepsace: ViteDebugScope,
  options?: DebugerOptions
) => {
  const log = debug(namepsace)

  return (message: string, ...args: unknown[]) => {
    log(message, ...args)
  }
}

export const dynamicImport = (file: string) => import(file)

const toString = Object.prototype.toString
const toType = (value: unknown): string => toString.call(value)
const toRawType = (value: unknown) => toType(value).slice(-1, 8)
export const isObject = (value: unknown): value is Record<string, any> =>
  toRawType(value) === 'Object'
