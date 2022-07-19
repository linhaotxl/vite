import dotenv from 'dotenv'
import dotenvExpand from 'dotenv-expand'
import { UserConfig } from './config'
import { arraify, lookupFile } from './utils'

const DEFAULT_ENV_PREFIX = 'VITE_'

export const loadEnv = (
  mode: string,
  envDir: string,
  prefix: UserConfig['envPrefix'] = DEFAULT_ENV_PREFIX
) => {
  // 解析 env 前缀
  const prefixs = resolveEnvPrefix(prefix)
  // 存储所有的 env 变量
  const envs: Record<string, string> = {}

  // 优先存储环境变量
  for (const envName in process.env) {
    if (
      prefixs.some(pre => envName.startsWith(pre)) &&
      envs[envName] === undefined
    ) {
      envs[envName] = process.env[envName] as string
    }
  }

  // env 文件，按照优先级加载
  const envFiels: string[] = [
    `.env.[${mode}].local`,
    `.env.[${mode}]`,
    `.env.local`,
    `.env`,
  ]

  // 处理每一个 env 文件
  for (const envName of envFiels) {
    // 加载 env 文件内容
    const envContent = lookupFile(envDir, [envName], { pathOnly: false })
    if (!envContent) {
      continue
    }

    // 解析 env 文件内容
    const parsed = dotenv.parse(envContent)
    dotenvExpand.expand({ parsed })

    Object.entries(parsed).forEach(([envName, value]) => {
      if (
        prefixs.some(pre => envName.startsWith(pre)) &&
        envs[envName] === undefined
      ) {
        envs[envName] = value
      }
    })
  }

  return envs
}

const resolveEnvPrefix = (
  prefix: UserConfig['envPrefix'] = DEFAULT_ENV_PREFIX
) => {
  const prefixs = arraify(prefix)
  if (prefixs.some(pre => pre === '')) {
    throw new Error('envPrefix 不能包含 ""')
  }

  return prefixs
}
