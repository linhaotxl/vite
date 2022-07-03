import { Command, ConfigEnv, UserConfig } from './config'
import { IndexHtmlTransform } from './plugins/html'

export interface Plugin {
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
}
