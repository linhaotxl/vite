import type { Server as HttpServer } from 'node:http'
import type { Logger } from './logger'
import type { ResolvedServerOptions } from './server'
import type { Server as ConnectServer } from 'connect'

/**
 * 服务器公共配置
 */
export interface CommonServerOptions {
  /**
   * 服务器端口
   */
  port?: number

  /**
   * 端口被占用是否直接退出，而不是尝试开启下一个端口
   */
  strictPort?: boolean

  /**
   * 指定服务器监听的地址
   */
  host?: string | boolean
}

/**
 * 监听 http 服务
 * @returns 实际监听的端口号
 */
export const httpServerStart = (
  server: HttpServer,
  options: {
    port: number
    strictPort?: boolean
    host?: string
    logger: Logger
  }
) => {
  return new Promise<number>((resolve, reject) => {
    const { strictPort, host, logger } = options
    let { port } = options

    // 监听端口错误事件
    const onError = (err: Error & { code: string }) => {
      if (err.code === 'EADDRINUSE') {
        if (strictPort) {
          server.removeListener('error', onError)
          reject(new Error(`Port ${port} is already in use`))
        } else {
          // 重试不能移除 error 事件，重试失败还要再次进入 error 事件，再次进行修改端口监听
          logger.info(`Port ${port} is in use, trying another one...`)
          server.listen(++port, host)
        }
      } else {
        server.removeListener('error', onError)
        reject(err)
      }
    }

    server.addListener('error', onError)

    // 监听端口，成功后移除错误事件
    server.listen(port, host, () => {
      server.removeListener('error', onError)
      resolve(port)
    })
  })
}

/**
 * 解析 http 服务器
 */
export const resolveHttpServer = async (
  options: ResolvedServerOptions,
  app: ConnectServer
) => {
  const { createServer } = await import('node:http')
  return createServer(app)
}
