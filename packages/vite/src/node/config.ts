import fs from 'fs'
import path from 'path'
import { build } from 'esbuild'
import { AliasOptions } from 'types/alias'
import type { Alias } from '@rollup/plugin-alias'
import { createFilter } from '@rollup/pluginutils'
import aliasPlugin from '@rollup/plugin-alias'

import {
  lookupFile,
  createDebugger,
  isObject,
  isFunction,
  normalizePath,
  normalizeAlias,
  mergeAlias,
} from './utils'
import { Plugin } from './plugin'
import { loadEnv } from './env'
import {
  ResolvedServerOptions,
  resolveServerOptions,
  ServerOptions,
} from './server'
import { createLogger, Logger, LogLevel } from './logger'
import { resolvePlugins } from './plugins'
import { JsonOptions } from './plugins/json'
import {
  CLIENT_ENTRY,
  CLIENT_PUBLIC_PATH,
  DEFAULT_ASSETS_RE,
} from './constants'
import {
  InternalResolveOptions,
  ResolveOptions,
  resolvePlugin,
} from './plugins/resolve'
import { createPluginContainer } from './server/pluginContainer'
import type { PluginContainer } from './server/pluginContainer'
import { CssOptions } from './plugins/css'

export interface UserConfig {
  /**
   * 根路径
   */
  root?: string

  /**
   * 执行环境
   */
  mode?: string

  /**
   * 插件
   */
  plugins?: Plugin[]

  /**
   * 环境变量前缀，只有满足前缀的环境变量才会被加入到客户端，通过 import.meta.env 访问到
   * @default 'VITE_'
   */
  envPrefix?: string | string[]

  /**
   * 环境变量文件所在目录
   */
  envDir?: string

  /**
   * 日志级别
   * @default 'info'
   */
  logLevel?: LogLevel

  /**
   * 输出日志是否允许清屏
   * @default true
   */
  clearScreen?: boolean

  /**
   * 服务器 server 配置
   */
  server?: ServerOptions

  /**
   * 解析 JSON 文件配置
   */
  json?: JsonOptions

  /**
   * 解析相关配置
   */
  resolve?: ResolveOptions & { alias: AliasOptions }

  /**
   * 静态资源服务的文件夹
   */
  publicDir?: string | false

  /**
   * 额外的静态资源文件
   */
  assetsInclude?: string | RegExp | (string | RegExp)[]

  /**
   * css 配置
   */
  css?: CssOptions
}

export interface InlineConfig extends UserConfig {
  configFile?: string | false
}

export type ResolvedConfig = Readonly<Omit<UserConfig, 'assetsInclude'>> & {
  root: string
  env: Record<string, string>

  logger: Logger

  server: ResolvedServerOptions

  plugins: Plugin[]

  resolve: ResolveOptions & { alias: Alias[] }

  publicDir: string

  assetsInclude: (file: string) => boolean

  isProduction: boolean

  createResolver: (options: Partial<InternalResolveOptions>) => ResolveFn
}

type ResolveFn = (
  id: string,
  importer?: string,
  aliasOnly?: boolean
) => Promise<string | undefined>

export type Command = 'build' | 'serve'

export interface ConfigEnv {
  command: Command
  mode: string
}

export type UserConfigFn = (
  configEnv: ConfigEnv
) => UserConfig | Promise<UserConfig>
export type UserConfigExport = UserConfig | UserConfigFn

interface NodeModuleWithCompile extends NodeModule {
  _compile: (code: string, fileName: string) => any
}

const debug = createDebugger('vite:config')

/**
 * 解析配置
 * @param config
 * @param cammand
 */
export const resolveConfig = async (
  config: InlineConfig,
  command: Command,
  defaultMode = 'development'
) => {
  const mode = config.mode || defaultMode

  const configEnv: ConfigEnv = {
    command,
    mode,
  }

  config.root = config.root || process.cwd()

  const resolveRoot = normalizePath(config.root)

  const { configFile } = config
  if (configFile !== false) {
    const loadResult = await loadConfigFromFile(
      configEnv,
      config.root,
      config.configFile as string | undefined
    )

    if (loadResult) {
      config = {
        ...config,
        ...loadResult.config,
      }
    }
  }

  // 创建日志
  const logger = createLogger(config.logLevel, {
    allowClearScreen: config.clearScreen,
  })

  // 解析服务器配置
  const server = resolveServerOptions(resolveRoot, config.server, logger)

  // 根据插件 apply 解析需要执行的插件
  const rawUserPlugins = (config.plugins?.flat(Infinity) ?? []).filter(
    plugin => {
      if (!plugin) {
        return false
      }
      if (!plugin.apply) {
        return false
      }
      if (isFunction(plugin.apply)) {
        return plugin.apply(config, configEnv)
      }
      if (plugin.apply) {
        return plugin.apply === command
      }
    }
  )

  const isProduction = (process.env.NODE_ENV || mode) === 'production'

  // 解析 publicDir
  const resolvedPublicDir =
    config.publicDir !== false && config.publicDir !== ''
      ? path.resolve(resolveRoot, config.publicDir || 'public')
      : ''

  // 获取各个时机执行的插件
  const [prePlugins, normalPlugins, postPlugins] =
    sortUserPlugins(rawUserPlugins)

  // 加载 env
  const envDir = config.envDir ? normalizePath(config.envDir) : resolveRoot
  const loadedEnv = loadEnv(mode, envDir, config.envPrefix)

  // 创建额外的静态资源过滤器
  const assetsFilter = config.assetsInclude
    ? createFilter(config.assetsInclude)
    : () => false

  const createResolver: ResolvedConfig['createResolver'] = resolveOptions => {
    let alaisContainer: PluginContainer
    let resolveContainer: PluginContainer

    return async (id, importer, alaisOnly) => {
      let container: PluginContainer

      if (alaisOnly) {
        alaisContainer =
          alaisContainer ||
          createPluginContainer({
            ...resolved,
            plugins: [aliasPlugin({ entries: resolved.resolve.alias })],
          })

        container = alaisContainer
      } else {
        resolveContainer =
          resolveContainer ||
          createPluginContainer({
            ...resolved,
            plugins: [
              aliasPlugin({ entries: resolved.resolve.alias }),
              resolvePlugin({
                ...resolved.resolve,
                root: resolveRoot,
                tryIndex: true,
                skipPackageJson: false,
                isProduction,
                ...resolveOptions,
              }),
            ],
          })

        container = resolveContainer
      }

      return (await container.resolveId(id, importer))?.id
    }
  }

  const clientAlias: Alias[] = [
    { find: new RegExp(`^${CLIENT_PUBLIC_PATH}`), replacement: CLIENT_ENTRY },
  ]

  const resolved: ResolvedConfig = {
    ...config,
    root: resolveRoot,
    plugins: [],
    env: {
      ...loadedEnv,
    },
    createResolver,
    logger,

    publicDir: resolvedPublicDir,

    isProduction,

    server,

    resolve: {
      ...config.resolve,
      alias: normalizeAlias(
        mergeAlias(clientAlias, normalizeAlias(config.resolve?.alias ?? []))
      ),
    },

    assetsInclude(file) {
      return DEFAULT_ASSETS_RE.test(file) || assetsFilter(file)
    },
  }

  // 创建内置插件列表
  const plugins = resolvePlugins(resolved)

  resolved.plugins = plugins

  return resolved
}

/**
 * 加载配置文件
 */
const loadConfigFromFile = async (
  configEnv: ConfigEnv,
  root: string,
  configFile?: string
) => {
  let resolvedPath: string | undefined
  let isESM = false
  let isTS = false

  // 1. 解析 package.json 的 type 是否是 module
  try {
    const pkg = lookupFile(root, ['package.json'])
    if (pkg && JSON.parse(pkg).type === 'module') {
      isESM = true
    }
  } catch (e) {
    console.error(e)
  }

  // 2. 解析配置文件路径
  if (configFile) {
    resolvedPath = path.resolve(configFile)
    isTS = resolvedPath.endsWith('.ts')
    if (resolvedPath.endsWith('.mjs')) {
      isESM = true
    }
  } else {
    // 解析 vite.config.js
    const jsConfigFile = path.resolve(root, 'vite.config.js')
    if (fs.existsSync(jsConfigFile)) {
      resolvedPath = jsConfigFile
    }

    // 解析 vite.config.ts
    if (!resolvedPath) {
      const tsConfigFile = path.resolve(root, 'vite.config.ts')
      if (fs.existsSync(tsConfigFile)) {
        resolvedPath = tsConfigFile
        isTS = true
      }
    }

    // 解析 vite.config.mjs
    if (!resolvedPath) {
      const mjsConfigFile = path.resolve(root, 'vite.config.mjs')
      if (fs.existsSync(mjsConfigFile)) {
        resolvedPath = mjsConfigFile
        isESM = true
      }
    }

    // 解析 vite.config.cjs
    if (!resolvedPath) {
      const cjsConfigFile = path.resolve(root, 'vite.config.cjs')
      if (fs.existsSync(cjsConfigFile)) {
        resolvedPath = cjsConfigFile
        isESM = false
      }
    }
  }

  if (!resolvedPath) {
    debug('not found config file.')
    return null
  }
  // 3. 打包配置文件
  const bundle = await bundleConfigFile(resolvedPath, isESM)
  // 4. 运行配置文件
  const userConfig: UserConfigExport = loadConfigFromBundledFile(
    resolvedPath,
    bundle.code
  )

  // 5. 检测配置文件运行结果
  const config = isFunction(userConfig)
    ? await userConfig(configEnv)
    : userConfig

  if (!isObject(config)) {
    throw new Error(
      `config must export or return an object, but got ${typeof config}`
    )
  }

  return {
    config,
    dependencies: bundle.dependencies,
  }
}

/**
 * 打包配置文件
 */
const bundleConfigFile = async (file: string, isESM = false) => {
  const res = await build({
    entryPoints: [file],
    write: false,
    format: isESM ? 'esm' : 'cjs',
    metafile: true,
    bundle: true,
    platform: 'node',
  })

  const {
    outputFiles: [{ text: code }],
    metafile: { inputs = {} } = {},
  } = res

  return { code, dependencies: Object.keys(inputs) }
}

/**
 * 加载配置文件内容
 */
const loadConfigFromBundledFile = (file: string, code: string) => {
  const defaultLoader = require.extensions['.js']
  require.extensions['.js'] = function (m: NodeModule, fileName) {
    if (fileName === file) {
      ;(m as NodeModuleWithCompile)._compile(code, fileName)
    } else {
      defaultLoader(m, fileName)
    }
  }

  const raw = require(file)
  return raw.__esModule ? raw.default : raw
}

/**
 * 根据插件的执行时机排序
 */
const sortUserPlugins = (plugins: Plugin[]) => {
  const prePlugins: Plugin[] = []
  const normalPlugins: Plugin[] = []
  const postPlugins: Plugin[] = []

  plugins.forEach(plugin => {
    if (plugin.enforce === 'pre') {
      prePlugins.push(plugin)
    } else if (plugin.enforce === 'post') {
      postPlugins.push(plugin)
    } else {
      normalPlugins.push(plugin)
    }
  })

  return [prePlugins, normalPlugins, postPlugins]
}
