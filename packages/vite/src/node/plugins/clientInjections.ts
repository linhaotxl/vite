import { CLIENT_ENTRY, ENV_ENTRY } from '../constants'
import { Plugin } from '../plugin'
import { ResolvedConfig } from './../config'
export const clientInjectionsPlugin = (config: ResolvedConfig): Plugin => {
  return {
    name: 'vite:client-injections',

    transform(code, resolveId) {
      if (resolveId === CLIENT_ENTRY || resolveId === ENV_ENTRY) {
        return code.replace('__DEFINE__', serializeDefine(config.define ?? {}))
      } else if (code.includes('process.env.NODE_ENV')) {
        return code.replace(
          'process.env.NODE_ENV',
          JSON.stringify(process.env.NODE_ENV || config.mode)
        )
      }
    },
  }
}

const serializeDefine = (define: Record<string, any>) => {
  let res = '{\n'

  for (const [key, value] of Object.entries(define)) {
    res += `  ${JSON.stringify(key)}: ${
      typeof value === 'string' ? `(${value})` : JSON.stringify(value)
    },\n`
  }

  res += '\n}'

  return res
}
