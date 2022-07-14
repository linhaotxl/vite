import type { Command, ConfigEnv, UserConfig } from './config'
import type { IndexHtmlTransform } from './plugins/html'
import type {
  LoadResult,
  ResolveIdResult,
  Plugin as RollupPlugin,
  TransformResult,
  PluginContext,
  TransformPluginContext,
  ResolveIdHook,
} from 'rollup'

export interface Plugin extends RollupPlugin {
  /**
   * 插件的执行时机
   *
   */
  enforce?: 'pre' | 'post'

  /**
   * 执行环境
   * 可以是 build 或者 serve 环境，也可以通过函数自定义
   */
  apply?: Command | ((config: UserConfig, env: ConfigEnv) => boolean)

  /**
   * 每个插件可以存在转换 html 的钩子
   */
  indexTransform?: IndexHtmlTransform

  /**
   * 解析模块路径
   */
  resolveId?: (
    this: PluginContext,
    id: string,
    impoter: string | undefined,
    options: Parameters<ResolveIdHook>[2]
  ) => ResolveIdResult | Promise<ResolveIdResult>

  /**
   * 加载模块内容
   */
  load?: (id: string) => LoadResult | Promise<LoadResult>

  /**
   * 转换内容
   */
  transform?: (
    this: TransformPluginContext,
    code: string,
    resolveId: string
  ) => TransformResult | Promise<TransformResult>
}
