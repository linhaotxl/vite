import { Command, ConfigEnv, UserConfig } from './config'

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
}
