/**
 * 更新样式
 */
const sheetsMap: Map<string, HTMLStyleElement> = new Map()
export const updateStyle = (id: string, content: string) => {
  let style = sheetsMap.get(id)
  if (!style) {
    style = document.createElement('style')
    style.setAttribute('type', 'text/css')
    style.innerHTML = content
    document.head.appendChild(style)
  } else {
    style.innerHTML = content
  }

  sheetsMap.set(id, style)
}
