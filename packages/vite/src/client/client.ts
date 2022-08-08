import type {
  CustomEventMap,
  InferCustomEvenyPayload,
} from '../../types/customEvent.d'
import type { HMRPayload } from '../../types/hmrPayload'
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

    on(event, cb) {
      const addCb = (map: CustomListenerMap) => {
        const listeners = map.get(event) || []
        listeners.push(cb)
        map.set(event, listeners)
      }

      addCb(customListenerMap)
    },
  }
}

type CustomListenerMap = Map<string, ((data: any) => void)[]>
const customListenerMap: CustomListenerMap = new Map()

function notifyListeners<T extends keyof CustomEventMap>(
  type: T,
  payload: InferCustomEvenyPayload<T>
): void
function notifyListeners(type: string, payload: any) {
  const cbs = customListenerMap.get(type)
  if (cbs) {
    for (const cb of cbs) {
      cb(payload)
    }
  }
}

const setupWebSocker = (protocol: string, hostAndPath: string) => {
  const socket = new WebSocket(`${protocol}://${hostAndPath}`)

  let open = false

  socket.addEventListener(
    'open',
    () => {
      open = true
    },
    { once: true }
  )

  socket.addEventListener('message', ({ data }) => {
    handleMessage(JSON.parse(data))
  })
}

const handleMessage = (payload: HMRPayload) => {
  switch (payload.type) {
    case 'upload':
      notifyListeners('vite:beforeUpdate', payload)
      break
  }
}
