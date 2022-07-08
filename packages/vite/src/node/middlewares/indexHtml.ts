import {
  addToHTMLProxyCache,
  applyIndexTransformHooks,
  getScriptInfo,
  IndexHtmlTransformHook,
  traverseHtml,
} from './../plugins/html'
import { normalizePath } from './../utils'
import type { NextHandleFunction } from 'connect'
import path from 'node:path'
import fs from 'node:fs'
import type { ViteDevServer } from '../server'
import { cleanUrl } from '../utils'
import { resolveHtmlTransforms } from '../plugins/html'
import { NodeTypes } from '@vue/compiler-dom'
import type { ElementNode, TextNode } from '@vue/compiler-dom'
import MagicString from 'magic-string'

/**
 * 处理 html 文件中间件
 */
export const indexHtmlMiddleware =
  (server: ViteDevServer): NextHandleFunction =>
  async (req, res, next) => {
    // 清空 url
    const url = req.url && cleanUrl(req.url)
    // 只会处理 html 文件请求
    if (url?.endsWith('.html')) {
      const filePath = getHtmlFilename(url, server)
      if (fs.existsSync(filePath)) {
        // 读取 html 文件内容
        let html = fs.readFileSync(filePath, 'utf-8')
        // 调用 server 里的钩子转换 html 文件内容
        html = await server.transformIndexHtml(url, html)
        //
        res.statusCode = 200
        res.end(html)
        return
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
  /**
   * 转换 html 文件内容钩子
   * @param { string } url  html 文件请求路径，不带有 ? 和 #，且末尾是 .html
   * @param { string } html html 文件内容
   */
  return async (url, html) => {
    // 按照执行时机解析所有的 hook
    const [preHooks, postHooks] = resolveHtmlTransforms(server.config.plugins)
    // 调用每个 hook
    return await applyIndexTransformHooks(
      html,
      [...preHooks, devIndexHtml, ...postHooks],
      {
        path: url,
        server,
        // fileName:
      }
    )
  }
}

export const devIndexHtml: IndexHtmlTransformHook = async (
  html,
  { path: htmlPath, server }
) => {
  const { config } = server
  const s = new MagicString(html)
  let inlineModuleIndex = -1

  const addInlineModule = (node: ElementNode) => {
    ++inlineModuleIndex

    addToHTMLProxyCache(config, htmlPath, inlineModuleIndex, {
      code: (node.children[0] as TextNode).content,
    })

    s.overwrite(
      node.loc.start.offset,
      node.loc.end.offset,
      `<script type="module" src=${htmlPath}?html-proxy&index=${inlineModuleIndex}.js></script>`
    )
  }

  // 遍历 html 节点
  await traverseHtml(html, node => {
    if (node.type !== NodeTypes.ELEMENT) {
      return
    }

    if (node.tag === 'script') {
      // 获取 script 标签信息
      const { src, isModule } = getScriptInfo(node)
      if (isModule && node.children.length) {
        addInlineModule(node)
      } else if (src) {
        console.log('src')
      }
    }

    if (node.tag === 'style') {
      console.log('style')
    }
  })

  return {
    html: s.toString(),
    tags: [],
  }
}
