import { ResolvedConfig } from '../config'
import { Plugin } from '../plugin'
import { htmlInlineProxyPlugin } from './html'
import { importAnalysisPlugin } from './importAnalysis'
import { importGlobPlugin } from './importMetaGlob'
import { jsonPlugin } from './json'
import { resolvePlugin } from './resolve'
import aliasPlugin from '@rollup/plugin-alias'
import { assetsPlugin } from './assets'

export const resolvePlugins = (config: ResolvedConfig): Plugin[] => {
  return [
    aliasPlugin({ entries: config.resolve.alias }),

    resolvePlugin({
      ...config.resolve,
      isProduction: config.isProduction,
      tryIndex: true,
      skipPackageJson: false,
      root: config.root,
    }),

    assetsPlugin(config),

    jsonPlugin({
      namedExports: true,
      ...config.json,
    }),

    importAnalysisPlugin(config),

    htmlInlineProxyPlugin(config),
    importGlobPlugin(config),
  ]
}
