export const DEFAULT_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.json',
]

export const DEFAULT_MAIN_FIELDS: string[] = ['module', 'jsnext:main', 'jsnext']

export const KNOWN_ASSET_TYPES: string[] = [
  // images
  'png',
  'jpe?g',
  'gif',
  'svg',
  'webp',
]

export const DEFAULT_ASSETS_RE = new RegExp(
  `\\.(${KNOWN_ASSET_TYPES.join('|')})(\\?.*)?$`
)

/**
 * 当解析的一个 import module 不是一个有效的名称，会在前面加上这个值使其有效
 * 浏览器只能识别以 .、/ 开头的导入资源
 */
export const VALID_ID_PREFIX = '/@id/'
