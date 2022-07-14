import { createDevHtmlTransformFn } from './../middlewares/indexHtml'
import connect from 'connect'
import type { Server as HttpServer } from 'node:http'
import { resolveConfig } from '../config'
import type { InlineConfig, UserConfig, ResolvedConfig } from '../config'
import {
  CommonServerOptions,
  httpServerStart,
  resolveHttpServer,
} from '../http'
import type { Logger } from '../logger'
import { indexHtmlMiddleware } from '../middlewares/indexHtml'
import { createPluginContainer, PluginContainer } from './pluginContainer'
import { transformMiddleware } from '../middlewares/transform'
import { resolvePlugins } from '../plugins'

/**
 * vite 服务器选项
 */
export interface ViteDevServer {
  /**
   * 解析完成的配置
   */
  config: ResolvedConfig

  /**
   * http 服务器
   */
  httpServer: HttpServer | null

  /**
   * 监听端口
   */
  listen: (port?: number) => Promise<ViteDevServer>

  /**
   * 转换 html 内容的函数，用于 indexHtml 中间件
   */
  transformIndexHtml: (url: string, html: string) => Promise<string>

  /**
   * 插件容器
   */
  pluginContainer: PluginContainer
}

/**
 * 用户自定义服务器配置
 */
export type ServerOptions = CommonServerOptions

/**
 * 解析好的服务器 server 配置
 */
// eslint-disable-next-line
export interface ResolvedServerOptions {}

/**
 * 解析用户自定义的服务器配置
 */
export const resolveServerOptions = (
  root: string,
  raw: UserConfig['server'],
  logger: Logger
) => {
  const options = {
    ...raw,
  } as ResolvedServerOptions

  return options
}

/**
 * 创建服务器
 */
export const createServer = async (inlineConfig: InlineConfig) => {
  // 1. 解析配置
  const config = await resolveConfig(inlineConfig, 'serve', 'development')

  // 创建中间件服务
  const middlewares = connect()

  // 解析 http 服务配置
  const serverOptions = resolveServerOptions(
    config.root,
    config.server,
    config.logger
  )

  // 创建 http 服务器
  const httpServer = await resolveHttpServer(serverOptions, middlewares)

  // 创建插件容器
  const pluginContainer = createPluginContainer(config)

  const server: ViteDevServer = {
    config,
    httpServer,
    pluginContainer,
    listen(port) {
      return startServer(server, port)
    },
    transformIndexHtml: null!,
  }

  server.transformIndexHtml = createDevHtmlTransformFn(server)

  middlewares.use(transformMiddleware(server))

  middlewares.use(indexHtmlMiddleware(server))

  return server
}

/**
 * 开启服务
 */
const startServer = async (server: ViteDevServer, inlinePort?: number) => {
  const {
    config: {
      server: { port: configPort, strictPort, host },
      logger,
    },
    httpServer,
  } = server

  if (!httpServer) {
    throw new Error('以中间件模式开启服务器不能调用 listen 方法')
  }

  // 端口：行内 > 配置 > 默认
  const port = inlinePort ?? configPort ?? 5173

  // 解析实际监听的端口
  const resolvePort = await httpServerStart(httpServer, {
    port,
    logger,
    strictPort,
    host: '127.0.0.1',
  })

  // 以实际监听的端口打开浏览器
  console.log(`打开浏览器: http://localhost:${resolvePort}`)

  return server
}
