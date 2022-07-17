import type { GeneralImportGlobOptions } from 'types/importGlob'
import { ResolvedConfig } from '../config'
import { Plugin } from '../plugin'
import { parseExpressionAt } from 'acorn'
import type {
  ArrayExpression,
  CallExpression,
  Literal,
  ObjectExpression,
} from 'estree'
import { isString, isUndefined } from '../utils'
import path from 'path'
import fastGlob from 'fast-glob'
import { stringifyQuery } from 'ufo'
import MagicString from 'magic-string'

const importPrefix = '__vite_glob_'

export const importGlobPlugin = (config: ResolvedConfig): Plugin => {
  return {
    name: 'vite-import-glob',

    async transform(code, resolveId) {
      if (!code.includes('import.meta.glob')) {
        return
      }

      const dir = path.dirname(resolveId)
      const s = new MagicString(code)

      const tasks = parseImportGlob(code, resolveId, config.root)

      const staticImports = (
        await Promise.all(
          tasks.map(async ({ globsResolved, options, index, start, end }) => {
            console.log('globsResolved: ', globsResolved)
            const cwd = path.join(config.root, 'dir/node_modules')
            const files = (
              await fastGlob(globsResolved, {
                cwd,
                absolute: true,
                dot: !!options.exhaustive,
                ignore: options.exhaustive
                  ? []
                  : [path.join(config.root, '**/node_modules/**')],
              })
            ).filter(file => file !== resolveId)

            console.log('globsResolved: ', globsResolved)
            console.log('options: ', {
              cwd,
              absolute: true,
              dot: !!options.exhaustive,
              ignore: options.exhaustive
                ? []
                : [path.join(cwd, '**/node_modules/**')],
            })
            console.log('files: ', files)

            let query = !options.query
              ? ''
              : isString(options.query)
              ? options.query
              : stringifyQuery(options.query as any)

            if (query && !query.startsWith('?')) {
              query = `?${query}`
            }

            const objectProps: string[] = []
            // const resolvePath = (file: string) => {
            //   const relativePath = path.relative(dir, file)

            //   return { importPath: relativePath }
            // }

            const staticImports: string[] = []

            files.forEach((file, i) => {
              let relativePath = path.relative(dir, file)
              if (!relativePath.startsWith('.')) {
                relativePath = `./${relativePath}`
              }
              const importPath = `${relativePath}${query}`

              const importKey =
                options.import && options.import !== '*' ? options.import : ''

              if (options.eager) {
                const variableName = `${importPrefix}${index}_${i}`
                const expression = importKey
                  ? `{ ${importKey} as ${variableName} }`
                  : `* as ${variableName}`
                const importStatement = `import ${expression} from ${JSON.stringify(
                  importPath
                )}`
                staticImports.push(importStatement)

                objectProps.push(
                  `${JSON.stringify(relativePath)}: ${variableName}`
                )
              } else {
                let importStatement = `import(${JSON.stringify(importPath)})`
                if (importKey) {
                  importStatement += `.then(m => m.${importKey})`
                }
                objectProps.push(
                  `${JSON.stringify(relativePath)}: () => ${importStatement}`
                )
              }
            })
            console.log(resolveId, ' -> ', staticImports)

            const replacement = objectProps.join(',')
            s.overwrite(start, end, `Object.assign({${replacement}})`)

            return staticImports
          })
        )
      )
        .flat()
        .filter(Boolean)

      if (staticImports.length) {
        s.prepend(staticImports.join('\n'))
      }

      return s.toString()
    },
  }
}

const knownOptions = {
  as: 'string',
  eager: 'boolean',
  import: 'string',
  exhaustive: 'boolean',
}

const forceDefaultAs: ('url' | 'raw')[] = ['url', 'raw']

const importMetaGlobalRE = /import\.meta\.(glob|globEager)\(/g

const parseImportGlob = (code: string, impoter: string, root: string) => {
  const matches = Array.from(code.matchAll(importMetaGlobalRE))

  const tasks = matches.map((match, index) => {
    const start = match.index!

    const ast: CallExpression = parseExpressionAt(code, start, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    }) as any

    const err = (msg: string) => {
      const error = new Error(`Invalid glob import syntax: ${msg}`)
      return error
    }

    if (ast.type !== 'CallExpression') {
      throw err(`Except CallExpression, got ${ast.type}`)
    }

    const args = ast.arguments
    const argsLength = args.length
    if (argsLength < 1 || argsLength > 2) {
      throw err(`Expected 1-2 arguments, but got ${argsLength}`)
    }

    const [arg1, arg2]: [
      Literal | ArrayExpression,
      ObjectExpression | undefined
    ] = args

    // arg1
    const globs: string[] = []
    if (arg1.type === 'Literal') {
      if (!isString(arg1.value)) {
        throw err(`Expected glob to be a string, but got ${typeof arg1.value}`)
      }
      globs.push(arg1.value)
    } else if (arg1.type === 'ArrayExpression') {
      for (const ele of arg1.elements) {
        if (!ele) {
          continue
        }
        if (ele.type !== 'Literal') {
          throw err('Could only use literals')
        }
        if (!isString(ele.value)) {
          throw err(`Expected glob to be a string, but got ${typeof ele.value}`)
        }
        globs.push(ele.value)
      }
    } else {
      throw err('Could only use literals')
    }

    // arg2
    const options: GeneralImportGlobOptions = {}
    if (arg2) {
      if (arg2.type !== 'ObjectExpression') {
        throw err(
          `Expected the second argument to be a object literal, but got ${typeof arg2.type}`
        )
      }

      for (const prop of arg2.properties) {
        if (
          prop.type === 'SpreadElement' ||
          (prop.key.type !== 'Identifier' && prop.key.type !== 'Literal')
        ) {
          throw err('Could only use literals')
        }

        const propName: keyof GeneralImportGlobOptions =
          (prop.key as any).name || (prop.key as any).value

        if (propName === 'query') {
          if (prop.value.type === 'ObjectExpression') {
            const queryData: Record<string, string> = {}
            for (const queryProp of prop.value.properties) {
              if (
                queryProp.type === 'SpreadElement' ||
                (queryProp.key.type !== 'Identifier' &&
                  queryProp.key.type !== 'Literal')
              ) {
                throw err('Could only use literals')
              }
              queryData[queryProp.key.name] = queryProp.value.value
            }
            options.query = queryData
          } else if (prop.value.type === 'Literal') {
            if (!isString(prop.value.value)) {
              throw err(
                `Expected query to be a string, but got ${typeof prop.value
                  .value}`
              )
            }
            options.query = prop.value.value
          }

          continue
        }

        if (prop.value.type !== 'Literal') {
          throw err('Could only use literals')
        }

        if (isUndefined(prop.value.value)) {
          continue
        }

        if (!(propName in knownOptions)) {
          throw err(`Nnknown options ${propName}`)
        }

        const propNameType = typeof prop.value.value
        if (propNameType !== knownOptions[propName]) {
          throw err(
            `Expected the type of option "${propName}" to be ${knownOptions[propName]}, but got ${propNameType}`
          )
        }

        options[propName] = prop.value.value as any
      }
    }

    if (options.as && forceDefaultAs.includes(options.as)) {
      if (
        options.import &&
        options.import !== 'default' &&
        options.import !== '*'
      ) {
        throw err(
          `Option "import" can only be "default" or "*" when "as" is "${options.as}", but got ${options.import}`
        )
      }
      options.import = options.import || 'default'
    }

    // as 和 query 不能同时存在
    if (options.as && options.query) {
      throw err(`Options "query" and "as" can not used together`)
    }

    const globsResolved = globs.map(globPath =>
      toAbsoluteGlob(globPath, root, impoter)
    )

    return {
      start: (ast as any).start,
      end: (ast as any).end,
      index,
      globs,
      globsResolved,
      options,
    }
  })

  return tasks
}

/**
 * 将 glob 路径转换为绝对路径
 */
const toAbsoluteGlob = (glob: string, root: string, importer: string) => {
  const prefix: string = glob.startsWith('!') ? glob[0] : ''
  if (prefix) {
    glob = glob.slice(1)
  }

  const dir = importer ? path.dirname(importer) : root

  if (glob.startsWith('/')) {
    return `${prefix}${path.join(root, glob)}`
  }

  if (glob.startsWith('./')) {
    return `${prefix}${path.join(dir, glob)}`
  }

  if (glob.startsWith('../')) {
    return `${prefix}${path.join(dir, glob)}`
  }

  if (glob.startsWith('**')) {
    return `${prefix}${glob}`
  }

  return glob
}
