import { ResolvedConfig } from '../config'
import { Plugin } from '../plugin'

export const importGlobPlugin = (config: ResolvedConfig): Plugin => {
  return {
    name: 'vite-import-glob',

    transform(code, resolveId) {
      if (!code.includes('import.meta.glob')) {
        return
      }
      console.log('import glob transform: ', code, resolveId)
    },
  }
}
