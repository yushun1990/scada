import {
  parseManagedSvgSource,
  type ManagedSvgImportResult,
} from './managedSvg'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const INKSCAPE_NAMESPACE = 'http://www.inkscape.org/namespaces/inkscape'
const SODIPODI_NAMESPACE = 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd'
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'

const EDITOR_METADATA_NAMESPACES = new Set([
  INKSCAPE_NAMESPACE,
  SODIPODI_NAMESPACE,
])

// This must remain a strict subset of the presentation properties accepted by
// managedSvg.ts. The compatibility pass only expands static stylesheet rules;
// parseManagedSvgSource remains the final sanitizer/authority.
const COMPATIBLE_STYLESHEET_PROPERTIES = new Set([
  'fill',
  'stroke',
  'stroke-width',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'fill-rule',
  'clip-rule',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'clip-path',
  'display',
  'visibility',
  'vector-effect',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'stop-color',
  'stop-opacity',
])

type CompatibleStyleDeclaration = {
  name: string
  value: string
}

type CompatibleStyleSelector = {
  tagName: string | null
  id: string | null
  classes: readonly string[]
  specificity: number
}

type CompatibleStyleRule = {
  selector: CompatibleStyleSelector
  declarations: readonly CompatibleStyleDeclaration[]
  order: number
}

function assertSafeStylesheetValue(value: string, label: string) {
  if (/javascript\s*:/i.test(value)) {
    throw new Error(`${label} 包含不安全脚本引用`)
  }
  if (/\b(?:https?|file|blob):/i.test(value)) {
    throw new Error(`${label} 包含外部资源引用`)
  }

  const withoutInternalUrls = value.replace(/url\(\s*#[^)\s]+\s*\)/gi, '')
  if (/url\s*\(/i.test(withoutInternalUrls)) {
    throw new Error(`${label} 只允许文档内部 url(#...) 引用`)
  }
}

function parseStylesheetDeclarations(source: string, label: string) {
  const declarations: CompatibleStyleDeclaration[] = []

  for (const rawDeclaration of source.split(';')) {
    const declaration = rawDeclaration.trim()
    if (!declaration) continue

    const separator = declaration.indexOf(':')
    if (separator <= 0) {
      throw new Error(`${label} 的 CSS 声明无效`)
    }

    const name = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim()
    if (!COMPATIBLE_STYLESHEET_PROPERTIES.has(name) || !value || /!important/i.test(value)) {
      throw new Error(`${label} 包含不支持的 CSS 声明：${name || declaration}`)
    }

    assertSafeStylesheetValue(value, `${label}.${name}`)
    declarations.push({ name, value })
  }

  if (declarations.length === 0) {
    throw new Error(`${label} 不包含可用的 presentation 声明`)
  }

  return declarations
}

function parseSimpleSelector(source: string, label: string): CompatibleStyleSelector {
  const selector = source.trim()
  if (!selector) {
    throw new Error(`${label} 包含空 CSS selector`)
  }

  if (/\s|[>+~:\[\]]/.test(selector)) {
    throw new Error(`${label} 只支持静态简单 selector（tag / .class / #id）`)
  }

  let index = 0
  let tagName: string | null = null
  let id: string | null = null
  const classes: string[] = []

  const tagMatch = /^(\*|[A-Za-z_][A-Za-z0-9_.-]*)/.exec(selector)
  if (tagMatch) {
    tagName = tagMatch[1] === '*' ? null : tagMatch[1]!.toLowerCase()
    index = tagMatch[0].length
  }

  while (index < selector.length) {
    const marker = selector[index]
    if (marker !== '.' && marker !== '#') {
      throw new Error(`${label} 包含不支持的 CSS selector：${selector}`)
    }

    const identifierMatch = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(selector.slice(index + 1))
    if (!identifierMatch) {
      throw new Error(`${label} 包含无效的 CSS selector：${selector}`)
    }

    const identifier = identifierMatch[0]
    if (marker === '#') {
      if (id !== null) {
        throw new Error(`${label} selector 不能包含多个 #id：${selector}`)
      }
      id = identifier
    } else {
      classes.push(identifier)
    }
    index += identifier.length + 1
  }

  if (tagName === null && id === null && classes.length === 0) {
    throw new Error(`${label} 包含不支持的 CSS selector：${selector}`)
  }

  return {
    tagName,
    id,
    classes,
    specificity: (id ? 100 : 0) + classes.length * 10 + (tagName ? 1 : 0),
  }
}

function parseSafeStylesheet(source: string, label: string, startOrder: number) {
  const normalized = source.replace(/\/\*[\s\S]*?\*\//g, '').trim()
  if (!normalized) return { rules: [] as CompatibleStyleRule[], nextOrder: startOrder }
  if (/@/.test(normalized)) {
    throw new Error(`${label} 不支持 @import / @media / @font-face 等 CSS at-rule`)
  }

  const rules: CompatibleStyleRule[] = []
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g
  let cursor = 0
  let order = startOrder

  for (const match of normalized.matchAll(rulePattern)) {
    const matchIndex = match.index ?? 0
    if (normalized.slice(cursor, matchIndex).trim()) {
      throw new Error(`${label} CSS 结构无效或包含嵌套规则`)
    }

    const selectorSource = match[1] ?? ''
    const declarationSource = match[2] ?? ''
    const declarations = parseStylesheetDeclarations(declarationSource, label)

    for (const rawSelector of selectorSource.split(',')) {
      rules.push({
        selector: parseSimpleSelector(rawSelector, label),
        declarations,
        order,
      })
      order += 1
    }

    cursor = matchIndex + match[0].length
  }

  if (normalized.slice(cursor).trim()) {
    throw new Error(`${label} CSS 结构无效或包含不支持内容`)
  }

  return { rules, nextOrder: order }
}

function selectorMatches(element: Element, selector: CompatibleStyleSelector) {
  if (selector.tagName && element.localName.toLowerCase() !== selector.tagName) return false
  if (selector.id && element.getAttribute('id') !== selector.id) return false

  const classNames = new Set(
    (element.getAttribute('class') ?? '')
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean),
  )
  return selector.classes.every((className) => classNames.has(className))
}

function stylesheetPresentationFor(element: Element, rules: readonly CompatibleStyleRule[]) {
  const matching = rules
    .filter((rule) => selectorMatches(element, rule.selector))
    .sort((left, right) => left.selector.specificity - right.selector.specificity || left.order - right.order)

  const result = new Map<string, string>()
  for (const rule of matching) {
    for (const declaration of rule.declarations) {
      result.set(declaration.name, declaration.value)
    }
  }
  return result
}

function shouldDiscardMetadataElement(element: Element) {
  if (element.namespaceURI === SVG_NAMESPACE && element.localName.toLowerCase() === 'metadata') {
    return true
  }
  return element.namespaceURI !== null && EDITOR_METADATA_NAMESPACES.has(element.namespaceURI)
}

function stripCompatibilityMetadataAttribute(element: Element, attribute: Attr) {
  const lowerName = attribute.name.toLowerCase()
  if (lowerName === 'class') return true
  if (lowerName.startsWith('data-')) return true
  if (lowerName.startsWith('aria-')) return true
  if (lowerName === 'role' || lowerName === 'focusable' || lowerName === 'tabindex') return true
  if (attribute.namespaceURI === XML_NAMESPACE && attribute.localName === 'space') return true
  return attribute.namespaceURI !== null && EDITOR_METADATA_NAMESPACES.has(attribute.namespaceURI)
}

function normalizeStylesAndMetadata(document: Document) {
  const styleElements = Array.from(document.getElementsByTagNameNS(SVG_NAMESPACE, 'style'))
  const rules: CompatibleStyleRule[] = []
  let order = 0

  for (const [index, styleElement] of styleElements.entries()) {
    const type = styleElement.getAttribute('type')?.trim().toLowerCase()
    if (type && type !== 'text/css') {
      throw new Error(`<style> type 不受支持：${type}`)
    }
    const media = styleElement.getAttribute('media')?.trim().toLowerCase()
    if (media && media !== 'all' && media !== 'screen') {
      throw new Error(`<style> media 不受支持：${media}`)
    }

    const parsed = parseSafeStylesheet(styleElement.textContent ?? '', `<style>[${index}]`, order)
    rules.push(...parsed.rules)
    order = parsed.nextOrder
  }

  const root = document.documentElement
  const allElements = [root, ...Array.from(root.querySelectorAll('*'))]
  for (const element of allElements) {
    if (styleElements.includes(element as SVGStyleElement)) continue
    if (shouldDiscardMetadataElement(element)) continue

    const stylesheetPresentation = stylesheetPresentationFor(element, rules)
    const inlineStyle = element.getAttribute('style')?.trim() ?? ''
    if (stylesheetPresentation.size > 0) {
      const expanded = [...stylesheetPresentation.entries()]
        .map(([name, value]) => `${name}:${value}`)
        .join(';')
      element.setAttribute('style', inlineStyle ? `${expanded};${inlineStyle}` : expanded)
    }

    for (const attribute of Array.from(element.attributes)) {
      if (stripCompatibilityMetadataAttribute(element, attribute)) {
        element.removeAttributeNode(attribute)
      }
    }
  }

  for (const styleElement of styleElements) {
    styleElement.remove()
  }

  for (const element of [...Array.from(root.querySelectorAll('*'))].reverse()) {
    if (shouldDiscardMetadataElement(element)) {
      element.remove()
    }
  }
}

export function parseManagedSvgSourceWithCompatibility(source: string): ManagedSvgImportResult {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    throw new Error('当前环境不支持 SVG XML 兼容解析')
  }

  const normalizedSource = source.replace(/^\uFEFF/, '').trim()
  if (!normalizedSource) {
    throw new Error('SVG 文件为空')
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(normalizedSource)) {
    throw new Error('SVG 不允许 DTD / ENTITY')
  }

  const withoutXmlDeclaration = normalizedSource.replace(/^<\?xml\s[^?]*\?>\s*/i, '')
  if (/<\?(?!xml\b)/i.test(withoutXmlDeclaration)) {
    throw new Error('SVG 不允许处理指令')
  }

  const parsed = new DOMParser().parseFromString(withoutXmlDeclaration, 'image/svg+xml')
  if (parsed.querySelector('parsererror')) {
    throw new Error('SVG XML 格式无效')
  }
  if (parsed.doctype) {
    throw new Error('SVG 不允许 DTD')
  }
  if (parsed.documentElement.namespaceURI !== SVG_NAMESPACE || parsed.documentElement.localName !== 'svg') {
    throw new Error('文件根节点必须是 <svg>')
  }

  normalizeStylesAndMetadata(parsed)

  // This serialization is only a transient compatibility bridge. The returned
  // ManagedSvgDocument from parseManagedSvgSource is still the sole persisted
  // SVG authority, and assetRef remains its deterministic derivative.
  return parseManagedSvgSource(new XMLSerializer().serializeToString(parsed))
}
