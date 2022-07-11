export interface ImportGlobOptions {
  query?: string | Record<string, string | boolean | number>

  eager?: boolean

  as?: 'url' | 'raw'

  import?: string

  /**
   * 是否扫描全部文件，包括隐藏文件，node_modules 中的文件
   */
  exhaustive?: boolean
}

export type GeneralImportGlobOptions = ImportGlobOptions
