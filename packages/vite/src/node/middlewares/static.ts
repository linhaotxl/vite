import type { NextHandleFunction } from 'connect'
import sirv from 'sirv'
import { cleanUrl } from '../utils'

/**
 * 静态资源 public 中间件
 */
export const servePublicMiddleware = (dir: string): NextHandleFunction => {
  const serve = sirv(dir)

  return (req, res, next) => {
    serve(req, res, next)
  }
}

export const serveStaticMiddleware = (dir: string): NextHandleFunction => {
  const serve = sirv(dir)

  return (req, res, next) => {
    const url = cleanUrl(req.url!)
    if (url.endsWith('.html')) {
      return next()
    }

    serve(req, res, next)
  }
}
