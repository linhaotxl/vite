import { ResolvedConfig } from '../config'
import { Plugin } from '../plugin'
import { htmlInlineProxyPlugin } from './html'
import { importGlobPlugin } from './importMetaGlob'
import { resolvePlugin } from './resolve'

export const resolvePlugins = (config: ResolvedConfig): Plugin[] => {
  return [
    resolvePlugin(config),
    htmlInlineProxyPlugin(config),
    importGlobPlugin(config),
  ]
}
