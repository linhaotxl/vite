import { promises as fsp } from 'node:fs'
import colors from 'picocolors'
import { getDepsCacheDir } from './optimizer'
import path from 'node:path'
import { ResolvedConfig } from './../config'
import { Deps, scanImports } from './scan'
import { flattenId, isOptimizable, normalizeId, normalizePath } from '../utils'
import { init, parse as parseModule } from 'es-module-lexer'

/**
 * 模块导出数据
 */
export interface ExportData {
  /**
   * 是否存在 import 语句
   */
  hasImports: boolean

  /**
   * 导出语句列表
   */
  exports: readonly string[]

  /**
   * 是否是外观模式
   */
  facade: boolean
}

/**
 * 预构建配置
 */
export interface DepOptimizationConfig {
  /**
   * 默认情况下，不在 node_modules 中的，链接的包不会被预构建。使用此选项可强制预构建链接的包。
   */
  include?: string[]

  /**
   * 预构建强制排除的依赖
   */
  exclude?: string[]
}

/**
 * 预构建依赖配置
 */
export interface DepOptimizationOptions extends DepOptimizationConfig {
  /**
   * 预构建查询入口
   */
  entries?: string | string[]

  /**
   * 强制进行预构建，无论依赖是否发生变化
   */
  force?: boolean
}

/**
 * 依赖预构建元数据
 */
export interface DepOptimizationMetadata {
  discovered: Record<string, OptimizedDepInfo>

  optimized: Record<string, OptimizedDepInfo>

  chunks: Record<string, OptimizedDepInfo>
}

/**
 * 预构建依赖信息
 */
export interface OptimizedDepInfo {
  /**
   * 模块名称
   */
  id: string

  /**
   * 依赖预构建在 vite 中缓存的路径
   */
  file: string

  /**
   * 依赖在 node_modules 中的位置；如果是 chunk 则没有
   */
  src?: string

  /**
   * export 数据
   */
  exportsData?: ExportData
}

/**
 * 预构建解析器
 */
export interface DepsOptimizer {
  metadata: DepOptimizationMetadata
  getOptimizedDepId: (dep: OptimizedDepInfo) => string
}

/**
 * 查找项目下的依赖
 */
export const discoverProjectDependencies = async (config: ResolvedConfig) => {
  const { deps, missing } = await scanImports(config)

  const missingNames: string[] = Object.keys(missing)
  if (missingNames.length) {
    throw new Error(`以下依赖没有安装\n  ${missingNames.join('\n  ')}`)
  }

  return deps
}

/**
 * 初始化预构建元数据
 */
export const initDepsOptimizerMetadata = (): DepOptimizationMetadata => {
  return {
    discovered: {},
    optimized: {},
    chunks: {},
  }
}

/**
 * 向元数据 metadata 中添加依赖数据
 */
export const addOptimizedDepInfo = (
  metadata: DepOptimizationMetadata,
  type: 'discovered' | 'optimized' | 'chunks',
  dep: OptimizedDepInfo
) => {
  metadata[type][dep.id] = dep
}

/**
 * 获取预构建的依赖在缓存目录中的路径
 */
export const getOptimizedDepPath = (id: string, config: ResolvedConfig) =>
  normalizePath(path.resolve(getDepsCacheDir(config), flattenId(id) + '.js'))

/**
 * 手动添加 include 中的依赖进行预构建
 */
export const addManuallyIncludedOptimizeDeps = async (
  deps: Deps,
  config: ResolvedConfig
) => {
  const { createResolver, logger, optimizeDeps } = config
  const resolve = createResolver({})
  const include = optimizeDeps?.include ?? []

  const unableToOptimize = (id: string, msg: string) => {
    // if (include.includes(id)) {
    logger.warn(`${msg}: ${colors.cyan(id)}, 在 optimizeDeps.include 中`)
    // }
  }

  for (const id of include) {
    const normalizedId = normalizeId(id)
    const resolveId = await resolve(normalizedId)
    if (resolveId) {
      if (isOptimizable(resolveId)) {
        deps[normalizedId] = resolveId
      } else {
        unableToOptimize(id, `资源不符合构建类型`)
      }
    } else {
      unableToOptimize(id, `resolve 失败`)
    }
  }
}

/**
 * 将需要预构建的 deps 转换为 metadata 中的 discover 数据
 */
export const toDiscoveredDependencies = async (
  deps: Deps,
  config: ResolvedConfig
) => {
  const discovered: DepOptimizationMetadata['discovered'] = {}
  for (const [id, resolveId] of Object.entries(deps)) {
    discovered[id] = {
      id,
      src: resolveId,
      file: getOptimizedDepPath(id, config),
      exportsData: await extractExportData(resolveId),
    }
  }

  return discovered
}

/**
 * 提取模块的 export 数据
 */
export const extractExportData = async (
  resolveId: string
): Promise<ExportData> => {
  await init

  const content = await fsp.readFile(resolveId, 'utf-8')

  const [imports, exports, facade] = await parseModule(content)

  return {
    hasImports: !!imports.length,
    exports,
    facade,
  }
}

/**
 * 获取已经预构建好的 dep info
 */
export const optimizedDepInfoFromId = (
  id: string,
  metadata: DepOptimizationMetadata
) => {
  return metadata.optimized[id]
}
