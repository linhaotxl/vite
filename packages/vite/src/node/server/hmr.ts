const enum LexerState {
  inCall,
  inArray,
  inSingleQuoteString,
  inDoubleQuoteStirng,
  inTemplateString,
}

/**
 * 解析 import.meta.hot.accept() 的依赖项
 * @param code 代码
 * @param start accept( 后的第一个位置
 * @param urls 即系依赖项的集合
 * @returns 是否是自引入
 */
export const lexAcceptedHmrDeps = (
  code: string,
  start: number,
  urls: Set<{ url: string; start: number; end: number }>
) => {
  let state: LexerState = LexerState.inCall
  let prevState: LexerState = LexerState.inCall
  let currentDep = ''

  const addDep = (i: number) => {
    urls.add({ url: currentDep, start: i - currentDep.length - 1, end: i + 1 })
    currentDep = ''
  }

  for (let i = start; i < code.length; ++i) {
    const char = code.charAt(i)

    switch (state as LexerState) {
      case LexerState.inCall:
      case LexerState.inArray:
        if (char === `'`) {
          prevState = state
          state = LexerState.inSingleQuoteString
        } else if (char === `"`) {
          prevState = state
          state = LexerState.inDoubleQuoteStirng
        } else if (char === '`') {
          prevState = state
          state = LexerState.inTemplateString
        } else if (/\s/.test(char)) {
          continue
        } else {
          if (state === LexerState.inCall) {
            if (char === '[') {
              prevState = state
              state = LexerState.inArray
            } else {
              return true
            }
          } else if (state === LexerState.inArray) {
            if (char === ',') {
              continue
            } else if (char === ']') {
              return false
            }
          }
        }
        break
      case LexerState.inSingleQuoteString:
        if (char === `'`) {
          addDep(i)
          if (prevState === LexerState.inCall) {
            return false
          } else {
            state = prevState
          }
        } else {
          currentDep += char
        }
        break
      case LexerState.inDoubleQuoteStirng:
        if (char === `"`) {
          addDep(i)
          if (prevState === LexerState.inCall) {
            return false
          } else {
            state = prevState
          }
        } else {
          currentDep += char
        }
        break
      case LexerState.inTemplateString:
        if (char === '`') {
          addDep(i)
          if (prevState === LexerState.inCall) {
            return false
          } else {
            state = prevState
          }
        } else if (char === '$' && code.charAt(i + 1) === '{') {
          throw new Error(
            'import.meta.hot.accept 的参数只能是字符串常量或者数组'
          )
        } else {
          currentDep += char
        }
        break
      default:
        throw new Error(`import.meta.hot.accept 参数错误`)
    }
  }

  return false
}
