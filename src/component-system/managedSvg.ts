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
  authorRef?: string
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
export const MANAGED_SVG_AUTHOR_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/
const RESERVED_MANAGED_SVG_AUTHOR_REF_PREFIX = 'svg-tag-'
export const SAFE_SVG_TAG_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/
export const SAFE_SVG_ATTRIBUTE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/
const SAFE_CSS_PROPERTY_NAME_PATTERN = /^-?[A-Za-z][A-Za-z0-9-]*$/
export const SAFE_RASTER_DATA_HREF_PATTERN = /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\r\n]+$/i

export const BLOCKED_SVG_TAG_NAMES = new Set([
  'script',
  'foreignobject',
  'style',
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
  'discard',
  'handler',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'canvas',
])

export function isUnsafeSvgScriptReference(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F-\u009F\s]/g, '')
  return (
    /javascript\s*:/i.test(value) ||
    /javascript:/i.test(cleaned) ||
    /vbscript\s*:/i.test(value) ||
    /vbscript:/i.test(cleaned) ||
    /data\s*:\s*text\/html/i.test(value) ||
    /data:text\/html/i.test(cleaned) ||
    /expression\s*\(/i.test(value) ||
    /expression\(/i.test(cleaned) ||
    cleaned.startsWith('//') ||
    /(?:^|\s)\/\//.test(value) ||
    /url\(\s*['"]?\/\//i.test(value) ||
    /url\(['"]?\/\//i.test(cleaned)
  )
}

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
  ['textpath', 'textPath'],
  ['title', 'title'],
  ['desc', 'desc'],
  ['mask', 'mask'],
  ['pattern', 'pattern'],
  ['marker', 'marker'],
  ['filter', 'filter'],
  ['feblend', 'feBlend'],
  ['fecolormatrix', 'feColorMatrix'],
  ['fecomponenttransfer', 'feComponentTransfer'],
  ['fecomposite', 'feComposite'],
  ['feconvolvematrix', 'feConvolveMatrix'],
  ['fediffuselighting', 'feDiffuseLighting'],
  ['fedisplacementmap', 'feDisplacementMap'],
  ['fedistantlight', 'feDistantLight'],
  ['fedropshadow', 'feDropShadow'],
  ['feflood', 'feFlood'],
  ['fefunca', 'feFuncA'],
  ['fefuncb', 'feFuncB'],
  ['fefuncg', 'feFuncG'],
  ['fefuncr', 'feFuncR'],
  ['fegaussianblur', 'feGaussianBlur'],
  ['feimage', 'feImage'],
  ['femerge', 'feMerge'],
  ['femergenode', 'feMergeNode'],
  ['femorphology', 'feMorphology'],
  ['feoffset', 'feOffset'],
  ['fepointlight', 'fePointLight'],
  ['fespecularlighting', 'feSpecularLighting'],
  ['fespotlight', 'feSpotLight'],
  ['fetile', 'feTile'],
  ['feturbulence', 'feTurbulence'],
  ['image', 'image'],
  ['switch', 'switch'],
  ['view', 'view'],
])

// These properties are normalized into first-class managed attributes because
// the current authoring/rule surface can already reason about them. Other safe
// static CSS declarations remain inside one sanitized residual style attribute
// on the same ManagedSvgDocument; they are preserved, but are not editable or
// targetable authority.
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

type NormalizedInlineStyle = {
  presentation: Map<string, string>
  passthrough: Map<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isManagedSvgAuthorRef(value: string) {
  return (
    MANAGED_SVG_AUTHOR_REF_PATTERN.test(value) &&
    !value.toLowerCase().startsWith(RESERVED_MANAGED_SVG_AUTHOR_REF_PREFIX)
  )
}

function canonicalTagName(value: string) {
  const normalized = value.trim()
  const lowerName = normalized.toLowerCase()
  if (!SAFE_SVG_TAG_NAME_PATTERN.test(normalized) || BLOCKED_SVG_TAG_NAMES.has(lowerName)) {
    return null
  }
  return CANONICAL_TAG_NAMES.get(lowerName) ?? normalized
}

function isSafeManagedAttributeName(name: string) {
  const lowerName = name.toLowerCase()
  return (
    SAFE_SVG_ATTRIBUTE_NAME_PATTERN.test(name) &&
    lowerName !== 'style' &&
    lowerName !== 'data-scada-tag' &&
    lowerName !== 'xmlns' &&
    !lowerName.startsWith('on')
  )
}

function assertSafeReferenceValue(value: string, label: string) {
  if (isUnsafeSvgScriptReference(value)) {
    throw new Error(`${label} 包含不安全脚本引用`)
  }

  if (/\b(?:https?|file|blob):/i.test(value) || /(?:^|\s)\/\//.test(value)) {
    throw new Error(`${label} 包含外部资源引用`)
  }

  const withoutInternalUrls = value.replace(/url\(\s*#[^)\s]+\s*\)/gi, '')
  if (/url\s*\(/i.test(withoutInternalUrls)) {
    throw new Error(`${label} 只允许文档内部 url(#...) 引用`)
  }
}

function assertSafeHrefValue(tagName: string, value: string, label: string) {
  if (value.startsWith('#')) return
  if ((tagName === 'image' || tagName === 'feImage') && SAFE_RASTER_DATA_HREF_PATTERN.test(value)) {
    return
  }
  throw new Error(`${label} 只允许文档内部 #... 引用或内嵌 raster data:image`)
}

function normalizeInlineStyle(value: string, label: string): NormalizedInlineStyle {
  const presentation = new Map<string, string>()
  const passthrough = new Map<string, string>()

  for (const rawDeclaration of value.split(';')) {
    const declaration = rawDeclaration.trim()
    if (!declaration) continue

    const separator = declaration.indexOf(':')
    if (separator <= 0) {
      continue
    }

    const name = declaration.slice(0, separator).trim().toLowerCase()
    const styleValue = declaration.slice(separator + 1).trim()

    if (
      !SAFE_CSS_PROPERTY_NAME_PATTERN.test(name) ||
      name.startsWith('--') ||
      !styleValue ||
      /!important/i.test(styleValue) ||
      isUnsafeSvgScriptReference(styleValue)
    ) {
      continue
    }

    try {
      assertSafeReferenceValue(styleValue, `${label} style.${name}`)
    } catch {
      continue
    }

    if (STYLE_PRESENTATION_ATTRIBUTES.has(name)) {
      presentation.set(name, styleValue)
    } else {
      passthrough.set(name, styleValue)
    }
  }

  return { presentation, passthrough }
}

function serializePassthroughStyle(style: ReadonlyMap<string, string>) {
  return [...style.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}`)
    .join(';')
}

function assertCanonicalPassthroughStyle(value: string, label: string) {
  const normalized = normalizeInlineStyle(value, label)
  if (normalized.presentation.size > 0) {
    throw new Error(`${label} style 不能持久化受控 presentation 属性`)
  }
  const canonical = serializePassthroughStyle(normalized.passthrough)
  if (!canonical || canonical !== value) {
    throw new Error(`${label} style 必须是规范化的静态 passthrough 声明`)
  }
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

    // Strip inline event handlers
    if (lowerName.startsWith('on')) {
      continue
    }

    if (lowerName === 'style') {
      inlineStyle = attribute.value
      continue
    }

    let name = rawName
    if (attribute.prefix === 'xlink' && localName === 'href') {
      name = 'href'
    } else if (attribute.namespaceURI && attribute.namespaceURI !== SVG_NAMESPACE) {
      continue
    }

    if (!isSafeManagedAttributeName(name)) {
      continue
    }

    const normalizedValue = attribute.value.trim()
    if (isUnsafeSvgScriptReference(normalizedValue)) {
      continue
    }

    if (name === 'href') {
      if (
        !normalizedValue.startsWith('#') &&
        !(
          (tagName === 'image' || tagName === 'feImage') &&
          SAFE_RASTER_DATA_HREF_PATTERN.test(normalizedValue)
        )
      ) {
        continue
      }
    }

    try {
      assertSafeReferenceValue(normalizedValue, `<${tagName}>.${name}`)
    } catch {
      continue
    }

    result.set(name, normalizedValue)
  }

  if (inlineStyle !== null) {
    const normalizedStyle = normalizeInlineStyle(inlineStyle, `<${tagName}>`)
    for (const [name, value] of normalizedStyle.presentation) {
      result.set(name, value)
    }
    const passthroughStyle = serializePassthroughStyle(normalizedStyle.passthrough)
    if (passthroughStyle) {
      result.set('style', passthroughStyle)
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
  return (
    tagName === 'text' ||
    tagName === 'tspan' ||
    tagName === 'textPath' ||
    tagName === 'title' ||
    tagName === 'desc'
  )
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

      if (attribute.name === 'href' && attribute.value.startsWith('#')) {
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
  if (rootTagName !== 'svg' || rootElement.namespaceURI !== SVG_NAMESPACE) {
    throw new Error('文件根节点必须是 SVG namespace 的 <svg>')
  }

  let tagIndex = 0

  const convertElement = (element: Element): ManagedSvgElement => {
    const tagName = canonicalTagName(element.localName)
    if (!tagName) {
      throw new Error(`SVG 包含不允许的动态/可执行元素 <${element.tagName}>`)
    }

    if (element.namespaceURI !== SVG_NAMESPACE) {
      throw new Error(`SVG 包含不支持的命名空间元素 <${element.tagName}>`)
    }

    tagIndex += 1
    const tagId = nextManagedTagId(tagIndex)
    const children: ManagedSvgNode[] = []

    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 1) {
        const childElement = child as Element
        const childTagName = canonicalTagName(childElement.localName)
        if (
          !childTagName ||
          (childElement.namespaceURI !== null && childElement.namespaceURI !== SVG_NAMESPACE)
        ) {
          continue
        }
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
      tagId,
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

  if (previousName !== null && previousName.localeCompare(value.name) >= 0) {
    throw new Error(`${label} SVG 属性必须按名称唯一排序`)
  }

  const lowerName = value.name.toLowerCase()
  if (lowerName === 'data-scada-tag' || lowerName.startsWith('on')) {
    throw new Error(`${label} SVG 属性 ${value.name} 不允许持久化`)
  }

  if (value.name === 'style') {
    assertCanonicalPassthroughStyle(value.value, label)
    return
  }

  if (!isSafeManagedAttributeName(value.name)) {
    throw new Error(`${label} SVG 属性 ${value.name} 不安全或无法持久化`)
  }

  if (value.name === 'href') {
    assertSafeHrefValue(tagName, value.value, `${label}.href`)
  }

  assertSafeReferenceValue(value.value, `${label}.${value.name}`)
}

function assertManagedSvgElement(
  value: unknown,
  seenTagIds: Set<string>,
  seenAuthorRefs: Set<string>,
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

  if (value.authorRef !== undefined) {
    if (typeof value.authorRef !== 'string' || !isManagedSvgAuthorRef(value.authorRef)) {
      throw new Error(`${label} authorRef 无效：${String(value.authorRef)}`)
    }
    if (seenAuthorRefs.has(value.authorRef)) {
      throw new Error(`Managed SVG authorRef 重复：${value.authorRef}`)
    }
    seenAuthorRefs.add(value.authorRef)
  }

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
    assertManagedSvgElement(child, seenTagIds, seenAuthorRefs, `${label}.children[${index}]`)
  }
}

export function assertManagedSvgDocument(value: unknown): asserts value is ManagedSvgDocument {
  if (!isRecord(value) || value.version !== MANAGED_SVG_DOCUMENT_VERSION) {
    throw new Error('Managed SVG document 无效')
  }

  const seenTagIds = new Set<string>()
  const seenAuthorRefs = new Set<string>()
  assertManagedSvgElement(value.root, seenTagIds, seenAuthorRefs, 'ManagedSvg.root')

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

function serializeManagedSvgNode(
  node: ManagedSvgNode,
  root: boolean,
  rootAttributeOverrides?: Map<string, string>,
): string {
  if (node.kind === 'text') {
    return escapeXmlText(node.text)
  }

  const attributeMap = new Map<string, string>()
  for (const attribute of node.attributes) {
    attributeMap.set(attribute.name, attribute.value)
  }

  if (root && rootAttributeOverrides) {
    for (const [name, value] of rootAttributeOverrides) {
      attributeMap.set(name, value)
    }
  }

  const attributes = [
    ...(root ? [`xmlns="${SVG_NAMESPACE}"`] : []),
    `data-scada-tag="${escapeXmlAttribute(node.tagId)}"`,
    ...Array.from(attributeMap.entries()).map(
      ([name, value]) => `${name}="${escapeXmlAttribute(value)}"`,
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

export function serializeManagedSvgCanvasDocument(
  document: ManagedSvgDocument,
  targetDimension = 2048,
): string {
  assertManagedSvgDocument(document)

  let viewBox = document.root.attributes.find((a) => a.name === 'viewBox')?.value.trim()
  const rawWidth = document.root.attributes.find((a) => a.name === 'width')?.value.trim()
  const rawHeight = document.root.attributes.find((a) => a.name === 'height')?.value.trim()

  let w = 0
  let h = 0

  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      w = parts[2]
      h = parts[3]
    }
  }

  if (w <= 0 || h <= 0) {
    const parsedW = parseFloat(rawWidth || '')
    const parsedH = parseFloat(rawHeight || '')
    if (parsedW > 0 && parsedH > 0) {
      w = parsedW
      h = parsedH
      if (!viewBox) {
        viewBox = `0 0 ${w} ${h}`
      }
    }
  }

  const rootOverrides = new Map<string, string>()

  if (w > 0 && h > 0) {
    const maxDim = Math.max(w, h)
    const scale = Math.min(8, Math.max(2, Math.ceil(targetDimension / maxDim)))
    const targetWidth = Math.round(w * scale)
    const targetHeight = Math.round(h * scale)

    rootOverrides.set('width', String(targetWidth))
    rootOverrides.set('height', String(targetHeight))
    if (viewBox) {
      rootOverrides.set('viewBox', viewBox)
    }
  }

  return serializeManagedSvgNode(document.root, true, rootOverrides)
}

export function serializeManagedSvgCanvasDataUrl(
  document: ManagedSvgDocument,
  targetDimension = 2048,
): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    serializeManagedSvgCanvasDocument(document, targetDimension),
  )}`
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
