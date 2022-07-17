import { unwrapId } from './../utils'
import { NextHandleFunction } from 'connect'
import { isHTMLProxy } from '../plugins/html'
import { ViteDevServer } from '../server'
import {
  isCssRequest,
  isImportRequest,
  isJSRequest,
  removeImportQuery,
} from '../utils'
import { transformRequest } from '../server/transformRequest'

export const transformMiddleware =
  (server: ViteDevServer): NextHandleFunction =>
  async (req, res, next) => {
    // 最开始对 url 进行解码，防止之后读取文件等操作...报错
    let url = decodeURI(req.url!)

    // 以下请求需要转换
    // 1. js 请求
    // 2. html 代理
    // 3. import 请求
    // 4. css 请求
    if (
      isJSRequest(url) ||
      isHTMLProxy(url) ||
      isImportRequest(url) ||
      isCssRequest(url)
    ) {
      // 移除 import 参数，之后可能会根据 url 读取文件，不移除是无法正确读取的
      url = removeImportQuery(url)

      // 去除 VALID_ID_PREFIX，标明这个参数说明是一个无效的 url，之后会在 resolve plugin 中处理
      url = unwrapId(url)

      const code = await transformRequest(url, server)

      res.setHeader('Content-Type', 'application/javascript')
      res.end(code)
      return
    }

    next()
  }
