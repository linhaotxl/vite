import { NextHandleFunction } from 'connect'
import { isHTMLProxy } from '../plugins/html'
import { ViteDevServer } from '../server'
import { isNull, isObject, isString } from '../utils'

export const transformMiddleware =
  (server: ViteDevServer): NextHandleFunction =>
  async (req, res, next) => {
    const { pluginContainer } = server

    const url = req.url!

    if (isHTMLProxy(url)) {
      // 1. resolve
      const resolveId = (await pluginContainer.resolveId(url)) || url
      // 2. load
      const loadResult = await pluginContainer.load(resolveId)

      let code = ''

      if (isNull(loadResult)) {
        loadResult
      } else {
        if (isString(loadResult)) {
          code = loadResult
        } else if (isObject(loadResult)) {
          code = loadResult.code
        }
      }

      // 3. transform
      const transformResult = await pluginContainer.transform(code, resolveId)
      if (transformResult.code) {
        code = transformResult.code
      }

      res.setHeader('Content-Type', 'application/javascript')
      res.end(code)
      return
    }

    next()
  }
