import type { UpadtePayload } from './hmrPayload'

export type CustomEventMap = {
  'vite:beforeUpdate': UpadtePayload
}

export type InferCustomEvenyPayload<T extends string> =
  T extends keyof CustomEventMap ? CustomEventMap[T] : never
