declare const __DEFINE__: Record<string, any>

const context = (() => {
  if (typeof globalThis !== 'undefined') {
    return globalThis
  } else if (typeof self !== 'undefined') {
    return self
  } else if (typeof window !== 'undefined') {
    return window
  } else {
    return new Function('return this')()
  }
})()

const define = __DEFINE__
for (const [key, value] of Object.entries(define)) {
  const segments = key.split('.')
  let target = context
  for (let i = 0; i < segments.length; ++i) {
    const segment = segments[i]
    if (i === segments.length - 1) {
      target[segment] = value
    } else {
      target = target[segment] || (target[segment] = {})
    }
  }
}
