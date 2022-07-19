import type {
  AttributeNode,
  ElementNode,
  NodeTransform,
} from '@vue/compiler-dom'
import { NodeTypes } from '@vue/compiler-dom'
import { ResolvedConfig } from '../config'
import type { Plugin } from '../plugin'
import { ViteDevServer } from '../server'
import {
  isFunction,
  isString,
  isArray,
  forEach,
  isBoolean,
  cleanUrl,
} from '../utils'

/**
 * html 转换标签描述
 */
export interface HtmlTagDescriptor {
  /**
   * 标签名
   */
  tag: string

  /**
   * 标签属性
   */
  attrs?: Record<string, boolean | string | undefined>

  /**
   * 子标签
   */
  children?: HtmlTagDescriptor[] | string

  /**
   * 插入位置
   */
  injectTo: 'head' | 'head-prepend' | 'body' | 'body-prepend'
}

/**
 * html 转换钩子函数
 */
export type IndexHtmlTransformHook = (
  html: string,
  ctx: IndexHtmlTransformContext
) => void | IndexHtmlTransformResult | Promise<void | IndexHtmlTransformResult>

/**
 * html 转换钩子作用域
 */
export interface IndexHtmlTransformContext {
  path: string

  server: ViteDevServer

  // fileName: string

  // originalUrl: string
}

/**
 * html 转换钩子配置
 */
export type IndexHtmlTransform =
  | IndexHtmlTransformHook
  | { transform: IndexHtmlTransformHook; enforce: 'pre' | 'post' }

/**
 * html 转换钩子函数返回结果
 */
export type IndexHtmlTransformResult =
  | string
  | HtmlTagDescriptor[]
  | { html: string; tags: HtmlTagDescriptor[] }

/**
 * 按照执行时机解析 hook
 */
export const resolveHtmlTransforms = (
  plugins: Plugin[]
): [IndexHtmlTransformHook[], IndexHtmlTransformHook[]] => {
  const preHooks: IndexHtmlTransformHook[] = []
  const postHooks: IndexHtmlTransformHook[] = []

  for (const plugin of plugins) {
    if (!plugin.indexTransform) {
      continue
    }

    const hook = plugin.indexTransform
    if (isFunction(hook)) {
      postHooks.push(hook)
    } else if (hook.enforce === 'post') {
      postHooks.push(hook.transform)
    } else {
      preHooks.push(hook.transform)
    }
  }

  return [preHooks, postHooks]
}

/**
 * 执行所有的 index hook
 * @param { string } html html 文件内容
 * @param { IndexHtmlTransformHook[] } hooks 所有 hook 列表
 * @param { IndexHtmlTransformContext } ctx 作用域对象
 */
export const applyIndexTransformHooks = async (
  html: string,
  hooks: IndexHtmlTransformHook[],
  ctx: IndexHtmlTransformContext
) => {
  for (const hook of hooks) {
    const result = await hook(html, ctx)
    if (!result) {
      continue
    }

    let tags: HtmlTagDescriptor[]
    if (isString(result)) {
      html = result
    } else if (isArray(result)) {
      tags = result
    } else {
      tags = result.tags
      html = result.html
    }

    if (!tags!) {
      continue
    }

    const headTags: HtmlTagDescriptor[] = []
    const headPrependTags: HtmlTagDescriptor[] = []
    const bodyTags: HtmlTagDescriptor[] = []
    const bodyPrependTags: HtmlTagDescriptor[] = []

    for (const tag of tags) {
      if (tag.injectTo === 'body') {
        bodyTags.push(tag)
      } else if (tag.injectTo === 'body-prepend') {
        bodyPrependTags.push(tag)
      } else if (tag.injectTo === 'head') {
        headTags.push(tag)
      } else {
        headPrependTags.push(tag)
      }
    }

    html = injectHeadTo(html, headPrependTags, true)
    html = injectHeadTo(html, headTags, false)
    html = injectBodyTo(html, bodyPrependTags, true)
    html = injectBodyTo(html, bodyTags, false)
  }

  return html
}

// 插入 head 尾部、头部
const headInjectRE = /([\t ]*)<\/head>/i
const headPrependInjectRE = /([\t ]*)<head[^>]*>/i

// 插入 body 尾部、头部
const bodyInjectRE = /([\t ]*)<\/body>/i
const bodyPrependInjectRE = /([\t ]*)<body[^>]*>/i

// 插入 html 尾部、头部
const htmlInjectRE = /([\t ]*)<\/html>/i
const htmlPrependInjectRE = /([\t ]*)<html[^>]*>/i

const doctypePrependInjectRE = /<!DOCTYPE html>/i

/**
 * 插入内容至 head 标签
 */
const injectHeadTo = (
  html: string,
  tags: HtmlTagDescriptor[],
  prepend: boolean
) => {
  if (!tags.length) {
    return html
  }

  // 插入 head 头部
  if (prepend) {
    if (headPrependInjectRE.test(html)) {
      return html.replace(
        headPrependInjectRE,
        (all, whitespace: string) =>
          `${all}\n${serializeTags(tags, incrementIndent(whitespace))}`
      )
    }
    // 兜底
    return prependInjectFallback(html, tags)
  }

  // 插入 head 尾部
  if (headInjectRE.test(html)) {
    return html.replace(
      headInjectRE,
      (all, whitespace: string) =>
        `${serializeTags(tags, incrementIndent(whitespace))}${all}`
    )
  }

  // 如果没有 head 则尝试插入 body 头部
  if (bodyPrependInjectRE.test(html)) {
    return html.replace(
      bodyPrependInjectRE,
      (all, whitespace: string) =>
        `${all}\n${serializeTags(tags, incrementIndent(whitespace))}`
    )
  }

  // 兜底
  return prependInjectFallback(html, tags)
}

/**
 * 插入内容至 head 标签
 */
const injectBodyTo = (
  html: string,
  tags: HtmlTagDescriptor[],
  prepend: boolean
) => {
  if (!tags.length) {
    return html
  }

  // 插入 body 头部
  if (prepend) {
    if (bodyPrependInjectRE.test(html)) {
      return html.replace(
        bodyPrependInjectRE,
        (all, whitespace: string) =>
          `${all}\n${serializeTags(tags, incrementIndent(whitespace))}`
      )
    }

    // 不存在 body，插入 head 尾部
    if (headInjectRE.test(html)) {
      return html.replace(
        headInjectRE,
        (all, whitespace: string) =>
          `${serializeTags(tags, incrementIndent(whitespace))}${all}`
      )
    }

    // 兜底
    return prependInjectFallback(html, tags)
  }

  // 插入 body 尾部
  if (bodyInjectRE.test(html)) {
    return html.replace(
      bodyInjectRE,
      (all, whitespace: string) =>
        `${serializeTags(tags, incrementIndent(whitespace))}${all}`
    )
  }

  // 如果没有 body 则尝试插入 html 尾部
  if (htmlInjectRE.test(html)) {
    return html.replace(
      htmlInjectRE,
      (all, whitespace: string) =>
        `${serializeTags(tags, incrementIndent(whitespace))}${all}`
    )
  }

  // 兜底
  return prependInjectFallback(html, tags)
}

/**
 * 兜底插入 html、doctype 中
 */
const prependInjectFallback = (html: string, tags: HtmlTagDescriptor[]) => {
  if (htmlPrependInjectRE.test(html)) {
    return html.replace(
      htmlPrependInjectRE,
      (all, whitespace: string) =>
        `${all}\n${serializeTags(tags, incrementIndent(whitespace))}`
    )
  }
  if (doctypePrependInjectRE.test(html)) {
    return html.replace(
      doctypePrependInjectRE,
      all => `${all}\n${serializeTags(tags)}`
    )
  }

  return `${serializeTags(tags)}\n${html}`
}

const noTails = new Set(['meta', 'link', 'base'])

/**
 * 序列化标签，包括标签名、属性和子节点
 */
const serializeTag = (
  { tag, children, attrs }: HtmlTagDescriptor,
  whitespace: string
) => {
  return noTails.has(tag)
    ? `${whitespace}<${tag}${serializeAttrs(attrs)}>`
    : `${whitespace}<${tag}${serializeAttrs(attrs)}>\n${serializeTags(
        children,
        incrementIndent(whitespace)
      )}${whitespace}</${tag}>`
}

/**
 * 序列化标签列表(子节点)
 */
const serializeTags = (
  tags: HtmlTagDescriptor['children'],
  whitespace = ''
): string => {
  return tags
    ? isString(tags)
      ? `${whitespace}${tags}\n`
      : `${tags.map(tag => serializeTag(tag, whitespace)).join('\n')}\n`
    : ''
}

/**
 * 序列化标签属性
 */
const serializeAttrs = (attrs: HtmlTagDescriptor['attrs']) => {
  if (!attrs) {
    return ''
  }

  let res = ''
  Object.entries(attrs).forEach(([attr, value]) => {
    if (isBoolean(value)) {
      res += value ? ` ${attr}` : ''
    } else {
      res += ` ${attr}=${JSON.stringify(value)}`
    }
  })

  return res
}

/**
 * 增加缩进
 */
const incrementIndent = (whitespace = '') => {
  return `${whitespace}${whitespace[0] === '\t' ? '\t' : '  '}`
}

/**
 * 遍历 html 节点
 */
export const traverseHtml = async (html: string, visitor: NodeTransform) => {
  const { parse, transform } = await import('@vue/compiler-dom')

  const ast = parse(html, {})
  transform(ast, {
    nodeTransforms: [visitor],
  })
}

/**
 * 获取 script 标签信息
 */
export const getScriptInfo = (node: ElementNode) => {
  let isModule = false
  let isAsync = false
  let src: AttributeNode | undefined
  for (const prop of node.props) {
    if (prop.type !== NodeTypes.ATTRIBUTE) {
      continue
    }

    if (prop.name === 'src') {
      src = prop
    } else if (prop.name === 'type' && prop.value?.content === 'module') {
      isModule = true
    } else if (prop.name === 'async') {
      isAsync = true
    }
  }

  return { src, isModule, isAsync }
}

/**
 * 检测是否是 html 代理
 */
const htmlProxyRE = /\?html-proxy&index=(\d+)\.(js|css)$/
export const isHTMLProxy = (id: string) => htmlProxyRE.test(id)

/**
 * 缓存 html 代理内容
 */
const htmlProxyMap: Map<
  ResolvedConfig,
  Map<string, { code: string }[]>
> = new Map()

export const addToHTMLProxyCache = (
  config: ResolvedConfig,
  htmlPath: string,
  index: number,
  result: { code: string }
) => {
  let map = htmlProxyMap.get(config)
  if (!map) {
    htmlProxyMap.set(config, (map = new Map()))
  }
  let maps = map.get(htmlPath)
  if (!maps) {
    map.set(htmlPath, (maps = []))
  }
  maps[index] = result
}

/**
 * 解析 proxy 的 html 插件
 */
export const htmlInlineProxyPlugin = (config: ResolvedConfig): Plugin => {
  return {
    name: 'vite:html-inlne-proxy',

    resolveId(id) {
      if (isHTMLProxy(id)) {
        return id
      }
    },

    load(id) {
      const proxyMatch = htmlProxyRE.exec(id)

      if (!proxyMatch) {
        return
      }
      const index = +proxyMatch[1]
      const url = cleanUrl(id).replace(config.root, '')
      const cache = htmlProxyMap.get(config)?.get(url)

      if (!cache) {
        return
      }
      const result = cache[index]

      if (result) {
        return result.code
      }
    },
  }
}
