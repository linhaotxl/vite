import fs, { promises as fsp } from 'node:fs'
import path from 'node:path'
import {
  addManuallyIncludedOptimizeDeps,
  DepOptimizationMetadata,
  DepsOptimizer,
  ExportData,
  extractExportData,
  getOptimizedDepPath,
  OptimizedDepInfo,
  toDiscoveredDependencies,
} from './index'
import {
  addOptimizedDepInfo,
  discoverProjectDependencies,
  initDepsOptimizerMetadata,
} from '.'
import { ResolvedConfig } from './../config'
import { asyncWriteFile, emptyDir, flattenId, normalizePath } from '../utils'
import { build } from 'esbuild'
import { Deps } from './scan'
import { esbuildDepPlugin } from './esbuildDepPlugin'

const jsMapExtensionRE = /\.js\.map$/
const jsExtensionRE = /\.js$/

const depsOptimizerMap: WeakMap<ResolvedConfig, DepsOptimizer> = new WeakMap()

/**
 * 创建预构建解析器
 */
export const createDepsOptimizer = async (config: ResolvedConfig) => {
  // 创建元数据
  const metadata = initDepsOptimizerMetadata()

  // 创建预构建解析器并缓存
  const depsOptimizer: DepsOptimizer = {
    metadata,
    getOptimizedDepId(dep) {
      return dep.file
    },
  }

  depsOptimizerMap.set(config, depsOptimizer)

  // 获取 include 中需要构建的依赖
  const includeDeps: Deps = {}
  await addManuallyIncludedOptimizeDeps(includeDeps, config)

  // 将 include 中需要构建的 deps 转换为 discovered
  const includeDiscovered = await toDiscoveredDependencies(includeDeps, config)

  // 将 include 对应的 discovered 添加到 metadata 中
  for (const depInfo of Object.values(includeDiscovered)) {
    addOptimizedDepInfo(metadata, 'discovered', {
      ...depInfo,
    })
  }
  console.log('metadata in include: ', metadata.discovered)

  // 从入口开始查找项目需要预构建的 dep
  const projectDeps = await discoverProjectDependencies(config)
  // 将项目中用到的依赖添加到 metadata 中
  for (const [id, resolveId] of Object.entries(projectDeps)) {
    await addMissingDep(id, resolveId)
  }
  console.log('projectDeps: ', projectDeps)

  // TODO: metadata 构建依赖
  await runOptimizeDeps(metadata, config, metadata.discovered)

  async function addMissingDep(id: string, resolveId: string) {
    addOptimizedDepInfo(metadata, 'discovered', {
      id,
      src: resolveId,
      file: getOptimizedDepPath(id, config),
      exportsData: await extractExportData(resolveId),
    })
  }
}

/**
 * 运行预构建
 */
export const runOptimizeDeps = async (
  metadata: DepOptimizationMetadata,
  config: ResolvedConfig,
  deps: DepOptimizationMetadata['discovered']
) => {
  // 获取缓存目录
  const depsCacheDir = getDepsCacheDir(config)
  const processingDepsCacheDir = getProcessingDepsCacheDir(config)

  // 确保缓存目录存在且为空
  if (fs.existsSync(processingDepsCacheDir)) {
    emptyDir(processingDepsCacheDir)
  } else {
    await fsp.mkdir(processingDepsCacheDir, { recursive: true })
  }

  // // 初始化元数据
  // const metadata = initDepsOptimizerMetadata()

  // 向缓存目录中写入 package.json
  asyncWriteFile(
    path.join(processingDepsCacheDir, 'package.json'),
    JSON.stringify({
      type: 'module',
    })
  )
  console.log('deps: ', deps)
  const depsEntries = Object.entries(deps)
  // flatId -> dep 在 node_modules 中实际的路径
  const flatIdDeps: Record<string, string> = {}
  const flatIdExports: Record<string, ExportData> = {}

  for (const [id, dep] of depsEntries) {
    const flatId = flattenId(id)
    flatIdDeps[flatId] = dep.src
    flatIdExports[flatId] = dep.exportsData
  }
  console.log('flatIdDeps: ', flatIdDeps)
  // 打包每一个需要预构建的 dep 文件
  const result = await build({
    entryPoints: Object.keys(flatIdDeps),
    bundle: true,
    format: 'esm',
    outdir: processingDepsCacheDir,
    sourcemap: true,
    metafile: true,
    plugins: [esbuildDepPlugin(flatIdDeps, flatIdExports, config)],
  })

  const meta = result.metafile

  // 向 metadata 中添加 optimized
  const optimizedFileMap: Record<string, OptimizedDepInfo> = {}
  for (const [id, { exportsData, ...info }] of depsEntries) {
    const optimized = {
      ...info,
    }
    optimizedFileMap[optimized.file] = optimized
    addOptimizedDepInfo(metadata, 'optimized', optimized)
  }

  const processingCacheDirOutputPath = path.relative(
    process.cwd(),
    processingDepsCacheDir
  )
  // 遍历输出的 output，添加 chunk 文件
  for (const o of Object.keys(meta.outputs)) {
    if (jsMapExtensionRE.test(o)) {
      continue
    }
    const fileNameNoExt = path
      .relative(processingCacheDirOutputPath, o)
      .replace(jsExtensionRE, '')
    const file = getOptimizedDepPath(fileNameNoExt, config)
    if (file in optimizedFileMap) {
      addOptimizedDepInfo(metadata, 'chunks', {
        id: fileNameNoExt,
        file,
      })
    }
  }

  await asyncWriteFile(
    path.join(processingDepsCacheDir, '_metadata.json'),
    JSON.stringify(metadata, null, 2)
  )

  console.log('meta: ', meta)
}

/**
 * 获取缓存依赖预构建的目录
 */
export const getDepsCacheDir = (config: ResolvedConfig) =>
  getDepsCacheDirPrefix(config) + getDepsCacheDirSuffix(config)

/**
 * 获取缓存依赖预构建进行中的目录
 */
export const getProcessingDepsCacheDir = (config: ResolvedConfig) =>
  getDepsCacheDirPrefix(config) + getDepsCacheDirSuffix(config) + '_temp'

/**
 * 获取预构建依赖缓存目录 - 前缀
 */
export const getDepsCacheDirPrefix = (config: ResolvedConfig) =>
  normalizePath(path.join(config.cacheDir, 'deps'))

/**
 * 获取预构建依赖缓存目录 - 后缀
 */
export const getDepsCacheDirSuffix = (config: ResolvedConfig) => ''

/**
 * 获取预构建解析器
 */
export const getDepsOptimizer = (config: ResolvedConfig) => {
  return depsOptimizerMap.get(config)
}
