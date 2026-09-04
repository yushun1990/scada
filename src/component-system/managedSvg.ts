export const MANAGED_SVG_DOCUMENT_VERSION = 1 as const

export type ManagedSvgAttribute = {
  name: string
  value: string
}

export type ManagedSvgText = {
  kind: 'text'
  text: string
}

export type ManagedSvgElement = {
  kind: 'element'
  tagName: string
  tagId: string
  attributes: readonly ManagedSvgAttribute[]
  children: readonly ManagedSvgNode[]
}

export type ManagedSvgNode = ManagedSvgElement | ManagedSvgText

export type ManagedSvgDocument = {
  version: typeof MANAGED_SVG_DOCUMENT_VERSION
  root: ManagedSvgElement
}

export type ManagedSvgImportResult = {
  document: ManagedSvgDocument
  intrinsicWidth: number
  intrinsicHeight: number
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const MANAGED_TAG_ID_PATTERN = /^svg-tag-\d{6,}$/

const CANONICAL_TAG_NAMES = new Map<string, string>([
  ['svg', 'svg'],
  ['g', 'g'],
  ['path', 'path'],
  ['rect', 'rect'],
  ['circle', 'circle'],
  ['ellipse', 'ellipse'],
  ['line', 'line'],
  ['polyline', 'polyline'],
  ['polygon', 'polygon'],
  ['defs', 'defs'],
  ['lineargradient', 'linearGradient'],
  ['radialgradient', 'radialGradient'],
  ['stop', 'stop'],
  ['clippath', 'clipPath'],
  ['symbol', 'symbol'],
  ['use', 'use'],
  ['text', 'text'],
  ['tspan', 'tspan'],
  ['title', 'title'],
  ['desc', 'desc'],
])

const GLOBAL_ATTRIBUTES = new Set([
  'id',
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
  'transform',
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
])

const STYLE_PRESENTATION_ATTRIBUTES = new Set([
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

const TAG_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  svg: new Set(['x', 'y', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'version']),
  g: new Set(),
  path: new Set(['d', 'pathLength']),
  rect: new Set(['x', 'y', 'width', 'height', 'rx', 'ry', 'pathLength']),
  circle: new Set(['cx', 'cy', 'r', 'pathLength']),
  ellipse: new Set(['cx', 'cy', 'rx', 'ry', 'pathLength']),
  line: new Set(['x1', 'y1', 'x2', 'y2', 'pathLength']),
  polyline: new Set(['points', 'pathLength']),
  polygon: new Set(['points', 'pathLength']),
  defs: new Set(),
  linearGradient: new Set([
    'x1', 'y1', 'x2', 'y2', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'href',
  ]),
  radialGradient: new Set([
    'cx', 'cy', 'r', 'fx', 'fy', 'fr', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'href',
  ]),
  stop: new Set(['offset', 'stop-color', 'stop-opacity']),
  clipPath: new Set(['clipPathUnits']),
  symbol: new Set(['viewBox', 'preserveAspectRatio']),
  use: new Set(['x', 'y', 'width', 'height', 'href']),
  text: new Set(['x', 'y', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust']),
  tspan: new Set(['x', 'y', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust']),
  title: new Set(),
  desc: new Set(),
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canonicalTagName(value: string) {
  return CANONICAL_TAG_NAMES.get(value.toLowerCase()) ?? null
}

function isAllowedAttribute(tagName: string, name: string) {
  return GLOBAL_ATTRIBUTES.has(name) || TAG_ATTRIBUTES[tagName]?.has(name) === true
}

function assertSafeReferenceValue(value: string, label: string) {
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

function normalizeInlineStyle(value: string, label: string) {
  const result = new Map<string, string>()

  for (const rawDeclaration of value.split(';')) {
    const declaration = rawDeclaration.trim()
    if (!declaration) continue

    const separator = declaration.indexOf(':')
    if (separator <= 0) {
      throw new Error(`${label} 的 style 声明无效`)
    }

    const name = declaration.slice(0, separator).trim().toLowerCase()
    const styleValue = declaration.slice(separator + 1).trim()

    if (!STYLE_PRESENTATION_ATTRIBUTES.has(name) || !styleValue || /!important/i.test(styleValue)) {
      throw new Error(`${label} 包含不支持的 style 声明：${name || declaration}`)
    }

    assertSafeReferenceValue(styleValue, `${label} style.${name}`)
    result.set(name, styleValue)
  }

  return result
}

function normalizeElementAttributes(element: Element, tagName: string) {
  const result = new Map<string, string>()
  let inlineStyle: string | null = null

  for (const attribute of Array.from(element.attributes)) {
    const rawName = attribute.name
    const localName = attribute.localName
    const lowerName = rawName.toLowerCase()

    if (lowerName === 'xmlns' || lowerName.startsWith('xmlns:')) {
      continue
    }

    if (lowerName === 'data-scada-tag') {
      continue
    }

    if (lowerName.startsWith('on')) {
      throw new Error(`<${tagName}> 包含不允许的事件属性 ${rawName}`)
    }

    if (lowerName === 'style') {
      inlineStyle = attribute.value
      continue
    }

    let name = rawName
    if (attribute.prefix === 'xlink' && localName === 'href') {
      name = 'href'
    } else if (attribute.namespaceURI && attribute.namespaceURI !== SVG_NAMESPACE) {
      throw new Error(`<${tagName}> 包含不支持的命名空间属性 ${rawName}`)
    }

    if (!isAllowedAttribute(tagName, name)) {
      throw new Error(`<${tagName}> 包含不支持的属性 ${name}`)
    }

    const normalizedValue = attribute.value.trim()
    if (!normalizedValue && name !== 'd' && name !== 'points') {
      throw new Error(`<${tagName}> 属性 ${name} 不能为空`)
    }

    if (name === 'href' && !normalizedValue.startsWith('#')) {
      throw new Error(`<${tagName}> href 只允许文档内部 #... 引用`)
    }

    assertSafeReferenceValue(normalizedValue, `<${tagName}>.${name}`)
    result.set(name, normalizedValue)
  }

  if (inlineStyle !== null) {
    for (const [name, value] of normalizeInlineStyle(inlineStyle, `<${tagName}>`)) {
      if (!isAllowedAttribute(tagName, name)) {
        throw new Error(`<${tagName}> 不支持 style.${name}`)
      }
      result.set(name, value)
    }
  }

  return [...result.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ({ name, value }))
}

function nextManagedTagId(index: number) {
  return `svg-tag-${String(index).padStart(6, '0')}`
}

function isTextContainer(tagName: string) {
  return tagName === 'text' || tagName === 'tspan' || tagName === 'title' || tagName === 'desc'
}

function collectSourceIdsAndReferences(root: ManagedSvgElement) {
  const ids = new Set<string>()
  const references: Array<{ target: string; label: string }> = []

  const visit = (element: ManagedSvgElement) => {
    for (const attribute of element.attributes) {
      if (attribute.name === 'id') {
        if (ids.has(attribute.value)) {
          throw new Error(`SVG source id 重复：${attribute.value}`)
        }
        ids.add(attribute.value)
      }

      if (attribute.name === 'href') {
        references.push({
          target: attribute.value.slice(1),
          label: `${element.tagId}.href`,
        })
      }

      for (const match of attribute.value.matchAll(/url\(\s*#([^\s)]+)\s*\)/gi)) {
        references.push({
          target: match[1] ?? '',
          label: `${element.tagId}.${attribute.name}`,
        })
      }
    }

    for (const child of element.children) {
      if (child.kind === 'element') visit(child)
    }
  }

  visit(root)

  for (const reference of references) {
    if (!reference.target || !ids.has(reference.target)) {
      throw new Error(`SVG 内部引用 ${reference.label} 指向不存在的 #${reference.target}`)
    }
  }
}

function parsePositiveSvgLength(value: string | undefined) {
  if (!value) return null
  const match = /^([+]?(?:\d+(?:\.\d*)?|\.\d+))(?:px)?$/i.exec(value.trim())
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseViewBox(value: string | undefined) {
  if (!value) return null
  const values = value.trim().split(/[\s,]+/).map(Number)
  if (values.length !== 4 || values.some((candidate) => !Number.isFinite(candidate))) {
    return null
  }
  const width = values[2] ?? 0
  const height = values[3] ?? 0
  return width > 0 && height > 0 ? { width, height } : null
}

export function getManagedSvgIntrinsicSize(document: ManagedSvgDocument) {
  assertManagedSvgDocument(document)
  const attributes = Object.fromEntries(
    document.root.attributes.map((attribute) => [attribute.name, attribute.value]),
  )
  const width = parsePositiveSvgLength(attributes.width)
  const height = parsePositiveSvgLength(attributes.height)
  const viewBox = parseViewBox(attributes.viewBox)

  if (width && height) return { width, height }
  if (viewBox && width) return { width, height: width * viewBox.height / viewBox.width }
  if (viewBox && height) return { width: height * viewBox.width / viewBox.height, height }
  if (viewBox) return viewBox
  return { width: width ?? 300, height: height ?? 150 }
}

export function parseManagedSvgSource(source: string): ManagedSvgImportResult {
  if (typeof DOMParser === 'undefined') {
    throw new Error('当前环境不支持 SVG XML 解析')
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
  const parserError = parsed.querySelector('parsererror')
  if (parserError) {
    throw new Error('SVG XML 格式无效')
  }

  if (parsed.doctype) {
    throw new Error('SVG 不允许 DTD')
  }

  const rootElement = parsed.documentElement
  const rootTagName = canonicalTagName(rootElement.localName)
  if (rootTagName !== 'svg') {
    throw new Error('文件根节点必须是 <svg>')
  }

  let tagIndex = 0

  const convertElement = (element: Element): ManagedSvgElement => {
    const tagName = canonicalTagName(element.localName)
    if (!tagName) {
      throw new Error(`SVG 包含不支持的元素 <${element.tagName}>`)
    }

    if (element.namespaceURI && element.namespaceURI !== SVG_NAMESPACE) {
      throw new Error(`SVG 包含不支持的命名空间元素 <${element.tagName}>`)
    }

    tagIndex += 1
    const children: ManagedSvgNode[] = []

    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 1) {
        children.push(convertElement(child as Element))
        continue
      }

      if (child.nodeType === 3 || child.nodeType === 4) {
        const text = child.textContent ?? ''
        if (!text.trim() && !isTextContainer(tagName)) continue
        if (!isTextContainer(tagName)) {
          throw new Error(`<${tagName}> 中包含不支持的文本内容`)
        }
        children.push({ kind: 'text', text })
        continue
      }

      if (child.nodeType === 8) {
        continue
      }

      throw new Error(`<${tagName}> 中包含不支持的 XML 节点`)
    }

    return {
      kind: 'element',
      tagName,
      tagId: nextManagedTagId(tagIndex),
      attributes: normalizeElementAttributes(element, tagName),
      children,
    }
  }

  const document: ManagedSvgDocument = {
    version: MANAGED_SVG_DOCUMENT_VERSION,
    root: convertElement(rootElement),
  }

  assertManagedSvgDocument(document)
  return {
    document,
    intrinsicWidth: getManagedSvgIntrinsicSize(document).width,
    intrinsicHeight: getManagedSvgIntrinsicSize(document).height,
  }
}

function assertManagedSvgAttribute(
  value: unknown,
  tagName: string,
  previousName: string | null,
  label: string,
): asserts value is ManagedSvgAttribute {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.value !== 'string') {
    throw new Error(`${label} SVG 属性无效`)
  }

  if (value.name === 'data-scada-tag' || value.name === 'style' || value.name.startsWith('on')) {
    throw new Error(`${label} SVG 属性 ${value.name} 不允许持久化`)
  }

  if (!isAllowedAttribute(tagName, value.name)) {
    throw new Error(`${label} SVG 属性 ${value.name} 不受支持`)
  }

  if (previousName !== null && previousName.localeCompare(value.name) >= 0) {
    throw new Error(`${label} SVG 属性必须按名称唯一排序`)
  }

  if (value.name === 'href' && !value.value.startsWith('#')) {
    throw new Error(`${label} href 只允许内部引用`)
  }

  assertSafeReferenceValue(value.value, `${label}.${value.name}`)
}

function assertManagedSvgElement(
  value: unknown,
  seenTagIds: Set<string>,
  label: string,
): asserts value is ManagedSvgElement {
  if (
    !isRecord(value) ||
    value.kind !== 'element' ||
    typeof value.tagName !== 'string' ||
    canonicalTagName(value.tagName) !== value.tagName ||
    typeof value.tagId !== 'string' ||
    !MANAGED_TAG_ID_PATTERN.test(value.tagId) ||
    !Array.isArray(value.attributes) ||
    !Array.isArray(value.children)
  ) {
    throw new Error(`${label} Managed SVG element 无效`)
  }

  if (seenTagIds.has(value.tagId)) {
    throw new Error(`Managed SVG tagId 重复：${value.tagId}`)
  }
  seenTagIds.add(value.tagId)

  let previousName: string | null = null
  for (const [index, attribute] of value.attributes.entries()) {
    assertManagedSvgAttribute(attribute, value.tagName, previousName, `${label}.attributes[${index}]`)
    previousName = attribute.name
  }

  for (const [index, child] of value.children.entries()) {
    if (isRecord(child) && child.kind === 'text') {
      if (typeof child.text !== 'string' || !isTextContainer(value.tagName)) {
        throw new Error(`${label}.children[${index}] SVG text node 无效`)
      }
      continue
    }
    assertManagedSvgElement(child, seenTagIds, `${label}.children[${index}]`)
  }
}

export function assertManagedSvgDocument(value: unknown): asserts value is ManagedSvgDocument {
  if (!isRecord(value) || value.version !== MANAGED_SVG_DOCUMENT_VERSION) {
    throw new Error('Managed SVG document 无效')
  }

  const seenTagIds = new Set<string>()
  assertManagedSvgElement(value.root, seenTagIds, 'ManagedSvg.root')

  if (value.root.tagName !== 'svg') {
    throw new Error('Managed SVG root 必须是 svg')
  }

  collectSourceIdsAndReferences(value.root)
}

function escapeXmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeXmlText(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function serializeManagedSvgNode(node: ManagedSvgNode, root: boolean): string {
  if (node.kind === 'text') {
    return escapeXmlText(node.text)
  }

  const attributes = [
    ...(root ? [`xmlns="${SVG_NAMESPACE}"`] : []),
    `data-scada-tag="${escapeXmlAttribute(node.tagId)}"`,
    ...node.attributes.map(
      (attribute) => `${attribute.name}="${escapeXmlAttribute(attribute.value)}"`,
    ),
  ]
  const open = `<${node.tagName}${attributes.length > 0 ? ` ${attributes.join(' ')}` : ''}`

  if (node.children.length === 0) {
    return `${open}/>`
  }

  return `${open}>${node.children.map((child) => serializeManagedSvgNode(child, false)).join('')}</${node.tagName}>`
}

export function serializeManagedSvgDocument(document: ManagedSvgDocument) {
  assertManagedSvgDocument(document)
  return serializeManagedSvgNode(document.root, true)
}

export function serializeManagedSvgDataUrl(document: ManagedSvgDocument) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializeManagedSvgDocument(document))}`
}

function cloneManagedSvgNode(node: ManagedSvgNode): ManagedSvgNode {
  if (node.kind === 'text') return { ...node }
  return {
    ...node,
    attributes: node.attributes.map((attribute) => ({ ...attribute })),
    children: node.children.map(cloneManagedSvgNode),
  }
}

export function cloneManagedSvgDocument(document: ManagedSvgDocument): ManagedSvgDocument {
  assertManagedSvgDocument(document)
  return {
    version: MANAGED_SVG_DOCUMENT_VERSION,
    root: cloneManagedSvgNode(document.root) as ManagedSvgElement,
  }
}
