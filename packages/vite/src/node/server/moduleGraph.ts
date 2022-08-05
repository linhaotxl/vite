import { cleanUrl } from '../utils'
import type { CustomPluginOptions, PartialResolvedId } from 'rollup'

export class ModuleNode {
  url: string

  /**
   * 解析好的路径，带有 query
   */
  id: string | null = null

  /**
   * 同 id，不带 query
   */
  file: string | null = null

  /**
   * 该 module 内通过 import 导入的模块
   */
  importedModules: Set<ModuleNode> = new Set()

  /**
   * 该 module 被哪些模块导入过
   */
  importers: Set<ModuleNode> = new Set()

  /**
   * 该 module 内通过 import 语句绑定的值
   */
  importedBindings: Set<string> | null = null

  /**
   * 通过 import.meta.hot.accept 依赖的模块
   */
  acceptedModules: Set<ModuleNode> | null = null

  /**
   * 自依赖
   */
  isSelfAccepting = false

  /**
   * 模块类型
   */
  type: 'js' | 'css'

  constructor(url: string) {
    this.url = url
    this.type = 'js'
  }
}

export class ModuleGraph {
  urlToModuleMap = new Map<string, ModuleNode>()
  idToModuleMap = new Map<string, ModuleNode>()
  fileToModulesMap = new Map<string, Set<ModuleNode>>()

  constructor(
    private resolveId: (url: string) => Promise<PartialResolvedId | null>
  ) {}

  /**
   * 更新 module 信息
   * @param module 需要更新的 module
   * @param importedModules module 内通过 import 导入的模块
   * @param importedBindings module 内通过 import 导入的模块
   * @param acceptedModules module 内通过 import.meta.hot.accept 依赖的模块
   * @param isSelfAccepting 自依赖
   * @returns 不再依赖的 module
   */
  async updateModuleInfo(
    module: ModuleNode,
    importedModules: Set<string>,
    importedBindings: Set<string>,
    acceptedModules: Set<string>,
    isSelfAccepting: boolean
  ) {
    let noLongerImpotedModules: Set<ModuleNode> | undefined
    module.isSelfAccepting = isSelfAccepting
    module.importedBindings = importedBindings

    const prevImportedModules = module.importedModules
    const nextImportedModules = (module.importedModules = new Set())

    for (const imported of importedModules) {
      const importedModule = await this.ensureEntryFromUrl(imported)
      nextImportedModules.add(importedModule)
      importedModule.importers.add(module)
    }

    for (const impotedModule of prevImportedModules) {
      if (!nextImportedModules.has(impotedModule)) {
        impotedModule.importers.delete(module)
        if (!noLongerImpotedModules) {
          noLongerImpotedModules = new Set()
        }
        noLongerImpotedModules.add(impotedModule)
      }
    }

    const accepted = (module.acceptedModules = new Set())
    for (const accept of acceptedModules) {
      const acceptModule = await this.ensureEntryFromUrl(accept)
      accepted.add(acceptModule)
    }

    return noLongerImpotedModules
  }

  /**
   * 确保 rawUrl 对应的路径存在 module
   */
  async ensureEntryFromUrl(rawUrl: string) {
    const [url, resolvedId] = await this.resolveUrl(rawUrl)
    let module = this.urlToModuleMap.get(url)
    if (!module) {
      module = new ModuleNode(url)
      module.id = resolvedId
      module.file = cleanUrl(resolvedId)

      this.urlToModuleMap.set(url, module)
      this.idToModuleMap.set(resolvedId, module)

      let fileToModulesMap = this.fileToModulesMap.get(module.file)
      if (!fileToModulesMap) {
        fileToModulesMap = new Set()
        this.fileToModulesMap.set(module.file, fileToModulesMap)
      }
      fileToModulesMap.add(module)
    }

    return module
  }

  /**
   * 解析 url 实际的位置，通过各个 plugin 解析
   */
  async resolveUrl(
    url: string
  ): Promise<[string, string, CustomPluginOptions | undefined | null]> {
    const resolved = await this.resolveId(url)
    const resolvedId = resolved?.id ?? url

    return [url, resolvedId, resolved?.meta]
  }
}
