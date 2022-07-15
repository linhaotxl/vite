export const DEFAULT_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.json',
]

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
