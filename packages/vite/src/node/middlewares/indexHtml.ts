import {
  applyIndexTransformHooks,
  IndexHtmlTransformHook,
} from './../plugins/html'
import { normalizePath } from './../utils'
import type { NextHandleFunction } from 'connect'
import path from 'node:path'
import fs from 'node:fs'
import { ViteDevServer } from '../server'
import { cleanUrl } from '../utils'
import { resolveHtmlTransforms } from '../plugins/html'

export const indexHtmlMiddleware =
  (server: ViteDevServer): NextHandleFunction =>
  async (req, res, next) => {
    const url = req.url && cleanUrl(req.url)
    if (url?.endsWith('.html')) {
      const filePath = getHtmlFilename(url, server)
      if (fs.existsSync(filePath)) {
        let html = fs.readFileSync(filePath, 'utf-8')
        html = await server.transformIndexHtml(url, html)

        res.statusCode = 200
        res.end(html)
      }
    }

    return next()
  }

/**
 * 获取 html 文件的绝对路径
 */
export const getHtmlFilename = (
  url: string,
  { config: { root } }: ViteDevServer
) => {
  return normalizePath(path.join(root, url.slice(1)))
}

export const createDevHtmlTransformFn = (
  server: ViteDevServer
): ViteDevServer['transformIndexHtml'] => {
  return async (url, html) => {
    const [preHooks, postHooks] = resolveHtmlTransforms(server.config.plugins)
    return await applyIndexTransformHooks(html, [
      ...preHooks,
      devIndexHtml,
      ...postHooks,
    ])
  }
}

export const devIndexHtml: IndexHtmlTransformHook = html => {
  return [
    {
      tag: 'div',
      children: '<span>123</span>',
      injectTo: 'head',
    },
  ]
}
