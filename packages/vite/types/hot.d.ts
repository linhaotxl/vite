export type Module = Record<string, any>

export interface ViteHotContext {
  accept(): void
  accept(cb: (module: Module) => void): void
  accept(deps: string, cb: (module: Module) => void): void
}

export interface HotCallback {
  deps: string[]
  fn: () => void
}

export interface HotModule {
  id: string
  callbacks: HotCallback[]
}
