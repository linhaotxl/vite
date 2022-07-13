import { ResolvedConfig } from '../config'
import { Plugin } from '../plugin'
import { htmlInlineProxyPlugin } from './html'
import { importAnalysisPlugin } from './importAnalysis'
import { importGlobPlugin } from './importMetaGlob'
import { jsonPlugin } from './json'
import { resolvePlugin } from './resolve'

export const resolvePlugins = (config: ResolvedConfig): Plugin[] => {
  return [
    resolvePlugin(config),

    jsonPlugin({
      namedExports: true,
      ...config.json,
    }),

    importAnalysisPlugin(config),

    htmlInlineProxyPlugin(config),
    importGlobPlugin(config),
  ]
}
