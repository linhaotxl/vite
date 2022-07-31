import { ResolvedConfig } from '../config'
import { Plugin } from '../plugin'
import { htmlInlineProxyPlugin } from './html'
import { importAnalysisPlugin } from './importAnalysis'
import { importGlobPlugin } from './importMetaGlob'
import { jsonPlugin } from './json'
import { resolvePlugin } from './resolve'
import aliasPlugin from '@rollup/plugin-alias'
import { assetsPlugin } from './assets'
import { cssPlugin, cssPostPlugin } from './css'
import { clientInjectionsPlugin } from './clientInjections'
import { getDepsOptimizer } from '../optimizer/optimizer'

export const resolvePlugins = (config: ResolvedConfig): Plugin[] => {
  return [
    aliasPlugin({ entries: config.resolve.alias }),

    resolvePlugin({
      ...config.resolve,
      isProduction: config.isProduction,
      tryIndex: true,
      skipPackageJson: false,
      root: config.root,
      getDepsOptimizer: () => getDepsOptimizer(config),
    }),

    // assets plugin 要在前面，碰到 ?raw 或者资源文件会优先加载，不会做转换处理
    assetsPlugin(config),
    cssPlugin(config),

    jsonPlugin({
      namedExports: true,
      ...config.json,
    }),

    // css post 要在 import analysis 前面，在 analysis 中会对 import 进行分析，必须保证 css 已经是加载完成的 JS 形式
    cssPostPlugin(config),

    clientInjectionsPlugin(config),
    importAnalysisPlugin(config),

    htmlInlineProxyPlugin(config),
    importGlobPlugin(config),
  ]
}
