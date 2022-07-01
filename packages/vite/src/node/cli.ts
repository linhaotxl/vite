import { cac } from 'cac'
import { resolveConfig } from './config'
import { LogLevel } from './logger'

const cli = cac('vite')

interface GlobalCLIOptions {
  c?: string | false
  config?: string | false

  m?: string
  mode?: string

  d?: string | boolean
  debug?: string | boolean

  l?: LogLevel
  logLevel?: LogLevel
}

cli
  .option('-c, --config <file>', '[string] 使用指定配置文件')
  .option('-m, --mode <mode>', '[string] 指定环境变量')
  .option('-d, --debug [debug]', '[string | boolean] 指定环境变量')
  .option('-l, --logLevel [level]', '[string] 指定日志级别')

// dev
cli
  .command('[root]', '开启dev服务')
  .action(async (root: string, options: GlobalCLIOptions) => {
    console.log('root: ', root, options)

    const { createServer } = await import('./server')
    const server = await createServer({
      root,
      configFile: options.config,
      logLevel: options.logLevel,
      mode: options.mode,
    })

    await server.listen()
  })

cli.parse()
