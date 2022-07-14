import { PackageData } from './../package'
import { bareImportRE, createDebugger } from './../utils'
import path from 'node:path'
import fs from 'node:fs'
import type { ResolvedConfig } from '../config'
import type { Plugin } from '../plugin'
import { isFileReadable } from '../utils'
import { DEFAULT_EXTENSIONS } from '../constants'
import colors from 'picocolors'
import { resolvePackageData } from '../package'
import { resolve as _resolveExports } from 'resolve.exports'

const isDebug = process.env.DEBUG

const debug = createDebugger('vite:resolve-details')

export const resolvePlugin = (config: ResolvedConfig): Plugin => {
  const { root } = config

  return {
    name: 'vite:resolve',

    resolveId(id, importer?) {
      let res: string | undefined

      // 解析 URL；/foo -> /root/foo
      if (id.startsWith('/')) {
        const file = `${root}${id}`
        if ((res = tryFsResolve(file))) {
          isDebug && debug(`[url] ${colors.cyan(id)} -> ${colors.dim(res)}`)
          return res
        }
      }

      // 解析相对路径
      if (id.startsWith('.')) {
        const dir = path.dirname(importer!)
        const relative = path.relative(dir, id)
        const file = path.resolve(root, relative)
        if ((res = tryFsResolve(file))) {
          isDebug &&
            debug(`[relative] ${colors.cyan(id)} -> ${colors.dim(res)}`)
          return res
        }
      }

      // 解析模块
      if (bareImportRE.test(id)) {
        if ((res = tryNodeResolve(id, importer))) {
          return res
        }
      }
    },
  }
}

const tryFsResolve = (
  file: string,
  tryIndex = true,
  skipPackageJson = true
) => {
  const { fileName, postfix } = splitFileAndPostfix(file)

  let res: string | undefined

  // 1. 直接解析 file
  if ((res = tryResolveFile(fileName, false, false))) {
    return res + postfix
  }

  // 2. 加入扩展名解析
  for (const ext of DEFAULT_EXTENSIONS) {
    if ((res = tryResolveFile(`${fileName}${ext}`, false, false))) {
      return res + postfix
    }
  }

  // 3. 解析 index
  if ((res = tryResolveFile(fileName, tryIndex, skipPackageJson))) {
    return res + postfix
  }
}

/**
 * 解析具体的文件
 */
export const tryResolveFile = (
  fileName: string,
  tryIndex: boolean,
  skipPackageJson: boolean
): string | undefined => {
  if (isFileReadable(fileName)) {
    if (!fs.statSync(fileName).isDirectory()) {
      return fileName
    } else if (tryIndex) {
      if (!skipPackageJson) {
        // 解析 package.json
      }
      // 解析 index
      const index = tryResolveFile(
        path.join(fileName, 'index'),
        tryIndex,
        skipPackageJson
      )
      if (index) {
        return index
      }
    }
  }
}

/**
 * 切割文件名和查询条件
 */
export const splitFileAndPostfix = (file: string) => {
  let fileName = file
  let postfix = ''

  let postfixIndex = file.indexOf('?')
  if (postfixIndex === -1) {
    postfixIndex = file.indexOf('#')
  }

  if (postfixIndex > -1) {
    fileName = file.slice(0, postfixIndex)
    postfix = file.slice(postfixIndex)
  }

  return { fileName, postfix }
}

/**
 * 尝试解析 node 模块
 */
export const tryNodeResolve = (moduleName: string, importer: string) => {
  const basedir = path.dirname(importer)

  // 加载 package.json 文件内容
  const pkg = resolvePackageData(moduleName, basedir)
  if (!pkg) {
    return
  }

  // 解析入口文件
  const entryPath = resolvePackageEntry(moduleName, pkg)

  return entryPath
}

/**
 * 解析 package.json 模块入口
 */
const resolvePackageEntry = (moduleName: string, pkgData: PackageData) => {
  const { data, dir } = pkgData

  let entryPoint: string | undefined | void

  // 解析 exports 字段
  if (data.exports) {
    entryPoint = resolveExports(data, '.')
  }

  // TODO: mjs 文件可以导入 cjs，使得 esm 环境失效

  // 兜底 main 字段
  entryPoint = entryPoint || data.main || 'index.js'

  const entryPointPath = path.resolve(dir, entryPoint)

  // 解析入口文件为绝对路径
  const resolveEntryPointPath = tryFsResolve(entryPointPath)
  if (resolveEntryPointPath) {
    isDebug &&
      debug(
        `[package entry] ${colors.cyan(moduleName)} -> ${colors.dim(
          resolveEntryPointPath
        )}`
      )
    return resolveEntryPointPath
  }

  throw new Error(`${moduleName} 找不到`)
}

/**
 * 解析 exports 字段
 */
export const resolveExports = (data: PackageData['data'], field: string) => {
  return _resolveExports(data, field)
}
