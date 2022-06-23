import fs from 'fs'
import path from 'path'
import { build } from 'esbuild'
import { lookupFile, createDebugger, isFunction, isObject } from './utils'

export interface UserConfig {
  root?: string
}

export interface InlineConfig extends UserConfig {
  configFile?: string | false
}

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
export const resolveConfig = (config: InlineConfig, command: Command) => {
  const configEnv: ConfigEnv = {
    command,
    mode: '',
  }

  config.root = config.root || process.cwd()

  const { configFile } = config
  if (configFile !== false) {
    loadConfigFromFile(configEnv, config.root, config.configFile)
    configFile
  }
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
  } catch (e) {}

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
  console.log('resolvedPath: ', resolvedPath, isESM, isTS)
  if (!resolvedPath) {
    debug('not found config file.')
    return null
  }

  const bundle = await bundleConfigFile(resolvedPath, isESM)
  const userConfig: UserConfigExport = loadConfigFromBundledFile(
    resolvedPath,
    bundle.code
  )

  const config =
    typeof userConfig === 'function' ? await userConfig(configEnv) : userConfig

  if (!isObject(config)) {
    throw new Error('config must export or return an object.')
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
