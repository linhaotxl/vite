import { normalizePath } from './../utils'
import fs from 'node:fs'
import path from 'node:path'
import { ResolvedConfig } from '../config'
import type { Plugin } from '../plugin'
import { cleanUrl, isUrlRequest, removeUrlQuery, isRawRequest } from '../utils'

export const assetsPlugin = (config: ResolvedConfig): Plugin => {
  const { assetsInclude, root } = config

  return {
    name: 'vite:assets',

    resolveId(id) {
      if (!assetsInclude(id)) {
        return
      }

      // 解析是否是 public 下的资源
      const resolved = checkPublicFile(config, id)
      if (resolved) {
        // TODO: 返回解析好的路径
        return resolved
      }
    },

    load(id) {
      // 无论什么文件，只要带有 ?raw 都会将其文件内容返回
      if (isRawRequest(id)) {
        return `export default ${JSON.stringify(
          fs.readFileSync(cleanUrl(id), 'utf-8')
        )}`
      }

      // 如果不是资源文件且不带 ?url 则不会处理，由其他 plugin 解析
      // 带有 ?url 的请求也被视为资源文件
      if (!assetsInclude(id) && !isUrlRequest(id)) {
        return
      }

      const url = removeUrlQuery(id.replace(root, ''))
      return `export default ${JSON.stringify(url)}`
    },
  }
}

/**
 * 检查是否是 public 下的文件
 */
export const checkPublicFile = ({ publicDir }: ResolvedConfig, id: string) => {
  if (!publicDir) {
    return
  }

  const idPath = path.join(publicDir, id)
  if (fs.existsSync(idPath)) {
    return idPath
  }
}

/**
 * 将文件路径映射为 url
 */
export const fileToUrl = async (file: string, config: ResolvedConfig) => {
  return fileToDevUrl(file, config)
}

const fileToDevUrl = (file: string, config: ResolvedConfig) => {
  if (file.startsWith(config.root)) {
    return `/${normalizePath(path.relative(config.root, file))}`
  }

  return file
}
