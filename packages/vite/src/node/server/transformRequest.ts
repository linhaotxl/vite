import { cleanUrl } from './../utils'
import { promises as fs } from 'node:fs'
import type { ViteDevServer } from '.'
import { createDebugger, isNil, isObject, isString } from '../utils'

const isDebug = !!process.env.DEBUG
const loadDebug = createDebugger('vite:load')
const transformDebug = createDebugger('vite:transform')

export const transformRequest = async (url: string, server: ViteDevServer) => {
  const { pluginContainer } = server

  // 1. resolve
  const resolveId = (await pluginContainer.resolveId(url))?.id ?? url

  return await loadAndTransform(resolveId, url, server)
}

/**
 * 使用 load 和 transform 钩子转换
 */
export const loadAndTransform = async (
  resolveId: string,
  url: string,
  server: ViteDevServer
) => {
  const { pluginContainer } = server
  const file = cleanUrl(resolveId)

  // 2. load
  const loadResult = await pluginContainer.load(resolveId)
  let code = ''

  if (isNil(loadResult)) {
    // 没有 load 钩子处理，则读取文件内容
    code = await fs.readFile(file, 'utf-8')
    isDebug && loadDebug(`[fs] ${resolveId}`)
  } else {
    isDebug && loadDebug(`[plugin] ${resolveId}`)
    // 使用 load 钩子的返回结果
    if (isString(loadResult)) {
      code = loadResult
    } else if (isObject(loadResult)) {
      code = loadResult.code
    }
  }

  // 在 transform 之前必须确保对应的 module 存在
  await server.moduleGraph.ensureEntryFromUrl(url)

  // 3. transform
  const transformResult = await pluginContainer.transform(code, resolveId)
  isDebug && transformDebug(`${resolveId}`)
  if (transformResult.code) {
    code = transformResult.code
  }

  return code
}
