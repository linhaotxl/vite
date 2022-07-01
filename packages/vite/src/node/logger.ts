import colors from 'picocolors'

/**
 * 日志类型
 */
export type LogType = 'info' | 'warn' | 'error'

/**
 * 日志等级
 * 高优先级可以输出低优先级，反之不行
 */
export type LogLevel = LogType | 'silent'

export interface LoggerOptions {
  allowClearScreen?: boolean
  prefix?: string
}

export interface LogOptions {
  clear?: boolean
  timestamp?: boolean
}

export interface Logger {
  info: (msg: string, options?: LogOptions) => void
  warn: (msg: string, options?: LogOptions) => void
  error: (msg: string, options?: LogOptions) => void
  clearScreen: (logType: LogType) => void
}

/**
 * 日志级别定义
 */
const LogLevels: Record<LogLevel, number> = {
  silent: 0, // silent 等级为 0，什么日志都不能输出
  error: 1, // error 等级为 1，只能输出 error 类型日志
  warn: 2, // warn 等级为 2，只能输出 warn 和 error 日志
  info: 3, // info 等级最高，可以输出任何类型日志
}

/**
 * 日志类型颜色
 */
export const LogLevelTagColor: Record<LogType, (msg: string) => string> = {
  info: msg => colors.cyan(msg),
  warn: msg => colors.yellow(msg),
  error: msg => colors.red(msg),
}

let lastMsg = ''
let lastLogType: LogType
let sameCount = 0

export const createLogger = (
  level: LogLevel = 'info',
  options: LoggerOptions = {}
) => {
  const { prefix = '[vite]', allowClearScreen = true } = options
  const canClearScreen = !!allowClearScreen

  // 日志等级
  const thresh = LogLevels[level]

  // 输出日志内容
  const output = (
    logType: LogType,
    msg: string,
    { timestamp, clear }: LogOptions = {}
  ) => {
    // 必须满足：日志等级 >= 需要输出的等级
    if (thresh < LogLevels[logType]) {
      return
    }

    const method = logType === 'info' ? 'log' : logType
    const format = () => {
      if (timestamp) {
        const tag = LogLevelTagColor[logType](colors.bold(prefix))
        const time = colors.dim(new Date().toLocaleTimeString())
        return `${time} ${tag} ${msg}`
      }
      return msg
    }

    if (canClearScreen) {
      if (lastMsg === msg && lastLogType === logType) {
        clearScreen()
        console[method](format(), colors.yellow(`x${++sameCount + 1}`))
      } else {
        if (clear) {
          clearScreen()
        }
        sameCount = 0
        lastMsg = msg
        lastLogType = logType
        console[method](format())
      }
    } else {
      console[method](format())
    }
  }

  // 日志对象
  const logger: Logger = {
    info(msg, options) {
      output('info', msg, options)
    },

    warn(msg, options) {
      output('warn', msg, options)
    },

    error(msg, options) {
      output('error', msg, options)
    },

    clearScreen(logType) {
      // 只会清除优先级低的日志内容
      if (thresh >= LogLevels[logType]) {
        clearScreen()
      }
    },
  }

  return logger
}

/**
 * 清屏操作
 */
const clearScreen = () => {
  console.clear()
}
