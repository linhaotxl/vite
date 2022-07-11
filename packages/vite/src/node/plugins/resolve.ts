import type { ResolvedConfig } from '../config'
import type { Plugin } from '../plugin'

export const resolvePlugin = (config: ResolvedConfig): Plugin => {
  const { root } = config

  return {
    name: 'vite:resolve',

    resolveId(id, impoter?) {
      // 解析 URL；/foo -> /root/foo
      if (id.startsWith('/')) {
        return `${root}${id}`
      }
    },
  }
}
