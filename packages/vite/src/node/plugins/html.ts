import { Plugin } from '../plugin'
import { isFunction, isString, isArray, forEach, isBoolean } from '../utils'

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
  html: string
) => void | IndexHtmlTransformResult | Promise<void | IndexHtmlTransformResult>

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
 */
export const applyIndexTransformHooks = async (
  html: string,
  hooks: IndexHtmlTransformHook[]
) => {
  for (const hook of hooks) {
    const result = await hook(html)
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
  }

  return html
}

// 插入 head 尾部、头部
const headInjectRE = /([\t ]*)<\/head>/i
const headPrependInjectRE = /([\t ]*)<head[^>]*>/i

// 插入 body 尾部、头部
const bodyInjectRE = /([\t ]*)<\/body>/i
const bodyPrependInjectRE = /([\t ]*)<body[^>]*>/i

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
          `${all}${serializeTags(tags, incrementIndent(whitespace))}`
      )
    }
    return html
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
        `${all}${serializeTags(tags, incrementIndent(whitespace))}`
    )
  }

  // 兜底
  return html
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
    ? `<${tag}${serializeAttrs(attrs)}>`
    : `<${tag}${serializeAttrs(attrs)}>${serializeTags(
        children,
        incrementIndent(whitespace)
      )}</${tag}>`
}

/**
 * 序列化标签列表(子节点)
 */
const serializeTags = (
  tags: HtmlTagDescriptor['children'],
  whitespace: string
): string => {
  return tags
    ? isString(tags)
      ? tags
      : tags.map(tag => serializeTag(tag, whitespace)).join('\n')
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
  forEach(Object.keys(attrs), key => {
    const value = attrs[key]
    if (isBoolean(value)) {
      res += value ? ` ${key}` : ''
    } else {
      res += ` ${key}=${JSON.stringify(value)}`
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
