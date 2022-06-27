import { Command, ConfigEnv, UserConfig } from './config'

export interface Plugin {
  /**
   * 执行时机
   * 可以是 build 或者 serve 环境，也可以通过函数自定义
   */
  apply?: Command | ((config: UserConfig, env: ConfigEnv) => boolean)
}
