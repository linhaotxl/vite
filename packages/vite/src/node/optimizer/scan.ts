import { promises as fs } from 'node:fs'
import { ResolvedConfig } from './../config'
import glob from 'fast-glob'
import { build, Loader, OnLoadResult, Plugin } from 'esbuild'
import {
  createDebugger,
  htmlTypesRE,
  virtualModuleRE,
  virturalModulePrefix,
} from '../utils'
import { createPluginContainer } from '../server/pluginContainer'

export type Deps = Record<string, string>
export type Missing = Record<string, string>

const debug = createDebugger('vite:deps')

const scriptModuleRE =
  /(<script[^>]*type=(?:'module'|"module")[^>]*)>(.*?)<\/script>/gis
const scriptRE = /(<script[^>]*)>(.*?)<\/script>/gis
const typeRE = /type\s*=\s*(?:'([^']+)'|"([^"]+)"|)/is
const langRE = /lang\s*=\s*(?:'([^']+)'|"([^"]+)"|)/is
const srcRE = /src\s*=\s*(?:'([^']+)'|"([^"]+)"|)/is
const commentRE = /<!--.*?-->/gs

/**
 * 扫描依赖
 */
export const scanImports = async (config: ResolvedConfig) => {
  const { optimizeDeps: { entries: explicitEntryPatterns } = {} } = config

  const deps: Deps = {}
  const missing: Missing = {}

  // 获取入口
  let entries: string[] = []
  if (explicitEntryPatterns) {
    entries = await globEntries(explicitEntryPatterns, config)
  } else {
    entries = await globEntries('**/*.html', config)
  }

  if (!entries.length) {
    return { deps, missing }
  }

  debug(`使用以下文件扫描依赖:\n  ${entries.join('\n  ')}`)

  await Promise.all(
    entries.map(entry =>
      build({
        absWorkingDir: process.cwd(),
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'esm',
        plugins: [esbuildScanPlugin(config, deps, missing)],
      })
    )
  )

  return { deps, missing }
}

/**
 * 扫描指定入口
 */
export const globEntries = (
  pattern: string | string[],
  config: ResolvedConfig
) => {
  return glob(pattern, {
    cwd: config.root,
    ignore: ['**/node_modules/**'],
    absolute: true,
  })
}

/**
 * esbuild plugin
 */
const esbuildScanPlugin = (
  config: ResolvedConfig,
  deps: Deps,
  missing: Missing
): Plugin => {
  const container = createPluginContainer(config)

  // 解析器
  const resolve = async (id: string, importer?: string) => {
    const resolved = await container.resolveId(id, importer)
    if (resolved && resolved.id) {
      return resolved.id
    }
  }

  return {
    name: 'vite:deps-scan',

    setup(build) {
      const scripts: Record<string, OnLoadResult> = {}

      // 解析类 html 文件地址
      build.onResolve(
        { filter: htmlTypesRE },
        async ({ path: id, importer }) => {
          const resolved = await resolve(id, importer)
          if (!resolved) {
            return null
          }

          return { path: resolved, namespace: 'html' }
        }
      )

      // 加载类 html 文件内容
      build.onLoad(
        { filter: htmlTypesRE, namespace: 'html' },
        async ({ path: id }) => {
          // 读取文件内容
          const content = (await fs.readFile(id, 'utf-8')).replace(
            commentRE,
            ''
          )

          const isHtml = id.endsWith('.html')
          const regexp = isHtml ? scriptModuleRE : scriptRE
          regexp.lastIndex = 0

          let js = ''
          let match: RegExpExecArray | null
          let scriptId = 0

          // 处理 script 标签
          while ((match = regexp.exec(content))) {
            const [, openTag, content] = match
            console.log(111, openTag, content)
            const typeMatch = typeRE.exec(openTag)
            const type = typeMatch && (typeMatch[1] || typeMatch[2])
            // 不需要处理非 js 的 script
            if (type && !(type.includes('javascript') || type === 'module')) {
              continue
            }

            const langMatch = langRE.exec(openTag)
            const lang = langMatch && (langMatch[1] || langMatch[2])
            let loader: Loader = 'js'
            if (lang) {
              loader = lang as Loader
            }

            const srcMatch = srcRE.exec(openTag)
            const src = srcMatch && (srcMatch[1] || srcMatch[2])

            // 如果是 <script src="xxx" />，则将 src 所指资源直接 import 导入
            if (src) {
              js += `import ${JSON.stringify(src)}\n`
            } else if (content.trim()) {
              // 否则将其视为虚拟模块，并在 scripts 中记录文件内容以及 loader
              const key = `${id}?id=${scriptId++}`
              const virtualModulePath = `${virturalModulePrefix}${key}`

              js += `export * from ${JSON.stringify(virtualModulePath)}\n`

              scripts[key] = {
                loader,
                contents: content,
              }
            }
          }

          console.log(`html: \n`, js)
          return {
            loader: 'js',
            contents: js,
          }
        }
      )

      // 解析虚拟模块地址
      build.onResolve({ filter: virtualModuleRE }, ({ path: id }) => {
        return {
          path: id.replace(virturalModulePrefix, ''),
          namespace: 'script',
        }
      })

      // 加载虚拟模块文件内容
      build.onLoad({ filter: /.*/, namespace: 'script' }, ({ path: id }) => {
        return scripts[id]
      })

      // 解析普通模块地址
      build.onResolve({ filter: /^[\w@]/ }, async ({ path: id, importer }) => {
        // 解析模块对应的路径
        const resolveId = await resolve(id, importer)
        console.log(`解析 ${id} 结果是 ${resolveId}`)

        if (resolveId) {
          if (resolveId.includes('node_modules')) {
            deps[id] = resolveId
            return {
              path: resolveId,
              external: true,
            }
          }
        } else {
          // 文件路径不存在，说明这是一个没有安装的依赖
          missing[id] = '111'
        }
      })

      // all
      build.onResolve({ filter: /.*/ }, async ({ path: id, importer }) => {
        const resolveId = await resolve(id, importer)
        if (resolveId) {
          return {
            path: resolveId,
          }
        }
      })
    },
  }
}
