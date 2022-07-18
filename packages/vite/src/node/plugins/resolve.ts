import type { BrowserObjectField, PackageData } from '../package'
import { bareImportRE, createDebugger, isObject, normalizePath } from '../utils'
import path from 'node:path'
import fs from 'node:fs'
import type { Plugin } from '../plugin'
import { isFileReadable } from '../utils'
import { DEFAULT_EXTENSIONS } from '../constants'
import colors from 'picocolors'
import { resolvePackageData } from '../package'
import { resolve as _resolveExports } from 'resolve.exports'

/**
 * resolve plugin 外部配置
 */
export interface ResolveOptions {
  /**
   * 解析 package.json 入口字段列表，但是比 exports 字段的优先级低
   * @default ['module', 'jsnext:main', 'jsnext']
   */
  mainFields?: string[]

  /**
   * 导入时忽略的扩展名列表，resolve plugin 会依次遍历每一个扩展名，检查是否能匹配到
   * @default ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
   */
  extensions?: string[]

  /**
   * 解析 exports 字段时的条件
   */
  conditions?: string[]
}

/**
 * resolve plugin 内部配置
 */
export interface InternalResolveOptions extends ResolveOptions {
  /**
   * 根路径
   */
  root: string

  /**
   * 是否解析目录下的 index 文件
   */
  tryIndex: boolean

  /**
   * 是否跳过目录下的 package.json 文件
   */
  skipPackageJson: boolean

  /**
   * 是否是生产环境
   */
  isProduction: boolean

  /**
   * 是否是 web 环境
   */
  targetWeb?: boolean
}

const isDebug = process.env.DEBUG
const browserExternalId = '__vite-browser-external'

const idToPkgMap: Map<string, PackageData> = new Map()

const debug = createDebugger('vite:resolve-details')

export const resolvePlugin = (options: InternalResolveOptions): Plugin => {
  const { root } = options

  return {
    name: 'vite:resolve',

    resolveId(id, importer?) {
      // 如果是一个 browserExternalId，说明是一个无效的 id，直接返回不在处理，交由 load 返回具体的代码
      if (id.startsWith(browserExternalId)) {
        return browserExternalId
      }

      // 标明 web 环境
      options.targetWeb = true

      let res: string | undefined

      // 解析 URL；/foo -> /root/foo
      if (id.startsWith('/')) {
        const file = `${root}${id}`
        if ((res = tryFsResolve(file, options))) {
          isDebug && debug(`[url] ${colors.cyan(id)} -> ${colors.dim(res)}`)
          return res
        }
      }

      // 解析相对路径
      if (id.startsWith('.')) {
        // 父目录
        const dir = importer ? path.dirname(importer) : process.cwd()
        // 父目录 + id -> id 的绝对路径
        const fsPath = path.resolve(dir, id)
        // 解析 id 的绝对路径是否存在
        if ((res = tryFsResolve(fsPath, options))) {
          // 如果一个相对路径是从 package 中导入引用的，那么会将这个 package 中所有导入的相对路径都存入 idToPkgMap 中
          const pkg = idToPkgMap.get(importer ? importer : process.cwd())
          if (pkg) {
            idToPkgMap.set(res, pkg)
          }

          isDebug &&
            debug(`[relative] ${colors.cyan(id)} -> ${colors.dim(res)}`)
          return res
        }
      }

      // 解析模块
      if (bareImportRE.test(id)) {
        // 先查看模块是否在 browser 中
        if (
          options.targetWeb &&
          (res = tryResolveBrowserMapping(id, importer, options))
        ) {
          return res
        }

        if ((res = tryNodeResolve(id, importer, options))) {
          return res
        }
      }
    },

    load(id) {
      if (id === browserExternalId) {
        return `
export default new Proxy({}, {
  get (target, key) {
    throw new Error('模块在 browser 中被标记为 ${false}')
  }
})`.trim()
      }
    },
  }
}

/**
 * 解析 file 对应的具体文件
 */
const tryFsResolve = (file: string, options: InternalResolveOptions) => {
  const { fileName, postfix } = splitFileAndPostfix(file)

  let res: string | undefined

  // 1. 直接解析 file
  if ((res = tryResolveFile(fileName, options))) {
    return res + postfix
  }

  // 2. 加入扩展名解析
  for (const ext of options.extensions || DEFAULT_EXTENSIONS) {
    if ((res = tryResolveFile(`${fileName}${ext}`, options))) {
      return res + postfix
    }
  }

  // 3. 解析 index
  if ((res = tryResolveFile(fileName, options))) {
    return res + postfix
  }
}

/**
 * 解析具体的文件
 */
export const tryResolveFile = (
  fileName: string,
  options: InternalResolveOptions
): string | undefined => {
  const { skipPackageJson, tryIndex } = options
  if (isFileReadable(fileName)) {
    if (!fs.statSync(fileName).isDirectory()) {
      return fileName
    } else if (tryIndex) {
      if (!skipPackageJson) {
        // 解析 package.json
      }
      // 解析 index
      const index = tryFsResolve(path.join(fileName, 'index'), options)
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
export const tryNodeResolve = (
  moduleName: string,
  importer: string | undefined,
  options: InternalResolveOptions
) => {
  const basedir = importer ? path.dirname(importer) : process.cwd()

  // 可能需要解析的模块列表；顺序是从大到小
  // import slicedToArray from '@babel/runtime/helpers/esm/slicedToArray'
  // @babel/runtime
  // @babel/runtime/helpers
  // @babel/runtime/helpers/esm
  // @babel/runtime/helpers/esm/slicedToArray
  const possiblePkgIds: string[] = []
  let preSlashIndex = -1
  while (preSlashIndex) {
    // 1. 查找第一个 / 并截取
    let slashIndex = moduleName.indexOf('/', preSlashIndex + 1)

    if (slashIndex < 0) {
      slashIndex = moduleName.length
    }

    const part = moduleName.slice(
      preSlashIndex + 1,
      (preSlashIndex = slashIndex)
    )

    if (!part) {
      break
    }

    if (part[0] === '@') {
      continue
    }

    const path = moduleName.slice(0, slashIndex)
    possiblePkgIds.push(path)
  }

  // 解析每一个可能需要解析的模块，可能其中存在不正确的模块，所以 resolvePackageData 需要处理错误
  // 并且解析需要从小到大解析
  let pkg: PackageData | undefined
  const pkgId = possiblePkgIds.reverse().find(id => {
    pkg = resolvePackageData(id, basedir)
    return !!pkg
  })

  if (!pkg) {
    return
  }

  // 是否是嵌套导入
  const isDeepImport = pkgId !== moduleName
  let entryPath: string | undefined
  if (isDeepImport) {
    // 解析嵌套导入的入口文件
    entryPath = resolveDeepImport(moduleName.slice(pkgId!.length), pkg, options)
  } else {
    // 解析入口文件
    entryPath = resolvePackageEntry(pkgId!, pkg, options)
  }

  if (!entryPath) {
    return
  }

  // 每解析一个 package，将其记录下来
  idToPkgMap.set(entryPath, pkg)

  return entryPath
}

/**
 * 解析 package.json 模块入口
 */
const resolvePackageEntry = (
  moduleName: string,
  pkgData: PackageData,
  options: InternalResolveOptions
) => {
  const { data, dir } = pkgData
  const { exports, browser } = data

  let entryPoint: string | undefined | void

  // 解析 exports 字段
  if (exports) {
    entryPoint = resolveExports(data, '.', options)
  }

  // TODO: mjs 文件可以导入 cjs，使得 esm 环境失效

  // 兜底 main 字段
  entryPoint = entryPoint || data.main

  // 兜底解析 index.js
  const entryPoints: string[] = entryPoint ? [entryPoint] : ['index.js']

  for (let entry of entryPoints) {
    // 检测每个入口是否有 web 环境下特定的路径
    if (isObject(browser) && options.targetWeb) {
      entry = mapWithBrowserField(entry, browser) || entry
    }

    // 解析 entryPointPath 是否存在
    const entryPointPath = path.resolve(dir, entry)
    const resolveEntryPointPath = tryFsResolve(entryPointPath, options)

    if (resolveEntryPointPath) {
      isDebug &&
        debug(
          `[package entry] ${colors.cyan(moduleName)} -> ${colors.dim(
            resolveEntryPointPath
          )}`
        )
      return resolveEntryPointPath
    }
  }

  throw new Error(`${moduleName} 找不到`)
}

/**
 * 解析嵌套 package.json 模块入口
 * @param { string } id 导入模块的相对路径
 * @example
 *  import slicedToArray from '@babel/runtime/helpers/esm/slicedToArray'
 *  id: 'slicedToArray'
 */
const resolveDeepImport = (
  id: string,
  pkgData: PackageData,
  options: InternalResolveOptions
) => {
  id = `.${id}`
  const { dir, data } = pkgData
  const { exports } = data

  let relativeId: string | undefined | void = id

  // 解析 exports 字段
  if (exports) {
    if (isObject(exports)) {
      // import foo from 'bar/baz?url'
      // 处理嵌套模块中带有 query，需要先将 pathname 和 query 分离，再解析
      // 否则 resolveExports 会报错
      const { fileName, postfix } = splitFileAndPostfix(relativeId)

      // 解析 fileName 在 exports 中的值
      const exportsId = resolveExports(data, fileName, options)

      if (exportsId) {
        relativeId = `${exportsId}${postfix}`
      } else {
        relativeId = undefined
      }
    } else {
      relativeId = undefined
    }
  }

  // 将上一步解析出来的路径 + 目录 进行解析，解析出的结果就是嵌套导入的入口文件
  if (relativeId) {
    const res = tryFsResolve(path.join(dir, relativeId), options)
    if (res) {
      isDebug &&
        debug(`[node/deep-import] ${colors.cyan(id)} -> ${colors.dim(res)}`)
      return res
    }
  }
}

/**
 * 解析 exports 字段
 */
export const resolveExports = (
  data: PackageData['data'],
  field: string,
  { isProduction, conditions = [], targetWeb }: InternalResolveOptions
) => {
  const mode = isProduction ? 'production' : 'development'

  return _resolveExports(data, field, {
    browser: !!targetWeb,
    conditions: [mode, ...conditions],
  })
}

/**
 * 映射 browser 字段对应的路径
 * @param {string} id 映射的路径
 */
const mapWithBrowserField = (id: string, browser: BrowserObjectField) => {
  // 遍历 browser，将 id 和 key 都进行转换，检测是否相等
  const normalizeId = normalizePath(id)
  for (const [key, value] of Object.entries(browser)) {
    const normalizeKey = normalizePath(key)
    if (normalizeId === normalizeKey) {
      return value
    }
  }
}

/**
 * 解析模块 id 是否在 browser 字段中声明
 * @param {string | undefined} importer 导入 id 的文件
 */
export const tryResolveBrowserMapping = (
  id: string,
  importer: string | undefined,
  options: InternalResolveOptions
) => {
  // 在 package 中的所有文件都会在 idToPkgMap 中存储，
  // 所以可以通过 importer 来获取 package 的 packageData
  // 从而检测模块 id 是否是浏览器需要的
  const pkg = importer ? idToPkgMap.get(importer) : undefined
  if (!pkg || !isObject(pkg.data.browser)) {
    return
  }

  const {
    data: { browser },
  } = pkg

  // 获取 id 在 browser 字段中的值
  const browserPath = mapWithBrowserField(id, browser)
  // if (browserPath) {
  //   console.log(browserPath)
  // }

  // id 在 web 环境中不需要，直接返回 browserExternalId 表示这是一个外链
  if (browserPath === false) {
    return browserExternalId
  }
}
