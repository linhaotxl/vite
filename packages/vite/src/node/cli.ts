import { cac } from 'cac'
import { resolveConfig } from './config'

const cli = cac('vite')

interface GlobalCLIOptions {
  c?: string | false
  config?: string | false

  m?: string
  mode?: string

  d?: string | boolean
  debug?: string | boolean
}

cli
  .option('-c, --config <file>', '[string] 使用指定配置文件')
  .option('-m, --mode <mode>', '[string] 指定环境变量')
  .option('-d, --debug [debug]', '[string | boolean] 指定环境变量')

// dev
cli
  .command('[root]', '开启dev服务')
  .action(async (root: string, options: GlobalCLIOptions) => {
    console.log('root: ', root, options)

    resolveConfig(
      {
        root,
        configFile: options.config,
      },
      'serve'
    )
  })

cli.parse()
