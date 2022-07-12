import { createDebugger } from './../utils'
import path from 'node:path'
import fs from 'node:fs'
import type { ResolvedConfig } from '../config'
import type { Plugin } from '../plugin'
import { isFileReadable } from '../utils'
import { DEFAULT_EXTENSIONS } from '../constants'
import colors from 'picocolors'

const isDebug = process.env.DEBUG

const debug = createDebugger('vite:resolve-details')

export const resolvePlugin = (config: ResolvedConfig): Plugin => {
  const { root } = config

  return {
    name: 'vite:resolve',

    resolveId(id, impoter?) {
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
        console.log('relative: ', impoter)
      }
    },
  }
}

const tryFsResolve = (
  file: string,
  tryIndex = true,
  skipPackageJson = true
) => {
  const fileName = file

  let res: string | undefined

  // 1. 直接解析 file
  if ((res = tryResolveFile(fileName, false, false))) {
    return res
  }

  // 2. 加入扩展名解析
  for (const ext of DEFAULT_EXTENSIONS) {
    if ((res = tryResolveFile(`${fileName}${ext}`, false, false))) {
      return res
    }
  }

  // 3. 解析 index
  if ((res = tryResolveFile(fileName, tryIndex, skipPackageJson))) {
    return res
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
