import { NextHandleFunction } from 'connect'
import { isHTMLProxy } from '../plugins/html'
import { ViteDevServer } from '../server'
import { isImportRequest, isJSRequest, removeImportQuery } from '../utils'
import { transformRequest } from '../server/transformRequest'

export const transformMiddleware =
  (server: ViteDevServer): NextHandleFunction =>
  async (req, res, next) => {
    let url = req.url!

    if (isJSRequest(url) || isHTMLProxy(url) || isImportRequest(url)) {
      // 移除 import 参数，之后可能会根据 url 读取文件，不移除是无法正确读取的
      url = removeImportQuery(url)

      const code = await transformRequest(url, server)

      res.setHeader('Content-Type', 'application/javascript')
      res.end(code)
      return
    }

    next()
  }
