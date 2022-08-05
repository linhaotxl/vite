import type { HotCallback, HotModule, ViteHotContext } from '../../types/hot'
import '@vite/env'

/**
 * 更新样式
 */
const sheetsMap: Map<string, HTMLStyleElement> = new Map()
export const updateStyle = (id: string, content: string) => {
  let style = sheetsMap.get(id)
  if (!style) {
    style = document.createElement('style')
    style.setAttribute('type', 'text/css')
    style.innerHTML = content
    document.head.appendChild(style)
  } else {
    style.innerHTML = content
  }

  sheetsMap.set(id, style)
}

/**
 * 创建 import.meta.hot
 */
const hotModulesMap = new Map<string, HotModule>()
export const createHotContext = (ownerPath: string): ViteHotContext => {
  const acceptDeps = (deps: string[], fn: HotCallback['fn']) => {
    const module = hotModulesMap.get(ownerPath) || {
      id: ownerPath,
      callbacks: [],
    }

    module.callbacks.push({ deps, fn })

    hotModulesMap.set(ownerPath, module)
  }

  return {
    accept(deps?, cb?) {
      debugger
      if (typeof deps === 'function' || typeof deps === 'undefined') {
        // import.meta.hot.accept() / import.meta.hot.accept(() => {})
        acceptDeps([ownerPath], () => deps?.())
      }
    },
  }
}
