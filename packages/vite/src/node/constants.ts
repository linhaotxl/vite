import path from 'node:path'

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

export const FS_PREFIX = '/@fs/'

// client.mjs 导入路径
export const CLIENT_PUBLIC_PATH = '@vite/client'
// client.mjs 实际路径
export const CLIENT_ENTRY = path.resolve(
  __dirname,
  '../..',
  'dist/client/client.mjs'
)

// client.mjs 导入路径
export const ENV_PUBLIC_PATH = '@vite/env'
// client.mjs 实际路径
export const ENV_ENTRY = path.resolve(__dirname, '../..', 'dist/client/env.mjs')

// 可以被预构建的资源
export const OptimizableEntryRE = /\.(js|mjs|cjs|ts|tjs|mts)$/
