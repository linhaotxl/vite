import type { Alias } from '@rollup/plugin-alias'

export type AliasOptions = readonly Alias[] | { [find: string]: string }
