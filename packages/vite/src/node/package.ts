import fs from 'node:fs'
import path from 'node:path'
import { resolveForm } from './utils'

export type BrowserObjectField = Record<string, string | false>
export interface PackageData {
  dir: string

  data: {
    name: string
    type: string
    version: string
    main: string
    module?: string
    dependencies?: Record<string, string>
    exports?: string | Record<string, any>
    browser?: string | BrowserObjectField

    [field: string]: any
  }
}

/**
 * 解析 package.json 数据
 */
export const resolvePackageData = (moduleName: string, basedir: string) => {
  try {
    // 查找 package.json 文件地址
    const pkgPath = resolveForm(`${moduleName}/package.json`, basedir)
    // 加载 package.json 文件内容
    const pkgData = loadPackageData(pkgPath)

    return pkgData
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') {
      throw e
    }
  }
  return
}

/**
 * 加载 package.json 文件内容
 */
export const loadPackageData = (pkgPath: string) => {
  const content = fs.readFileSync(pkgPath, 'utf-8')
  const data = JSON.parse(content)
  const pkgData: PackageData = {
    dir: path.dirname(pkgPath),
    data,
  }

  return pkgData
}
