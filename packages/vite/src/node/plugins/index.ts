import { ResolvedConfig } from '../config'
import { Plugin } from '../plugin'
import { htmlInlineProxyPlugin } from './html'
import { importGlobPlugin } from './importMetaGlob'

export const resolvePlugins = (config: ResolvedConfig): Plugin[] => {
  return [htmlInlineProxyPlugin(config), importGlobPlugin(config)]
}
